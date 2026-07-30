import { describe, expect, it } from "vitest";
import { buildJobFinancialSummary } from "./calculate-job-financials";

describe("buildJobFinancialSummary", () => {
  it("emits health, drilldown, timeline, budget history, and labor verification outputs", () => {
    const summary = buildJobFinancialSummary({
      context: {
        jobId: 9,
        contractAmount: 10000,
        totalEstimate: 9800,
        materialsBudget: 2000,
        laborBudget: 3000,
        subcontractorBudget: 1200,
        equipmentBudget: 800,
        travelBudget: 500,
        otherBudget: 300,
        travelPayEnabled: true,
        defaultTravelHours: 1,
        travelRateType: "regular",
        customTravelRate: null,
      },
      budgetCreatedAt: new Date("2026-07-01T00:00:00.000Z"),
      budgetChangeHistory: [
        {
          id: "audit:901",
          at: new Date("2026-07-02T00:00:00.000Z"),
          changedBy: "Admin User",
          changeSetId: "job-9-budget-1",
          field: "laborBudget",
          previousValue: 2500,
          newValue: 3000,
        },
      ],
      paymentEvents: [
        {
          id: 77,
          at: new Date("2026-07-05T00:00:00.000Z"),
          amount: 2000,
          method: "check",
        },
      ],
      expenses: [
        {
          id: 1,
          jobId: 9,
          status: "approved",
          category: "materials",
          amount: 600,
          vendor: "Paint Store",
          receiptUrl: "https://example.com/r1",
          invoiceNumber: "INV-001",
          createdAt: new Date("2026-07-03T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T01:00:00.000Z"),
        },
        {
          id: 2,
          jobId: 9,
          status: "pending",
          category: "subcontractor",
          amount: 400,
          vendor: "Sub Team",
          createdAt: new Date("2026-07-04T00:00:00.000Z"),
          updatedAt: new Date("2026-07-04T00:00:00.000Z"),
        },
      ],
      timeEntries: [
        {
          id: 11,
          jobId: 9,
          userId: 100,
          userName: "Alex",
          clockIn: new Date("2026-07-03T08:00:00.000Z"),
          reviewStatus: "approved",
          paidHours: 8,
          grossHours: null,
          hoursWorked: null,
          travelHours: null,
          rateType: "regular",
          isIslandJob: false,
          specialPayEnabled: false,
          hourlyRateAdjustment: 0,
          userHourlyRate: 25,
        },
        {
          id: 12,
          jobId: 9,
          userId: 101,
          userName: "Sam",
          clockIn: new Date("2026-07-04T08:00:00.000Z"),
          reviewStatus: "pending",
          paidHours: 4,
          grossHours: null,
          hoursWorked: null,
          travelHours: null,
          rateType: "special",
          isIslandJob: false,
          specialPayEnabled: true,
          hourlyRateAdjustment: 2,
          userHourlyRate: 25,
        },
      ],
    });

    expect(summary.health).toBeDefined();
    expect(summary.health.score).toBeGreaterThanOrEqual(0);
    expect(summary.health.score).toBeLessThanOrEqual(100);

    expect(summary.drilldown.labor.length).toBe(2);
    expect(summary.drilldown.paintMaterials.length).toBe(1);
    expect(summary.drilldown.subcontractors.length).toBe(1);

    expect(summary.timeline.some((event) => event.type === "budget_created")).toBe(true);
    expect(summary.timeline.some((event) => event.type === "budget_updated")).toBe(true);
    expect(summary.timeline.some((event) => event.type === "expense_added")).toBe(true);
    expect(summary.timeline.some((event) => event.type === "expense_updated")).toBe(true);
    expect(summary.timeline.some((event) => event.type === "receipt_linked")).toBe(true);
    expect(summary.timeline.some((event) => event.type === "subcontractor_invoice")).toBe(true);
    expect(summary.timeline.some((event) => event.type === "payment_received")).toBe(true);
    expect(new Set(summary.timeline.map((event) => event.id)).size).toBe(summary.timeline.length);

    const secondSummary = buildJobFinancialSummary({
      context: {
        jobId: 9,
        contractAmount: 10000,
        totalEstimate: 9800,
        materialsBudget: 2000,
        laborBudget: 3000,
        subcontractorBudget: 1200,
        equipmentBudget: 800,
        travelBudget: 500,
        otherBudget: 300,
        travelPayEnabled: true,
        defaultTravelHours: 1,
        travelRateType: "regular",
        customTravelRate: null,
      },
      budgetCreatedAt: new Date("2026-07-01T00:00:00.000Z"),
      budgetChangeHistory: [
        {
          id: "audit:901",
          at: new Date("2026-07-02T00:00:00.000Z"),
          changedBy: "Admin User",
          changeSetId: "job-9-budget-1",
          field: "laborBudget",
          previousValue: 2500,
          newValue: 3000,
        },
      ],
      paymentEvents: [
        {
          id: 77,
          at: new Date("2026-07-05T00:00:00.000Z"),
          amount: 2000,
          method: "check",
        },
      ],
      expenses: [
        {
          id: 1,
          jobId: 9,
          status: "approved",
          category: "materials",
          amount: 600,
          vendor: "Paint Store",
          receiptUrl: "https://example.com/r1",
          invoiceNumber: "INV-001",
          createdAt: new Date("2026-07-03T00:00:00.000Z"),
          updatedAt: new Date("2026-07-03T01:00:00.000Z"),
        },
        {
          id: 2,
          jobId: 9,
          status: "pending",
          category: "subcontractor",
          amount: 400,
          vendor: "Sub Team",
          createdAt: new Date("2026-07-04T00:00:00.000Z"),
          updatedAt: new Date("2026-07-04T00:00:00.000Z"),
        },
      ],
      timeEntries: [
        {
          id: 11,
          jobId: 9,
          userId: 100,
          userName: "Alex",
          clockIn: new Date("2026-07-03T08:00:00.000Z"),
          reviewStatus: "approved",
          paidHours: 8,
          grossHours: null,
          hoursWorked: null,
          travelHours: null,
          rateType: "regular",
          isIslandJob: false,
          specialPayEnabled: false,
          hourlyRateAdjustment: 0,
          userHourlyRate: 25,
        },
        {
          id: 12,
          jobId: 9,
          userId: 101,
          userName: "Sam",
          clockIn: new Date("2026-07-04T08:00:00.000Z"),
          reviewStatus: "pending",
          paidHours: 4,
          grossHours: null,
          hoursWorked: null,
          travelHours: null,
          rateType: "special",
          isIslandJob: false,
          specialPayEnabled: true,
          hourlyRateAdjustment: 2,
          userHourlyRate: 25,
        },
      ],
    });

    expect(secondSummary.timeline.map((event) => event.id)).toEqual(summary.timeline.map((event) => event.id));

    expect(summary.budgetChangeHistory).toHaveLength(1);
    expect(summary.budgetChangeHistory[0]?.field).toBe("laborBudget");
    expect(summary.budgetChangeHistory[0]?.changeSetId).toBe("job-9-budget-1");

    expect(summary.laborVerification.rows).toHaveLength(2);
    expect(summary.laborVerification.actualTotal).toBe(summary.actualLaborCost);
    expect(summary.laborVerification.pendingTotal).toBe(summary.pendingLaborCost);
  });

  it("keeps timeline informational-only and avoids duplicate financial costs", () => {
    const summary = buildJobFinancialSummary({
      context: {
        jobId: 10,
        contractAmount: 5000,
        totalEstimate: 5000,
        materialsBudget: 1000,
        laborBudget: 1000,
        subcontractorBudget: 1000,
        equipmentBudget: 0,
        travelBudget: 0,
        otherBudget: 0,
        travelPayEnabled: false,
        defaultTravelHours: 0,
        travelRateType: "regular",
        customTravelRate: null,
      },
      budgetChangeHistory: [
        {
          id: "audit:1001",
          at: new Date("2026-07-10T00:00:00.000Z"),
          changedBy: "Admin",
          changeSetId: "job-10-budget-1",
          field: "laborBudget",
          previousValue: 900,
          newValue: 1000,
        },
      ],
      paymentEvents: [],
      expenses: [
        {
          id: 100,
          jobId: 10,
          status: "approved",
          category: "materials",
          amount: 200,
          vendor: "One Expense",
          receiptUrl: "https://example.com/receipt",
          createdAt: new Date("2026-07-10T08:00:00.000Z"),
          updatedAt: new Date("2026-07-10T08:00:00.000Z"),
        },
        {
          id: 101,
          jobId: 10,
          status: "approved",
          category: "subcontractor",
          amount: 300,
          vendor: "Sub Vendor",
          createdAt: new Date("2026-07-10T09:00:00.000Z"),
          updatedAt: new Date("2026-07-10T09:00:00.000Z"),
        },
        {
          id: 102,
          jobId: 10,
          status: "pending",
          category: "materials",
          amount: 50,
          vendor: "Pending Vendor",
          createdAt: new Date("2026-07-10T10:00:00.000Z"),
          updatedAt: new Date("2026-07-10T10:00:00.000Z"),
        },
      ],
      timeEntries: [],
    });

    expect(summary.actualExpenseCost).toBe(200);
    expect(summary.subcontractorCost).toBe(300);
    expect(summary.pendingExpenseCost).toBe(50);

    // Receipt-linked and budget history events are timeline-only and do not affect costs.
    expect(summary.actualTotalCost).toBe(500);

    expect(summary.timeline.some((event) => event.type === "receipt_linked")).toBe(true);
    expect(summary.timeline.some((event) => event.type === "budget_updated")).toBe(true);
  });
});
