export const JOB_BUDGET_CATEGORIES = [
  "labor",
  "paint_materials",
  "equipment_tools",
  "subcontractors",
  "travel_ferry",
  "other",
] as const;

export type JobBudgetCategory = (typeof JOB_BUDGET_CATEGORIES)[number];

export type TimeReviewStatus = "pending" | "approved" | "rejected";
export type TimeRateType = "regular" | "island" | "special" | "travel" | "overtime";
export type JobTravelRateType = "regular" | "island" | "special" | "custom";

export type ExpenseStatus = "pending" | "approved" | "rejected";
export type ExpenseCategory =
  | "paint"
  | "materials"
  | "labor"
  | "tools"
  | "equipment"
  | "rentals"
  | "fuel"
  | "subcontractor"
  | "travel"
  | "ferry"
  | "payroll_related"
  | "office"
  | "advertising"
  | "insurance"
  | "vehicle"
  | "meals"
  | "other";

export interface BudgetCategoryValue {
  category: JobBudgetCategory;
  budgetAmount: number;
  notes?: string | null;
  sortOrder: number;
}

export interface JobFinancialContext {
  jobId: number;
  contractAmount: number;
  totalEstimate: number;
  materialsBudget: number;
  laborBudget: number;
  subcontractorBudget: number | null;
  equipmentBudget: number;
  travelBudget: number;
  otherBudget: number;
  travelPayEnabled: boolean;
  defaultTravelHours: number;
  travelRateType: JobTravelRateType;
  customTravelRate: number | null;
}

export interface JobExpenseRecord {
  id: number;
  jobId: number | null;
  status: ExpenseStatus;
  category: ExpenseCategory;
  amount: number;
  vendor?: string | null;
  receiptUrl?: string | null;
  invoiceNumber?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JobTimeEntryRecord {
  id: number;
  jobId: number | null;
  userId: number;
  userName?: string | null;
  clockIn: Date;
  updatedAt?: Date;
  reviewStatus: TimeReviewStatus;
  paidHours: number | null;
  grossHours: number | null;
  hoursWorked: number | null;
  travelHours: number | null;
  rateType: TimeRateType;
  isIslandJob: boolean;
  specialPayEnabled: boolean;
  hourlyRateAdjustment: number;
  userHourlyRate: number;
}

export interface JobBudgetCategoryCost {
  category: JobBudgetCategory;
  budgetAmount: number;
  actualCost: number;
  pendingCost: number;
  committedCost: number;
}

export interface JobFinancialCostSummary {
  actualLaborCost: number;
  pendingLaborCost: number;
  actualExpensesCost: number;
  pendingExpensesCost: number;
  actualSubcontractorCost: number;
  pendingSubcontractorCost: number;
  actualTotalCost: number;
  committedTotalCost: number;
}

export interface JobFinancialResult {
  revenueBase: number;
  costs: JobFinancialCostSummary;
  actualProfit: number;
  committedProfit: number;
  actualMarginPct: number;
  committedMarginPct: number;
  categoryCosts: JobBudgetCategoryCost[];
}

export interface BudgetHealthRow {
  category: JobBudgetCategory;
  budgetAmount: number;
  actualCost: number;
  pendingCost: number;
  committedCost: number;
  remainingActualBudget: number;
  remainingCommittedBudget: number;
  committedUtilizationPct: number;
  status: "on_track" | "watch" | "at_risk" | "over_budget";
}

export interface JobFinancialWarning {
  code: "not_enough_projection_data" | "over_budget_category";
  message: string;
  category?: JobBudgetCategory;
}

export interface JobFinancialCategoryBreakdownRow {
  category: JobBudgetCategory;
  budgetAmount: number;
  actualCost: number;
  pendingCost: number;
  committedCost: number;
}

export interface JobFinancialSummary {
  contractValue: number;
  totalBudget: number;
  actualLaborCost: number;
  pendingLaborCost: number;
  actualExpenseCost: number;
  pendingExpenseCost: number;
  subcontractorCost: number;
  actualTotalCost: number;
  committedTotalCost: number;
  remainingBudget: number;
  grossProfit: number;
  grossMargin: number;
  projectedFinalCost: number | null;
  projectedProfit: number | null;
  projectedMargin: number | null;
  categoryBreakdown: JobFinancialCategoryBreakdownRow[];
  budgetHealth: BudgetHealthRow[];
  warnings: JobFinancialWarning[];
  health: JobHealthSummary;
  drilldown: JobFinancialDrilldown;
  timeline: JobFinancialTimelineEvent[];
  budgetChangeHistory: JobBudgetChangeHistoryItem[];
  laborVerification: JobLaborVerificationReport;
}

export interface JobHealthSummary {
  overall: "healthy" | "watch" | "at_risk" | "critical";
  score: number;
  marginHealth: "strong" | "thin" | "negative";
  categoryHealth: Array<{
    category: JobBudgetCategory;
    status: "on_track" | "watch" | "at_risk" | "over_budget";
    utilizationPct: number;
  }>;
  warnings: JobFinancialWarning[];
}

export interface JobLaborDrilldownRow {
  timeEntryId: number;
  employee: string;
  hours: number;
  rate: number;
  payType: "regular" | "special" | "travel" | "overtime";
  totalCost: number;
  status: "approved" | "pending";
  clockIn: Date;
}

export interface JobExpenseDrilldownRow {
  expenseId: number;
  vendor: string;
  receipt: string | null;
  invoice: string | null;
  amount: number;
  status: "approved" | "pending";
  category: ExpenseCategory;
  recordedAt: Date | null;
}

export interface JobFinancialDrilldown {
  labor: JobLaborDrilldownRow[];
  paintMaterials: JobExpenseDrilldownRow[];
  equipmentTools: JobExpenseDrilldownRow[];
  subcontractors: JobExpenseDrilldownRow[];
  travelFerry: JobExpenseDrilldownRow[];
  other: JobExpenseDrilldownRow[];
}

export interface JobFinancialTimelineEvent {
  id: string;
  at: Date;
  type:
    | "budget_created"
    | "budget_updated"
    | "expense_added"
    | "expense_updated"
    | "receipt_linked"
    | "labor_approved"
    | "subcontractor_invoice"
    | "payment_received";
  title: string;
  description: string;
}

export interface JobBudgetChangeHistoryItem {
  id: string;
  at: Date;
  changedBy: string;
  changeSetId: string;
  field:
    | "laborBudget"
    | "materialsBudget"
    | "equipmentBudget"
    | "subcontractorBudget"
    | "travelBudget"
    | "otherBudget";
  previousValue: number;
  newValue: number;
}

export interface JobLaborVerificationRow {
  timeEntryId: number;
  employee: string;
  hours: number;
  rate: number;
  payType: "regular" | "special" | "travel" | "overtime";
  regular: number;
  island: number;
  travel: number;
  special: number;
  cost: number;
  status: "approved" | "pending";
}

export interface JobLaborVerificationReport {
  actualTotal: number;
  pendingTotal: number;
  rows: JobLaborVerificationRow[];
}

export interface DashboardMetricsInput {
  jobs: JobFinancialResult[];
}

export interface DashboardMetricsResult {
  revenueBaseTotal: number;
  actualCostTotal: number;
  committedCostTotal: number;
  actualProfitTotal: number;
  committedProfitTotal: number;
  actualMarginPct: number;
  committedMarginPct: number;
}
