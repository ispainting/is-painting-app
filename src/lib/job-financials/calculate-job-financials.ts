import { mapExpenseCategoryToBudgetCategory } from "./category-mapping";
import { calculateBudgetHealth } from "./calculate-budget-health";
import { calculateJobHealth } from "./calculate-job-health";
import { calculateLaborCost, calculateLaborVerificationReport } from "./labor-cost";
import { percent, round2, toMoney } from "./money";
import { JOB_BUDGET_CATEGORIES } from "./types";
import type {
  JobBudgetChangeHistoryItem,
  JobExpenseDrilldownRow,
  JobFinancialCategoryBreakdownRow,
  JobFinancialSummary,
  JobFinancialTimelineEvent,
  JobFinancialWarning,
  JobBudgetCategory,
  JobBudgetCategoryCost,
  JobFinancialDrilldown,
  JobExpenseRecord,
  JobFinancialContext,
  JobFinancialResult,
  JobTimeEntryRecord,
} from "./types";

function budgetMapFromContext(context: JobFinancialContext): Map<JobBudgetCategory, number> {
  const map = new Map<JobBudgetCategory, number>();

  map.set("labor", toMoney(context.laborBudget));
  map.set("paint_materials", toMoney(context.materialsBudget));
  map.set("equipment_tools", toMoney(context.equipmentBudget));
  map.set("subcontractors", toMoney(context.subcontractorBudget ?? 0));
  map.set("travel_ferry", toMoney(context.travelBudget));
  map.set("other", toMoney(context.otherBudget));

  return map;
}

function isExpenseActual(expense: JobExpenseRecord): boolean {
  return expense.status === "approved";
}

function isExpensePending(expense: JobExpenseRecord): boolean {
  return expense.status === "pending";
}

function isExpenseIncluded(expense: JobExpenseRecord): boolean {
  return expense.jobId != null && expense.status !== "rejected";
}

function isExpenseForDrilldown(expense: JobExpenseRecord): expense is JobExpenseRecord & { status: "approved" | "pending" } {
  return expense.status === "approved" || expense.status === "pending";
}

function isTimeEntryForDrilldown(
  entry: JobTimeEntryRecord
): entry is JobTimeEntryRecord & { reviewStatus: "approved" | "pending" } {
  return entry.reviewStatus === "approved" || entry.reviewStatus === "pending";
}

export function calculateJobFinancials(args: {
  context: JobFinancialContext;
  expenses: JobExpenseRecord[];
  timeEntries: JobTimeEntryRecord[];
}): JobFinancialResult {
  const { context } = args;
  const budgetMap = budgetMapFromContext(context);

  const labor = calculateLaborCost(context, args.timeEntries.filter((entry) => entry.jobId === context.jobId));

  const categoryCosts = new Map<JobBudgetCategory, { actual: number; pending: number }>();
  for (const category of JOB_BUDGET_CATEGORIES) {
    categoryCosts.set(category, { actual: 0, pending: 0 });
  }

  for (const expense of args.expenses) {
    if (!isExpenseIncluded(expense)) continue;
    if (expense.jobId !== context.jobId) continue;

    const mapped = mapExpenseCategoryToBudgetCategory(expense.category);
    const row = categoryCosts.get(mapped)!;

    if (isExpenseActual(expense)) {
      row.actual += toMoney(expense.amount);
    } else if (isExpensePending(expense)) {
      row.pending += toMoney(expense.amount);
    }
  }

  const laborBucket = categoryCosts.get("labor")!;
  laborBucket.actual += labor.actualLaborCost;
  laborBucket.pending += labor.pendingLaborCost;

  const categoryRows: JobBudgetCategoryCost[] = JOB_BUDGET_CATEGORIES.map((category) => {
    const row = categoryCosts.get(category)!;
    const budgetAmount = budgetMap.get(category) ?? 0;
    const actualCost = round2(row.actual);
    const pendingCost = round2(row.pending);
    const committedCost = round2(actualCost + pendingCost);

    return {
      category,
      budgetAmount: round2(budgetAmount),
      actualCost,
      pendingCost,
      committedCost,
    };
  });

  const actualSubcontractorCost = categoryRows.find((row) => row.category === "subcontractors")?.actualCost ?? 0;
  const pendingSubcontractorCost = categoryRows.find((row) => row.category === "subcontractors")?.pendingCost ?? 0;

  const actualExpensesCost = round2(
    categoryRows
      .filter((row) => row.category !== "labor" && row.category !== "subcontractors")
      .reduce((sum, row) => sum + row.actualCost, 0)
  );

  const pendingExpensesCost = round2(
    categoryRows
      .filter((row) => row.category !== "labor" && row.category !== "subcontractors")
      .reduce((sum, row) => sum + row.pendingCost, 0)
  );

  const revenueBase = toMoney(context.contractAmount) > 0
    ? toMoney(context.contractAmount)
    : toMoney(context.totalEstimate);

  const actualTotalCost = round2(labor.actualLaborCost + actualExpensesCost + actualSubcontractorCost);
  const committedTotalCost = round2(
    actualTotalCost + labor.pendingLaborCost + pendingExpensesCost + pendingSubcontractorCost
  );

  const actualProfit = round2(revenueBase - actualTotalCost);
  const committedProfit = round2(revenueBase - committedTotalCost);

  return {
    revenueBase,
    costs: {
      actualLaborCost: round2(labor.actualLaborCost),
      pendingLaborCost: round2(labor.pendingLaborCost),
      actualExpensesCost,
      pendingExpensesCost,
      actualSubcontractorCost: round2(actualSubcontractorCost),
      pendingSubcontractorCost: round2(pendingSubcontractorCost),
      actualTotalCost,
      committedTotalCost,
    },
    actualProfit,
    committedProfit,
    actualMarginPct: percent(actualProfit, revenueBase),
    committedMarginPct: percent(committedProfit, revenueBase),
    categoryCosts: categoryRows,
  };
}

function formatCategoryName(category: JobBudgetCategory): string {
  if (category === "labor") return "Labor";
  if (category === "paint_materials") return "Paint & Materials";
  if (category === "equipment_tools") return "Equipment & Tools";
  if (category === "subcontractors") return "Subcontractors";
  if (category === "travel_ferry") return "Travel & Ferry";
  return "Other";
}

export function buildJobFinancialSummary(args: {
  context: JobFinancialContext;
  expenses: JobExpenseRecord[];
  timeEntries: JobTimeEntryRecord[];
  budgetCreatedAt?: Date;
  budgetChangeHistory?: JobBudgetChangeHistoryItem[];
  paymentEvents?: Array<{ id: number; at: Date; amount: number; method?: string | null }>;
}): JobFinancialSummary {
  const result = calculateJobFinancials({
    context: args.context,
    expenses: args.expenses,
    timeEntries: args.timeEntries,
  });

  const totalBudget = round2(
    result.categoryCosts.reduce((sum, row) => sum + toMoney(row.budgetAmount), 0)
  );

  const budgetHealth = calculateBudgetHealth(result.categoryCosts);

  const categoryBreakdown: JobFinancialCategoryBreakdownRow[] = result.categoryCosts.map((row) => ({
    category: row.category,
    budgetAmount: row.budgetAmount,
    actualCost: row.actualCost,
    pendingCost: row.pendingCost,
    committedCost: row.committedCost,
  }));

  const projectedDataAvailable =
    result.costs.pendingLaborCost > 0
    || result.costs.pendingExpensesCost > 0
    || result.costs.pendingSubcontractorCost > 0;

  const projectedFinalCost = projectedDataAvailable ? result.costs.committedTotalCost : null;
  const projectedProfit = projectedDataAvailable ? round2(result.revenueBase - result.costs.committedTotalCost) : null;
  const projectedMargin = projectedDataAvailable && projectedProfit != null
    ? percent(projectedProfit, result.revenueBase)
    : null;

  const warnings: JobFinancialWarning[] = [];
  if (!projectedDataAvailable) {
    warnings.push({
      code: "not_enough_projection_data",
      message: "Not enough data yet.",
    });
  }

  for (const row of budgetHealth) {
    if (row.status === "over_budget") {
      warnings.push({
        code: "over_budget_category",
        category: row.category,
        message: `${formatCategoryName(row.category)} is over budget.`,
      });
    }
  }

  const expenseRows: JobExpenseDrilldownRow[] = args.expenses
    .filter((expense) => expense.jobId === args.context.jobId)
    .filter(isExpenseForDrilldown)
    .map((expense) => ({
      expenseId: expense.id,
      vendor: expense.vendor || "Unknown vendor",
      receipt: expense.receiptUrl ?? null,
      invoice: expense.invoiceNumber ?? null,
      amount: round2(toMoney(expense.amount)),
      status: expense.status,
      category: expense.category,
      recordedAt: expense.createdAt ?? null,
    }));

  const categoryFromExpense = (row: JobExpenseDrilldownRow): JobBudgetCategory => mapExpenseCategoryToBudgetCategory(row.category);
  const byCategory = (category: JobBudgetCategory) => expenseRows.filter((row) => categoryFromExpense(row) === category);

  const laborVerification = calculateLaborVerificationReport(
    args.context,
    args.timeEntries.filter((entry) => entry.jobId === args.context.jobId)
  );

  const laborVerificationByEntryId = new Map(
    laborVerification.rows.map((row) => [row.timeEntryId, row])
  );

  const laborDrilldown = args.timeEntries
    .filter((entry) => entry.jobId === args.context.jobId)
    .filter(isTimeEntryForDrilldown)
    .map((entry) => {
      const reportRow = laborVerificationByEntryId.get(entry.id);
      return {
        timeEntryId: entry.id,
        employee: entry.userName || `Employee #${entry.userId}`,
        hours: round2(toMoney(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked ?? 0)),
        rate: reportRow?.rate ?? round2(toMoney(entry.userHourlyRate)),
        payType: reportRow?.payType ?? (entry.rateType === "island" ? "special" : entry.rateType),
        totalCost: reportRow ? reportRow.cost : 0,
        status: entry.reviewStatus,
        clockIn: entry.clockIn,
      };
    });

  const drilldown: JobFinancialDrilldown = {
    labor: laborDrilldown,
    paintMaterials: byCategory("paint_materials"),
    equipmentTools: byCategory("equipment_tools"),
    subcontractors: byCategory("subcontractors"),
    travelFerry: byCategory("travel_ferry"),
    other: byCategory("other"),
  };

  const timeline: JobFinancialTimelineEvent[] = [];

  if (args.context.totalEstimate > 0 || args.context.contractAmount > 0 || totalBudget > 0) {
    timeline.push({
      id: `budget:created:${args.context.jobId}`,
      at: args.budgetCreatedAt ?? new Date(0),
      type: "budget_created",
      title: "Budget created",
      description: `Initial job budget ${formatCurrencyForTimeline(totalBudget)}.`,
    });
  }

  for (const change of args.budgetChangeHistory || []) {
    timeline.push({
      id: `budget:updated:${change.id}`,
      at: change.at,
      type: "budget_updated",
      title: "Budget updated",
      description: `${change.changedBy} changed ${change.field} from ${formatCurrencyForTimeline(change.previousValue)} to ${formatCurrencyForTimeline(change.newValue)}.`,
    });
  }

  for (const expense of expenseRows) {
    const createdAt = expense.recordedAt || new Date(0);
    const sourceExpense = args.expenses.find((row) => row.id === expense.expenseId);
    const updatedAt = sourceExpense?.updatedAt ?? createdAt;

    const type = expense.category === "subcontractor" ? "subcontractor_invoice" : "expense_added";
    timeline.push({
      id: `expense:${expense.expenseId}:created`,
      at: createdAt,
      type,
      title: type === "subcontractor_invoice" ? "Subcontractor invoice" : "Expense added",
      description: `${expense.vendor} - ${formatCurrencyForTimeline(expense.amount)} - ${expense.status}`,
    });

    if (updatedAt.getTime() !== createdAt.getTime()) {
      timeline.push({
        id: `expense:${expense.expenseId}:updated`,
        at: updatedAt,
        type: "expense_updated",
        title: "Expense updated",
        description: `${expense.vendor} - ${formatCurrencyForTimeline(expense.amount)} - ${expense.status}`,
      });
    }

    if (expense.receipt) {
      timeline.push({
        id: `expense:${expense.expenseId}:receipt_linked`,
        at: updatedAt,
        type: "receipt_linked",
        title: "Receipt linked",
        description: `${expense.vendor} receipt attached.`,
      });
    }
  }

  for (const laborEvent of laborDrilldown.filter((row) => row.status === "approved")) {
    timeline.push({
      id: `labor:${laborEvent.timeEntryId}:approved`,
      at: laborEvent.clockIn,
      type: "labor_approved",
      title: "Labor approved",
      description: `${laborEvent.employee} - ${laborEvent.hours.toFixed(2)}h - ${formatCurrencyForTimeline(laborEvent.totalCost)}`,
    });
  }

  for (const payment of args.paymentEvents || []) {
    timeline.push({
      id: `payment:${payment.id}:received`,
      at: payment.at,
      type: "payment_received",
      title: "Payment received",
      description: `${formatCurrencyForTimeline(payment.amount)}${payment.method ? ` - ${payment.method}` : ""}`,
    });
  }

  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  const health = calculateJobHealth({
    budgetHealth,
    grossMargin: result.actualMarginPct,
    warnings,
  });

  return {
    contractValue: result.revenueBase,
    totalBudget,
    actualLaborCost: result.costs.actualLaborCost,
    pendingLaborCost: result.costs.pendingLaborCost,
    actualExpenseCost: result.costs.actualExpensesCost,
    pendingExpenseCost: round2(result.costs.pendingExpensesCost + result.costs.pendingSubcontractorCost),
    subcontractorCost: result.costs.actualSubcontractorCost,
    actualTotalCost: result.costs.actualTotalCost,
    committedTotalCost: result.costs.committedTotalCost,
    remainingBudget: round2(totalBudget - result.costs.committedTotalCost),
    grossProfit: result.actualProfit,
    grossMargin: result.actualMarginPct,
    projectedFinalCost,
    projectedProfit,
    projectedMargin,
    categoryBreakdown,
    budgetHealth,
    warnings,
    health,
    drilldown,
    timeline,
    budgetChangeHistory: (args.budgetChangeHistory || []).sort((a, b) => b.at.getTime() - a.at.getTime()),
    laborVerification,
  };
}

function formatCurrencyForTimeline(value: number) {
  return `$${round2(value).toFixed(2)}`;
}
