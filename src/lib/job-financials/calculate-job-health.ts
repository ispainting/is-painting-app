import { round2 } from "./money";
import type { JobFinancialSummary, JobHealthSummary } from "./types";

function marginHealth(grossMargin: number): JobHealthSummary["marginHealth"] {
  if (grossMargin < 0) return "negative";
  if (grossMargin < 15) return "thin";
  return "strong";
}

function overallHealth(score: number): JobHealthSummary["overall"] {
  if (score < 40) return "critical";
  if (score < 60) return "at_risk";
  if (score < 80) return "watch";
  return "healthy";
}

export function calculateJobHealth(summary: Pick<JobFinancialSummary, "budgetHealth" | "grossMargin" | "warnings">): JobHealthSummary {
  const marginState = marginHealth(summary.grossMargin);

  const categoryHealth = summary.budgetHealth.map((row) => ({
    category: row.category,
    status: row.status,
    utilizationPct: row.committedUtilizationPct,
  }));

  const categoryPenalty = categoryHealth.reduce((sum, row) => {
    if (row.status === "over_budget") return sum + 20;
    if (row.status === "at_risk") return sum + 10;
    if (row.status === "watch") return sum + 5;
    return sum;
  }, 0);

  const marginPenalty =
    marginState === "negative"
      ? 30
      : marginState === "thin"
        ? 15
        : 0;

  const warningPenalty = summary.warnings.filter((warning) => warning.code !== "not_enough_projection_data").length * 3;

  const score = Math.max(0, Math.min(100, round2(100 - categoryPenalty - marginPenalty - warningPenalty)));

  return {
    overall: overallHealth(score),
    score,
    marginHealth: marginState,
    categoryHealth,
    warnings: summary.warnings,
  };
}
