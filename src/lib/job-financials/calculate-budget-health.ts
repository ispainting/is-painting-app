import { percent, round2 } from "./money";
import type { BudgetHealthRow, JobBudgetCategoryCost } from "./types";

function deriveStatus(committed: number, budget: number): BudgetHealthRow["status"] {
  if (budget <= 0) {
    return committed > 0 ? "over_budget" : "on_track";
  }

  const utilizationPct = (committed / budget) * 100;
  if (utilizationPct >= 100) return "over_budget";
  if (utilizationPct >= 90) return "at_risk";
  if (utilizationPct >= 75) return "watch";
  return "on_track";
}

export function calculateBudgetHealth(categoryCosts: JobBudgetCategoryCost[]): BudgetHealthRow[] {
  return categoryCosts.map((row) => {
    const remainingActualBudget = round2(row.budgetAmount - row.actualCost);
    const remainingCommittedBudget = round2(row.budgetAmount - row.committedCost);

    return {
      category: row.category,
      budgetAmount: round2(row.budgetAmount),
      actualCost: round2(row.actualCost),
      pendingCost: round2(row.pendingCost),
      committedCost: round2(row.committedCost),
      remainingActualBudget,
      remainingCommittedBudget,
      committedUtilizationPct: percent(row.committedCost, row.budgetAmount),
      status: deriveStatus(row.committedCost, row.budgetAmount),
    };
  });
}
