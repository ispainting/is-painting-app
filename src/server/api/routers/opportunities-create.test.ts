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
    expect(tx.opportunity.create.mock.calls[0]?.[0].data.stageHistory.create[0]).toEqual(
      expect.objectContaining({
        newStage: "new_lead",
        changedById: adminSession.userId,
      })
    );
    expect(tx.opportunity.create.mock.calls[0]?.[0].data.stageHistory.create[0]).not.toHaveProperty("recordedAt");
    const where = tx.opportunity.findFirst.mock.calls[0]?.[0].where;
    expect(where.status).toBe("open");
    expect(where.stage.notIn).toEqual(["lost", "not_qualified", "invalid_duplicate", "spam_fraud", "completed"]);
  });

  it("uses the historical lead date for the initial event, not the entry/effective date", async () => {
    const { prisma, tx } = createMocks(null);
    const leadReceivedAt = new Date("2026-07-10T04:00:00.000Z");
    await callerWith(prisma).create({
      ...input,
      leadReceivedAt,
      effectiveAt: new Date("2026-10-21T04:00:00.000Z"),
    });
    const history = tx.opportunity.create.mock.calls[0]?.[0].data.stageHistory.create[0];
    expect(history).toEqual(expect.objectContaining({ newStage: "new_lead", effectiveAt: leadReceivedAt }));
    expect(history).not.toHaveProperty("recordedAt");
    expect(tx.opportunity.create.mock.calls[0]?.[0].data.lastStageChangedAt).toEqual(leadReceivedAt);
  });

  it("records an explicitly selected historical transition separately from the initial lead date", async () => {
    const { prisma, tx } = createMocks(null);
    const leadReceivedAt = new Date("2026-07-10T04:00:00.000Z");
    const effectiveAt = new Date("2026-07-18T04:00:00.000Z");
    await callerWith(prisma).create({
      ...input,
      leadReceivedAt,
      stage: "lost",
      effectiveAt,
    });
    const history = tx.opportunity.create.mock.calls[0]?.[0].data.stageHistory.create;
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(expect.objectContaining({ newStage: "new_lead", effectiveAt: leadReceivedAt }));
    expect(history[1]).toEqual(expect.objectContaining({
      previousStage: "new_lead",
      newStage: "lost",
      effectiveAt,
    }));
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

  it("allows deleting an accidental opportunity with its initial stage-history event", async () => {
    const prisma = removeMocks({
      id: 55,
      name: "Accidental",
      customer: { name: "Customer" },
      job: null,
      _count: { proposals: 0, automationRuns: 0 },
    });
    await expect(callerWith(prisma).remove({ id: 55 })).resolves.toEqual({ ok: true });
    expect(prisma.opportunity.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 55 } });
  });

  it.each([
    ["linked Proposal", { _count: { proposals: 1, automationRuns: 0 }, job: null }],
    ["linked Job", { _count: { proposals: 0, automationRuns: 0 }, job: { id: 42 } }],
    ["protected automation data", { _count: { proposals: 0, automationRuns: 1 }, job: null }],
  ])("blocks deletion with %s", async (_label, overrides) => {
    const opportunity = Object.assign({
      id: 5,
      name: "Protected",
      customer: { name: "Customer" },
      job: null,
      _count: { proposals: 0, automationRuns: 0 },
    }, overrides);
    const prisma = removeMocks(opportunity);
    await expect(callerWith(prisma).remove({ id: 5 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(prisma.opportunity.delete).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a missing opportunity", async () => {
    const prisma = removeMocks(null);
    await expect(callerWith(prisma).remove({ id: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
