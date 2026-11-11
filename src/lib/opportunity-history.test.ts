import { describe, expect, it, vi } from "vitest";
import { synchronizeInitialOpportunityHistory } from "./opportunity-history";

describe("synchronizeInitialOpportunityHistory", () => {
  it("corrects only the initial event and leaves its recorded time and later history untouched", async () => {
    const correctedLeadDate = new Date("2026-07-10T04:00:00.000Z");
    const initialRecordedAt = new Date("2026-10-21T14:30:00.000Z");
    const laterEvent = {
      id: 12,
      previousStage: "new_lead",
      newStage: "estimate_sent",
      effectiveAt: new Date("2026-07-18T04:00:00.000Z"),
      recordedAt: new Date("2026-10-21T14:45:00.000Z"),
    };
    const history = {
      id: 11,
      effectiveAt: new Date("2026-10-21T04:00:00.000Z"),
      recordedAt: initialRecordedAt,
    };
    const tx = {
      opportunityStageHistory: {
        findFirst: vi.fn().mockResolvedValue(history),
        update: vi.fn().mockImplementation(async ({ data }: { data: { effectiveAt: Date } }) => {
          history.effectiveAt = data.effectiveAt;
          return history;
        }),
        create: vi.fn(),
      },
    };

    await expect(synchronizeInitialOpportunityHistory(tx as never, {
      opportunityId: 5,
      leadReceivedAt: correctedLeadDate,
      changedById: 1,
    })).resolves.toBe("updated");

    expect(tx.opportunityStageHistory.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { opportunityId: 5, previousStage: null },
    }));
    expect(tx.opportunityStageHistory.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 11 },
      data: { effectiveAt: correctedLeadDate },
    });
    expect(history).toEqual(expect.objectContaining({
      effectiveAt: correctedLeadDate,
      recordedAt: initialRecordedAt,
    }));
    expect(laterEvent).toEqual(expect.objectContaining({
      effectiveAt: new Date("2026-07-18T04:00:00.000Z"),
      recordedAt: new Date("2026-10-21T14:45:00.000Z"),
    }));
    expect(tx.opportunityStageHistory.create).not.toHaveBeenCalled();
  });

  it("creates a missing initial event once, with the database supplying recordedAt", async () => {
    const leadReceivedAt = new Date("2026-07-10T04:00:00.000Z");
    let initialExists = false;
    const tx = {
      opportunityStageHistory: {
        findFirst: vi.fn().mockImplementation(async () => initialExists ? { id: 19, effectiveAt: leadReceivedAt } : null),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          initialExists = true;
          return { id: 19, ...data };
        }),
        update: vi.fn(),
      },
    };
    const input = { opportunityId: 5, leadReceivedAt, changedById: 1 };

    await expect(synchronizeInitialOpportunityHistory(tx as never, input)).resolves.toBe("created");
    await expect(synchronizeInitialOpportunityHistory(tx as never, input)).resolves.toBe("unchanged");

    expect(tx.opportunityStageHistory.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        opportunityId: 5,
        previousStage: null,
        newStage: "new_lead",
        effectiveAt: leadReceivedAt,
        changedById: 1,
        reason: "Initial lead received",
      },
    });
    expect(tx.opportunityStageHistory.create.mock.calls[0]?.[0].data).not.toHaveProperty("recordedAt");
  });

  it("does not invent a business date when the lead date is absent", async () => {
    const tx = {
      opportunityStageHistory: {
        findFirst: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    };

    await expect(synchronizeInitialOpportunityHistory(tx as never, {
      opportunityId: 5,
      leadReceivedAt: null,
      changedById: 1,
    })).resolves.toBe("unchanged");
    expect(tx.opportunityStageHistory.findFirst).not.toHaveBeenCalled();
  });
});
