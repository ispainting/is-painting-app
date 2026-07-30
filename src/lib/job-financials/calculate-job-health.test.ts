import { describe, expect, it } from "vitest";
import { calculateJobHealth } from "./calculate-job-health";

describe("calculateJobHealth", () => {
  it("scores healthy jobs with low utilization and strong margin", () => {
    const health = calculateJobHealth({
      grossMargin: 32,
      warnings: [],
      budgetHealth: [
        {
          category: "labor",
          budgetAmount: 1000,
          actualCost: 200,
          pendingCost: 100,
          committedCost: 300,
          remainingActualBudget: 800,
          remainingCommittedBudget: 700,
          committedUtilizationPct: 30,
          status: "on_track",
        },
      ],
    });

    expect(health.overall).toBe("healthy");
    expect(health.marginHealth).toBe("strong");
    expect(health.score).toBe(100);
  });

  it("penalizes over-budget categories and negative margin", () => {
    const health = calculateJobHealth({
      grossMargin: -5,
      warnings: [
        {
          code: "over_budget_category",
          message: "Labor is over budget.",
          category: "labor",
        },
      ],
      budgetHealth: [
        {
          category: "labor",
          budgetAmount: 1000,
          actualCost: 1100,
          pendingCost: 50,
          committedCost: 1150,
          remainingActualBudget: -100,
          remainingCommittedBudget: -150,
          committedUtilizationPct: 115,
          status: "over_budget",
        },
      ],
    });

    expect(health.marginHealth).toBe("negative");
    expect(health.overall).toBe("at_risk");
    expect(health.score).toBe(47);
  });

  it("maps exact score boundaries to expected overall status buckets", () => {
    const makeHealth = (warningCount: number) =>
      calculateJobHealth({
        grossMargin: 20,
        warnings: Array.from({ length: warningCount }).map((_, index) => ({
          code: "over_budget_category" as const,
          message: `w${index}`,
          category: "labor" as const,
        })),
        budgetHealth: [],
      });

    expect(makeHealth(0).score).toBe(100);
    expect(makeHealth(0).overall).toBe("healthy");

    expect(makeHealth(7).score).toBe(79);
    expect(makeHealth(7).overall).toBe("watch");

    expect(makeHealth(14).score).toBe(58);
    expect(makeHealth(14).overall).toBe("at_risk");

    expect(makeHealth(21).score).toBe(37);
    expect(makeHealth(21).overall).toBe("critical");
  });

  it("applies margin thresholds at 0 and 15 percent boundaries", () => {
    const strong = calculateJobHealth({ grossMargin: 15, warnings: [], budgetHealth: [] });
    const thin = calculateJobHealth({ grossMargin: 0, warnings: [], budgetHealth: [] });
    const negative = calculateJobHealth({ grossMargin: -0.01, warnings: [], budgetHealth: [] });

    expect(strong.marginHealth).toBe("strong");
    expect(thin.marginHealth).toBe("thin");
    expect(negative.marginHealth).toBe("negative");
  });

  it("ignores not-enough-data warning penalty and clamps score to 0..100", () => {
    const high = calculateJobHealth({
      grossMargin: 40,
      warnings: [{ code: "not_enough_projection_data", message: "Not enough data yet." }],
      budgetHealth: [],
    });

    const low = calculateJobHealth({
      grossMargin: -10,
      warnings: Array.from({ length: 30 }).map((_, index) => ({
        code: "over_budget_category" as const,
        message: `warning-${index}`,
        category: "labor" as const,
      })),
      budgetHealth: [
        {
          category: "labor",
          budgetAmount: 1,
          actualCost: 2,
          pendingCost: 0,
          committedCost: 2,
          remainingActualBudget: -1,
          remainingCommittedBudget: -1,
          committedUtilizationPct: 200,
          status: "over_budget",
        },
      ],
    });

    expect(high.score).toBe(100);
    expect(low.score).toBe(0);
  });
});
