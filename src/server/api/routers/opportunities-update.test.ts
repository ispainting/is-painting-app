import { describe, expect, it, vi } from "vitest";
import { opportunitiesRouter } from "./opportunities";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };

function updateMocks(initialEffectiveAt: Date, leadReceivedAt = initialEffectiveAt) {
  const initialEvent = {
    id: 11,
    effectiveAt: initialEffectiveAt,
    recordedAt: new Date("2026-10-20T14:00:00.000Z"),
    changedById: 9,
  };
  const laterEvent = {
    id: 12,
    previousStage: "new_lead",
    newStage: "service_delivery",
    effectiveAt: new Date("2026-10-15T04:00:00.000Z"),
    recordedAt: new Date("2026-10-20T14:05:00.000Z"),
  };
  const tx = {
    opportunity: {
      findUnique: vi.fn().mockResolvedValue({
        id: 5,
        customerId: 10,
        stage: "new_lead",
        status: "open",
        leadReceivedAt,
        lastStageChangedAt: initialEffectiveAt,
        outcomeReason: null,
        lostValue: null,
        proposals: [],
        job: null,
      }),
      update: vi.fn().mockResolvedValue({ id: 5 }),
    },
    customer: { findUnique: vi.fn().mockResolvedValue({ id: 10 }) },
    proposal: { findMany: vi.fn().mockResolvedValue([]) },
    opportunityStageHistory: {
      findFirst: vi.fn().mockResolvedValue(initialEvent),
      update: vi.fn().mockImplementation(async ({ data }: { data: { effectiveAt: Date } }) => {
        initialEvent.effectiveAt = data.effectiveAt;
        return initialEvent;
      }),
      create: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx, initialEvent, laterEvent };
}

describe("opportunities.update business dates", () => {
  it("updates only the initial history event when leadReceivedAt is corrected", async () => {
    const oldLeadDate = new Date("2026-10-21T04:00:00.000Z");
    const correctedDate = new Date("2026-07-10T04:00:00.000Z");
    const { prisma, tx, initialEvent, laterEvent } = updateMocks(oldLeadDate);
    const caller = opportunitiesRouter.createCaller({ prisma: prisma as never, session: adminSession });

    await caller.update({ id: 5, data: { leadReceivedAt: correctedDate, name: "Renamed project" } });

    expect(tx.opportunity.update.mock.calls[0]?.[0].data).not.toHaveProperty("stageHistory");
    expect(tx.opportunityStageHistory.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 11 },
      data: { effectiveAt: correctedDate },
    });
    expect(initialEvent.effectiveAt).toEqual(correctedDate);
    expect(laterEvent.effectiveAt).toEqual(new Date("2026-10-15T04:00:00.000Z"));
    expect(tx.opportunityStageHistory.create).not.toHaveBeenCalled();
  });

  it("repairs a pre-existing incorrect initial date on an unrelated save, preserving entry and later history dates", async () => {
    const leadReceivedAt = new Date("2026-09-15T04:00:00.000Z");
    const incorrectInitialDate = new Date("2026-10-20T04:00:00.000Z");
    const recordedAt = new Date("2026-10-20T14:00:00.000Z");
    const { prisma, tx, initialEvent, laterEvent } = updateMocks(incorrectInitialDate, leadReceivedAt);
    const caller = opportunitiesRouter.createCaller({ prisma: prisma as never, session: adminSession });

    await caller.update({ id: 5, data: { name: "Unrelated edit" } });
    await caller.update({ id: 5, data: { name: "Repeated unrelated edit" } });

    expect(tx.opportunityStageHistory.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.opportunityStageHistory.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 11 },
      data: { effectiveAt: leadReceivedAt },
    });
    expect(initialEvent).toEqual(expect.objectContaining({
      effectiveAt: leadReceivedAt,
      recordedAt,
      changedById: 9,
    }));
    expect(laterEvent.effectiveAt).toEqual(new Date("2026-10-15T04:00:00.000Z"));
    expect(laterEvent.newStage).toBe("service_delivery");
    expect(tx.opportunityStageHistory.create).not.toHaveBeenCalled();
    expect(tx.opportunity.update).toHaveBeenCalledTimes(2);
    expect(tx.opportunity.update.mock.calls.every(([args]) => !args.data.stageHistory)).toBe(true);
  });

  it("uses the explicitly selected effective date for a stage transition", async () => {
    const leadDate = new Date("2026-07-10T04:00:00.000Z");
    const selectedEffectiveAt = new Date("2026-07-18T04:00:00.000Z");
    const { prisma, tx } = updateMocks(leadDate);
    const caller = opportunitiesRouter.createCaller({ prisma: prisma as never, session: adminSession });

    await caller.update({
      id: 5,
      data: { stage: "lost", effectiveAt: selectedEffectiveAt, outcomeReason: "Price" },
    });

    const historyCreate = tx.opportunity.update.mock.calls[0]?.[0].data.stageHistory.create;
    expect(historyCreate).toEqual(expect.objectContaining({
      previousStage: "new_lead",
      newStage: "lost",
      effectiveAt: selectedEffectiveAt,
    }));
    expect(tx.opportunityStageHistory.update).not.toHaveBeenCalled();
  });
});
