import { beforeEach, describe, expect, it, vi } from "vitest";
import { expensesRouter } from "./expenses";
import { startOfBusinessDayInMassachusetts } from "@/lib/employee-rate-resolver";
import { invalidateExpenseQueries } from "@/lib/expense-invalidation";

const mocks = vi.hoisted(() => ({ blobDelete: vi.fn() }));

vi.mock("@/lib/receipt-storage", () => ({
  getReceiptStorageProvider: () => ({ delete: mocks.blobDelete }),
}));
vi.mock("@/lib/receipt-extraction", () => ({
  buildConfidenceByField: vi.fn(),
  extractReceipt: vi.fn(),
}));
vi.mock("@/lib/receipt-extraction/workflow", () => ({
  runReceiptExtractionWorkflow: vi.fn(),
}));
vi.mock("@/lib/receipt-extraction/providers/openai-provider", () => ({
  describeOpenAiApiKeyConfiguration: vi.fn(),
}));

const adminSession = { userId: 1, role: "admin" as const, email: "admin@ispainting.com", name: "Admin" };
const employeeSession = { userId: 7, role: "employee" as const, email: "crew@ispainting.com", name: "Crew" };

function callerWith(prisma: Record<string, unknown>, session: typeof adminSession | typeof employeeSession = adminSession) {
  return expensesRouter.createCaller({ prisma: prisma as never, session });
}

beforeEach(() => {
  mocks.blobDelete.mockReset().mockResolvedValue(undefined);
});

describe("expenses.remove", () => {
  it("lets an admin delete an approved expense with its own attachments", async () => {
    const attachmentDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const expenseDelete = vi.fn().mockResolvedValue({ id: 5 });
    const tx = {
      expenseAttachment: { deleteMany: attachmentDeleteMany },
      expense: { delete: expenseDelete },
    };
    const prisma = {
      expense: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          jobId: 2,
          status: "approved",
          attachments: [{ id: 91, storagePath: "receipts/91.pdf" }],
        }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    const result = await callerWith(prisma).remove({ id: 5, jobId: 2 });

    expect(result).toEqual({ ok: true });
    expect(attachmentDeleteMany).toHaveBeenCalledWith({ where: { expenseId: 5 } });
    expect(expenseDelete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(mocks.blobDelete).toHaveBeenCalledWith("receipts/91.pdf");
  });

  it("rejects non-admin users with FORBIDDEN", async () => {
    const prisma = { expense: { findUnique: vi.fn() } };
    await expect(callerWith(prisma, employeeSession).remove({ id: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prisma.expense.findUnique).not.toHaveBeenCalled();
  });

  it("deletes only the selected expense and never touches jobs or other expenses", async () => {
    const attachmentDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const expenseDelete = vi.fn().mockResolvedValue({ id: 5 });
    // Intentionally no job/customer models: any attempt to touch them throws.
    const tx = {
      expenseAttachment: { deleteMany: attachmentDeleteMany },
      expense: { delete: expenseDelete },
    };
    const prisma = {
      expense: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, jobId: 2, status: "paid", attachments: [] }),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await callerWith(prisma).remove({ id: 5 });

    expect(attachmentDeleteMany).toHaveBeenCalledTimes(1);
    expect(attachmentDeleteMany).toHaveBeenCalledWith({ where: { expenseId: 5 } });
    expect(expenseDelete).toHaveBeenCalledTimes(1);
    expect(expenseDelete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("returns NOT_FOUND when the expense does not exist", async () => {
    const prisma = {
      expense: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    await expect(callerWith(prisma).remove({ id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Expense not found.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns a clear error when the expense belongs to another job", async () => {
    const prisma = {
      expense: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, jobId: 20, status: "approved", attachments: [] }),
      },
      $transaction: vi.fn(),
    };
    await expect(callerWith(prisma).remove({ id: 5, jobId: 2 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Expense does not belong to the supplied job.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("expenses.create", () => {
  function createTx() {
    return {
      expense: { create: vi.fn().mockResolvedValue({ id: 42 }) },
      expenseAttachment: { updateMany: vi.fn() },
      expenseLineItem: { createMany: vi.fn() },
    };
  }

  it("creates a manual expense without a receipt on the open job ID", async () => {
    const tx = createTx();
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    await callerWith(prisma).create({
      vendor: "Neves Painting",
      category: "subcontractor",
      amount: 1100,
      expenseDate: startOfBusinessDayInMassachusetts("2026-09-03"),
      jobId: 2,
      attachmentIds: [],
      lineItems: [],
    });

    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    const data = tx.expense.create.mock.calls[0]?.[0].data;
    expect(data.jobId).toBe(2);
    expect(data.receiptUrl).toBeUndefined();
    expect(tx.expenseAttachment.updateMany).not.toHaveBeenCalled();
  });

  it("stores a receipt-backed expense with the attachment download URL", async () => {
    const tx = createTx();
    const prisma = {
      expenseAttachment: {
        findMany: vi.fn().mockResolvedValue([
          { id: 91, extractionRawText: null, extractionStructured: null, extractionConfidence: null },
        ]),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await callerWith(prisma).create({
      vendor: "Neves Painting",
      category: "materials",
      amount: 25,
      expenseDate: startOfBusinessDayInMassachusetts("2026-09-03"),
      jobId: 2,
      attachmentIds: [91],
      lineItems: [],
    });

    const data = tx.expense.create.mock.calls[0]?.[0].data;
    expect(data.jobId).toBe(2);
    expect(data.receiptUrl).toContain("91");
    expect(tx.expenseAttachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [91] } },
      data: { expenseId: 42 },
    });
  });

  it("does not create a partial or duplicate expense when the insert fails", async () => {
    const tx = {
      expense: { create: vi.fn().mockRejectedValue(new Error("database unavailable")) },
      expenseAttachment: { updateMany: vi.fn() },
      expenseLineItem: { createMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    await expect(
      callerWith(prisma).create({
        vendor: "Neves Painting",
        category: "materials",
        amount: 10,
        expenseDate: new Date(),
        jobId: 2,
        attachmentIds: [],
        lineItems: [],
      })
    ).rejects.toThrow("database unavailable");

    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    expect(tx.expenseAttachment.updateMany).not.toHaveBeenCalled();
    expect(tx.expenseLineItem.createMany).not.toHaveBeenCalled();
  });
});

describe("Massachusetts business date handling", () => {
  it("keeps 09/03/2026 on September 3 instead of shifting to September 2", () => {
    const date = startOfBusinessDayInMassachusetts("2026-09-03");
    expect(date.toISOString()).toBe("2026-09-03T04:00:00.000Z");
    expect(date.toISOString().slice(0, 10)).toBe("2026-09-03");
  });

  it("round-trips winter dates without a one-day shift", () => {
    const date = startOfBusinessDayInMassachusetts("2026-01-15");
    expect(date.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(date.toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});

describe("invalidateExpenseQueries", () => {
  function mockUtils() {
    return {
      expenses: {
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
        meta: { invalidate: vi.fn() },
      },
      jobs: {
        byId: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
      business: { analytics: { invalidate: vi.fn() } },
      reports: { dashboard: { invalidate: vi.fn() } },
    };
  }

  it("invalidates expenses, the affected job, and analytics queries", () => {
    const utils = mockUtils();
    invalidateExpenseQueries(utils, 2);

    expect(utils.expenses.list.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.expenses.stats.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.expenses.meta.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.jobs.byId.invalidate).toHaveBeenCalledWith({ id: 2 });
    expect(utils.jobs.list.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.business.analytics.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.reports.dashboard.invalidate).toHaveBeenCalledTimes(1);
  });

  it("invalidates all jobs.byId queries when no job ID is known", () => {
    const utils = mockUtils();
    invalidateExpenseQueries(utils);
    expect(utils.jobs.byId.invalidate).toHaveBeenCalledWith();
  });
});
