import { describe, expect, it } from "vitest";
import { calculateBudgetHealth } from "./calculate-budget-health";

describe("calculateBudgetHealth", () => {
  it("calculates utilization and statuses from committed cost", () => {
    const rows = calculateBudgetHealth([
      {
        category: "labor",
        budgetAmount: 1000,
        actualCost: 600,
        pendingCost: 250,
        committedCost: 850,
      },
      {
        category: "subcontractors",
        budgetAmount: 500,
        actualCost: 500,
        pendingCost: 50,
        committedCost: 550,
      },
    ]);

    expect(rows[0]).toMatchObject({
      remainingActualBudget: 400,
      remainingCommittedBudget: 150,
      committedUtilizationPct: 85,
      status: "watch",
    });

    expect(rows[1]).toMatchObject({
      remainingActualBudget: 0,
      remainingCommittedBudget: -50,
      committedUtilizationPct: 110,
      status: "over_budget",
    });
  });
});
