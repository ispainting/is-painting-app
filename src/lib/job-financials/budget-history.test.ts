import { describe, expect, it } from "vitest";
import { buildBudgetAuditRows, parseBudgetHistoryItem } from "./budget-history";

describe("budget-history", () => {
  it("creates one audit row for one changed field", () => {
    const rows = buildBudgetAuditRows({
      userId: 7,
      jobId: 12,
      changeSetId: "job-12-budget-1",
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
    expect(rows[0]?.entityType).toBe("job");
    expect(rows[0]?.entityId).toBe(12);
    expect(rows[0]?.before).toMatchObject({ field: "laborBudget", value: "100.00", changeSetId: "job-12-budget-1" });
    expect(rows[0]?.after).toMatchObject({ field: "laborBudget", value: "120.00", changeSetId: "job-12-budget-1" });
  });

  it("creates multiple audit rows with one shared changeSetId for multi-field updates", () => {
    const rows = buildBudgetAuditRows({
      userId: 7,
      jobId: 14,
      changeSetId: "job-14-budget-2",
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
        materialsBudget: 130,
        equipmentBudget: 100,
        subcontractorBudget: 140,
        travelBudget: 100,
        otherBudget: 100,
      },
    });

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row: any) => (row.after as any).changeSetId)).size).toBe(1);
  });

  it("creates no rows for no-op updates", () => {
    const rows = buildBudgetAuditRows({
      userId: 7,
      jobId: 14,
      changeSetId: "job-14-budget-3",
      previousBudgets: {
        laborBudget: 100,
        materialsBudget: 100,
        equipmentBudget: 100,
        subcontractorBudget: 100,
        travelBudget: 100,
        otherBudget: 100,
      },
      nextBudgets: {
        laborBudget: 100,
        materialsBudget: 100,
        equipmentBudget: 100,
        subcontractorBudget: 100,
        travelBudget: 100,
        otherBudget: 100,
      },
    });

    expect(rows).toHaveLength(0);
  });

  it("parses history items with actor, timestamp, decimal-safe values, and field", () => {
    const item = parseBudgetHistoryItem({
      id: 88,
      userId: 3,
      createdAt: new Date("2026-07-22T12:00:00.000Z"),
      before: { field: "travelBudget", value: "0.10", changeSetId: "job-9-budget-8" },
      after: { field: "travelBudget", value: "0.30", changeSetId: "job-9-budget-8" },
      user: { name: "Taylor" },
    });

    expect(item).not.toBeNull();
    expect(item?.id).toBe("audit:88");
    expect(item?.changedBy).toBe("Taylor");
    expect(item?.at.toISOString()).toBe("2026-07-22T12:00:00.000Z");
    expect(item?.previousValue).toBe(0.1);
    expect(item?.newValue).toBe(0.3);
    expect(item?.changeSetId).toBe("job-9-budget-8");
    expect(item?.field).toBe("travelBudget");
  });
});
