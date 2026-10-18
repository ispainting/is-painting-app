import { describe, expect, it, vi } from "vitest";
import { opportunitiesRouter } from "./opportunities";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };

function callerWith(prisma: Record<string, unknown>) {
  return opportunitiesRouter.createCaller({ prisma: prisma as never, session: adminSession });
}

describe("opportunities.create duplicate guard", () => {
  function createMocks(existingOpen: { id: number; name: string } | null) {
    const tx = {
      customer: {
        findUnique: vi.fn().mockResolvedValue({ id: 10 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      opportunity: {
        findFirst: vi.fn().mockResolvedValue(existingOpen),
        create: vi.fn().mockResolvedValue({ id: 55 }),
      },
    };
    const prisma = { $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)) };
    return { prisma, tx };
  }

  const input = { customerId: 10, name: "Synthetic Opportunity", pipeline: "sales" as const, stage: "new_lead" as const };

  it("blocks when the customer already has an open non-terminal opportunity", async () => {
    const { prisma, tx } = createMocks({ id: 99, name: "Existing Lead" });
    await expect(callerWith(prisma).create(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Existing Lead"),
    });
    expect(tx.opportunity.create).not.toHaveBeenCalled();
  });

  it("allows creation when prior opportunities are terminal", async () => {
    const { prisma, tx } = createMocks(null);
    await callerWith(prisma).create(input);
    expect(tx.opportunity.create).toHaveBeenCalledTimes(1);
    const where = tx.opportunity.findFirst.mock.calls[0]?.[0].where;
    expect(where.status).toBe("open");
    expect(where.stage.notIn).toEqual(["lost", "not_qualified", "invalid_duplicate", "spam_fraud"]);
  });

  it("preserves referral attribution without overwriting existing customer values", async () => {
    const { prisma, tx } = createMocks(null);
    await callerWith(prisma).create({ ...input, source: "Referral", referralSource: "Jane D" });
    expect(tx.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ referralSource: null }, { referralSource: "" }] }),
        data: { referralSource: "Jane D" },
      })
    );
  });

  it("drops referral name when source is not Referral", async () => {
    const { prisma, tx } = createMocks(null);
    await callerWith(prisma).create({ ...input, source: "Google Ads", referralSource: "Ignored" });
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.opportunity.create.mock.calls[0]?.[0].data.referralSource).toBeUndefined();
  });

  it("requires an existing customer", async () => {
    const { prisma, tx } = createMocks(null);
    tx.customer.findUnique.mockResolvedValue(null);
    await expect(callerWith(prisma).create(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tx.opportunity.create).not.toHaveBeenCalled();
  });
});

describe("opportunities.remove guard", () => {
  function removeMocks(opportunity: unknown) {
    return {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue(opportunity),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it("deletes an empty disposable opportunity", async () => {
    const prisma = removeMocks({
      id: 5,
      name: "Empty",
      customer: { name: "Customer" },
      job: null,
      _count: { proposals: 0, automationRuns: 0 },
    });
    const result = await callerWith(prisma).remove({ id: 5 });
    expect(result).toEqual({ ok: true });
    expect(prisma.opportunity.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it("blocks when linked proposals, jobs, or automation history exist", async () => {
    const prisma = removeMocks({
      id: 5,
      name: "Linked",
      customer: { name: "Customer" },
      job: { id: 42 },
      _count: { proposals: 2, automationRuns: 1 },
    });
    await expect(callerWith(prisma).remove({ id: 5 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("2 linked proposal(s)"),
    });
    expect(prisma.opportunity.delete).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a missing opportunity", async () => {
    const prisma = removeMocks(null);
    await expect(callerWith(prisma).remove({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
