import { describe, expect, it } from "vitest";
import { buildBudgetAuditRows, parseBudgetHistoryItem } from "./budget-history";

describe("migration budget-history helpers", () => {
  it("only emits rows for changed fields and keeps values decimal-safe", () => {
    const rows = buildBudgetAuditRows({
      userId: 1,
      jobId: 2,
      changeSetId: "change-1",
      previousBudgets: {
        laborBudget: 100,
        materialsBudget: 100,
        equipmentBudget: 100,
        subcontractorBudget: 100,
        travelBudget: 100,
        otherBudget: 100,
      },
      nextBudgets: {
        laborBudget: 120,
        materialsBudget: 100,
        equipmentBudget: 100,
        subcontractorBudget: 100,
        travelBudget: 100,
        otherBudget: 100,
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toMatchObject({ field: "laborBudget", value: "100.00", changeSetId: "change-1" });
    expect(rows[0]?.after).toMatchObject({ field: "laborBudget", value: "120.00", changeSetId: "change-1" });
  });

  it("parses audit rows with actor and timestamps", () => {
    const item = parseBudgetHistoryItem({
      id: 99,
      userId: 7,
      createdAt: new Date("2026-07-22T12:00:00.000Z"),
      before: { field: "travelBudget", value: "0.10", changeSetId: "change-2" },
      after: { field: "travelBudget", value: "0.30", changeSetId: "change-2" },
      user: { name: "Admin" },
    });

    expect(item?.id).toBe("audit:99");
    expect(item?.changedBy).toBe("Admin");
    expect(item?.changeSetId).toBe("change-2");
    expect(item?.previousValue).toBe(0.1);
    expect(item?.newValue).toBe(0.3);
    expect(item?.at.toISOString()).toBe("2026-07-22T12:00:00.000Z");
  });
});
