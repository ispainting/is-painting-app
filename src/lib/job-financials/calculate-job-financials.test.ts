import { describe, expect, it } from "vitest";
import { calculateJobFinancials } from "./calculate-job-financials";

describe("calculateJobFinancials", () => {
  it("keeps actual and pending costs separate and computes committed totals", () => {
    const result = calculateJobFinancials({
      context: {
        jobId: 4,
        contractAmount: 5000,
        totalEstimate: 4800,
        materialsBudget: 800,
        laborBudget: 1000,
        subcontractorBudget: 400,
        equipmentBudget: 0,
        travelBudget: 0,
        otherBudget: 0,
        travelPayEnabled: true,
        defaultTravelHours: 1,
        travelRateType: "custom",
        customTravelRate: 25,
      },
      expenses: [
        { id: 1, jobId: 4, status: "approved", category: "materials", amount: 100 },
        { id: 2, jobId: 4, status: "pending", category: "paint", amount: 50 },
        { id: 3, jobId: 4, status: "approved", category: "subcontractor", amount: 200 },
        { id: 4, jobId: 4, status: "pending", category: "subcontractor", amount: 40 },
        { id: 5, jobId: 4, status: "approved", category: "fuel", amount: 30 },
        { id: 6, jobId: 4, status: "rejected", category: "materials", amount: 999 },
      ],
      timeEntries: [
        {
          id: 11,
          jobId: 4,
          userId: 10,
          clockIn: new Date("2026-07-20T08:00:00.000Z"),
          reviewStatus: "approved",
          paidHours: 8,
          grossHours: null,
          hoursWorked: null,
          travelHours: null,
          rateType: "regular",
          isIslandJob: false,
          specialPayEnabled: false,
          hourlyRateAdjustment: 0,
          userHourlyRate: 20,
        },
        {
          id: 12,
          jobId: 4,
          userId: 10,
          clockIn: new Date("2026-07-21T08:00:00.000Z"),
          reviewStatus: "pending",
          paidHours: 4,
          grossHours: null,
          hoursWorked: null,
          travelHours: null,
          rateType: "special",
          isIslandJob: false,
          specialPayEnabled: true,
          hourlyRateAdjustment: 2,
          userHourlyRate: 20,
        },
      ],
    });

    expect(result.costs.actualLaborCost).toBe(160);
    expect(result.costs.pendingLaborCost).toBe(88);

    expect(result.costs.actualExpensesCost).toBe(130);
    expect(result.costs.pendingExpensesCost).toBe(50);

    expect(result.costs.actualSubcontractorCost).toBe(200);
    expect(result.costs.pendingSubcontractorCost).toBe(40);

    expect(result.costs.actualTotalCost).toBe(490);
    expect(result.costs.committedTotalCost).toBe(668);

    expect(result.actualProfit).toBe(4510);
    expect(result.committedProfit).toBe(4332);
    expect(result.actualMarginPct).toBe(90.2);
    expect(result.committedMarginPct).toBe(86.64);

    const laborRow = result.categoryCosts.find((row) => row.category === "labor");
    const materialRow = result.categoryCosts.find((row) => row.category === "paint_materials");
    const subcontractorRow = result.categoryCosts.find((row) => row.category === "subcontractors");

    expect(laborRow).toMatchObject({ budgetAmount: 1000, actualCost: 160, pendingCost: 88, committedCost: 248 });
    expect(materialRow).toMatchObject({ budgetAmount: 800, actualCost: 100, pendingCost: 50, committedCost: 150 });
    expect(subcontractorRow).toMatchObject({ budgetAmount: 400, actualCost: 200, pendingCost: 40, committedCost: 240 });
  });
});
