import { describe, expect, it, vi } from "vitest";
import { customersRouter } from "./customers";
import { jobsRouter } from "./jobs";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };
const employeeSession = { userId: 7, role: "employee" as const, email: "crew@example.test", name: "Crew" };

describe("customers.remove safety", () => {
  function removeMocks(overrides: {
    customer?: unknown;
    jobIds?: number[];
    invoiceIds?: number[];
    proposalIds?: number[];
    counts?: { jobPayments?: number; invoicePayments?: number; expenses?: number; timeEntries?: number; proposalAttachments?: number; automationRuns?: number };
  }) {
    const counts = overrides.counts ?? {};
    const prisma = {
      customer: {
        findUnique: vi.fn().mockResolvedValue(
          overrides.customer === undefined
            ? {
                id: 10,
                name: "Synthetic Customer",
                deletedAt: null,
                _count: { opportunities: 0, proposals: 0, jobs: 0, invoices: 0, files: 0, reviewSubmissions: 0 },
              }
            : overrides.customer
        ),
        delete: vi.fn().mockResolvedValue({}),
      },
      job: { findMany: vi.fn().mockResolvedValue((overrides.jobIds ?? []).map((id) => ({ id }))) },
      invoice: { findMany: vi.fn().mockResolvedValue((overrides.invoiceIds ?? []).map((id) => ({ id }))) },
      proposal: { findMany: vi.fn().mockResolvedValue((overrides.proposalIds ?? []).map((id) => ({ id }))) },
      payment: {
        count: vi.fn()
          .mockResolvedValueOnce(counts.jobPayments ?? 0)
          .mockResolvedValueOnce(counts.invoicePayments ?? 0),
      },
      expense: { count: vi.fn().mockResolvedValue(counts.expenses ?? 0) },
      timeEntry: { count: vi.fn().mockResolvedValue(counts.timeEntries ?? 0) },
      proposalAttachment: { count: vi.fn().mockResolvedValue(counts.proposalAttachments ?? 0) },
      automationRun: { count: vi.fn().mockResolvedValue(counts.automationRuns ?? 0) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(prisma)),
    };
    return prisma;
  }

  it("is admin-only", async () => {
    const prisma = removeMocks({});
    await expect(
      customersRouter.createCaller({ prisma: prisma as never, session: employeeSession }).remove({ id: 10 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns NOT_FOUND for a missing or archived customer", async () => {
    const prisma = removeMocks({ customer: null });
    await expect(
      customersRouter.createCaller({ prisma: prisma as never, session: adminSession }).remove({ id: 999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks deletion when protected financial history exists", async () => {
    const prisma = removeMocks({
      customer: {
        id: 10,
        name: "Synthetic Customer",
        deletedAt: null,
        _count: { opportunities: 1, proposals: 1, jobs: 1, invoices: 2, files: 0, reviewSubmissions: 0 },
      },
      jobIds: [50],
      counts: { jobPayments: 3, expenses: 1, timeEntries: 4 },
    });
    await expect(
      customersRouter.createCaller({ prisma: prisma as never, session: adminSession }).remove({ id: 10, confirmTestGraphCleanup: true })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("2 invoice(s)"),
    });
    expect(prisma.customer.delete).not.toHaveBeenCalled();
  });

  it("permanently deletes a customer with no linked records", async () => {
    const prisma = removeMocks({});
    const result = await customersRouter.createCaller({ prisma: prisma as never, session: adminSession }).remove({ id: 10 });
    expect(result.mode).toBe("deleted");
    expect(prisma.customer.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it("requires the explicit second confirmation for a test graph", async () => {
    const prisma = removeMocks({
      customer: {
        id: 10,
        name: "Synthetic Customer",
        deletedAt: null,
        _count: { opportunities: 1, proposals: 1, jobs: 1, invoices: 0, files: 0, reviewSubmissions: 0 },
      },
      jobIds: [50],
      proposalIds: [60],
    });
    await expect(
      customersRouter.createCaller({ prisma: prisma as never, session: adminSession }).remove({ id: 10 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cleans up only the selected customer's safe test graph in one transaction", async () => {
    const prisma = removeMocks({
      customer: {
        id: 10,
        name: "Synthetic Customer",
        deletedAt: null,
        _count: { opportunities: 2, proposals: 1, jobs: 1, invoices: 0, files: 0, reviewSubmissions: 0 },
      },
      jobIds: [50],
      proposalIds: [60],
    });
    (prisma as any).job.deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    (prisma as any).proposal.deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    (prisma as any).opportunity = { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) };

    const result = await customersRouter
      .createCaller({ prisma: prisma as never, session: adminSession })
      .remove({ id: 10, confirmTestGraphCleanup: true });

    expect(result.mode).toBe("test_graph_cleanup");
    expect((prisma as any).job.deleteMany).toHaveBeenCalledWith({ where: { customerId: 10 } });
    expect((prisma as any).opportunity.deleteMany).toHaveBeenCalledWith({ where: { customerId: 10 } });
    expect(prisma.customer.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });
});

describe("jobs archive/restore/permanent-delete lifecycle", () => {
  function jobMocks(counts: { invoices?: number; payments?: number; expenses?: number; timeEntries?: number }, job: unknown = undefined) {
    return {
      job: {
        findUnique: vi.fn().mockResolvedValue(
          job === undefined
            ? { id: 1, name: "Synthetic Job", deletedAt: new Date(), _count: { invoices: 0, payments: 0, expenses: 0, timeEntries: 0, ...counts } }
            : job
        ),
        update: vi.fn().mockResolvedValue({ id: 1 }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it("restore clears deletedAt", async () => {
    const prisma = jobMocks({});
    await jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).restore({ id: 1 });
    expect(prisma.job.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { deletedAt: null } });
  });

  it("permanent delete succeeds for a zero-history job", async () => {
    const prisma = jobMocks({});
    const result = await jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).remove({ id: 1 });
    expect(result).toEqual({ ok: true });
    expect(prisma.job.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it.each([
    [{ invoices: 1 }, "invoice"],
    [{ payments: 2 }, "payment"],
    [{ expenses: 1 }, "expense"],
    [{ timeEntries: 3 }, "time entrie"],
  ] as const)("blocks permanent deletion with protected %s", async (counts, reason) => {
    const prisma = jobMocks(counts);
    await expect(
      jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).remove({ id: 1 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining(reason) });
    expect(prisma.job.delete).not.toHaveBeenCalled();
  });

  it("repeating permanent deletion returns NOT_FOUND, not a ghost row", async () => {
    const prisma = jobMocks({}, null);
    await expect(
      jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).remove({ id: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
