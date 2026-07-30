import { percent, round2, sumMoney } from "./money";
import type { DashboardMetricsInput, DashboardMetricsResult } from "./types";

export function calculateDashboardMetrics(input: DashboardMetricsInput): DashboardMetricsResult {
  const revenueBaseTotal = sumMoney(input.jobs.map((job) => job.revenueBase));
  const actualCostTotal = sumMoney(input.jobs.map((job) => job.costs.actualTotalCost));
  const committedCostTotal = sumMoney(input.jobs.map((job) => job.costs.committedTotalCost));
  const actualProfitTotal = sumMoney(input.jobs.map((job) => job.actualProfit));
  const committedProfitTotal = sumMoney(input.jobs.map((job) => job.committedProfit));

  return {
    revenueBaseTotal,
    actualCostTotal,
    committedCostTotal,
    actualProfitTotal,
    committedProfitTotal,
    actualMarginPct: percent(actualProfitTotal, revenueBaseTotal),
    committedMarginPct: percent(committedProfitTotal, revenueBaseTotal),
  };
}
