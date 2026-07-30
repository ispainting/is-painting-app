import type { JobFinancialSummary, DashboardMetricsResult } from "../job-financials/types";

export type LegacyId = string | number;

export type MigrationEntityType =
  | "customer"
  | "project"
  | "employee"
  | "time_entry"
  | "expense"
  | "payment"
  | "opportunity"
  | "receipt"
  | "job_material";

export interface LegacyMaterialRecord {
  id: LegacyId;
  name: string;
  description?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  unitCost?: string | number | null;
  totalCost?: string | number | null;
  sortOrder?: number | null;
  inventoryItemLegacyId?: LegacyId | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface LegacyCustomerRecord {
  id: LegacyId;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  source?: string | null;
  leadSource?: string | null;
  referralSource?: string | null;
  status?: string | null;
  preferredCommunication?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  lastContactAt?: Date | string | null;
  nextFollowUpAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  externalId?: string | null;
}

export interface LegacyProjectRecord {
  id: LegacyId;
  customerId: LegacyId;
  opportunityId?: LegacyId | null;
  name: string;
  status?: string | null;
  jobType?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  scopeOfWork?: string | null;
  notes?: string | null;
  materialsBudget?: string | number | null;
  laborBudget?: string | number | null;
  subcontractorBudget?: string | number | null;
  equipmentBudget?: string | number | null;
  travelBudget?: string | number | null;
  otherBudget?: string | number | null;
  wcPercent?: string | number | null;
  glPercent?: string | number | null;
  overheadPercent?: string | number | null;
  markupPercent?: string | number | null;
  taxPercent?: string | number | null;
  subtotalBeforeMarkup?: string | number | null;
  totalEstimate?: string | number | null;
  contractAmount?: string | number | null;
  budgetLocked?: boolean | null;
  specialPayEnabled?: boolean | null;
  hourlyRateAdjustment?: string | number | null;
  travelPayEnabled?: boolean | null;
  defaultTravelHours?: string | number | null;
  travelRateType?: string | null;
  customTravelRate?: string | number | null;
  sentAt?: Date | string | null;
  approvedAt?: Date | string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  deletedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  externalId?: string | null;
  materials?: LegacyMaterialRecord[] | null;
}

export interface LegacyEmployeeRecord {
  id: LegacyId;
  email?: string | null;
  name: string;
  role?: "admin" | "employee" | string | null;
  phone?: string | null;
  hourlyRate?: string | number | null;
  employeeRole?: string | null;
  profilePhotoUrl?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  hireDate?: Date | string | null;
  employeeCode?: string | null;
  specialJobAdjustment?: string | number | null;
  overtimeMultiplier?: string | number | null;
  overtimeRate?: string | number | null;
  travelPayEnabled?: boolean | null;
  defaultTravelHours?: string | number | null;
  travelRateType?: string | null;
  customTravelRate?: string | number | null;
  payrollNotes?: string | null;
  skills?: string[] | null;
  languages?: string[] | null;
  isActive?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface LegacyTimeEntryRecord {
  id: LegacyId;
  projectId: LegacyId;
  employeeId: LegacyId;
  clockIn: Date | string;
  clockOut?: Date | string | null;
  hoursWorked?: string | number | null;
  grossHours?: string | number | null;
  paidHours?: string | number | null;
  breakMinutes?: number | null;
  notes?: string | null;
  notAtJobsiteReason?: string | null;
  clockInLatitude?: string | number | null;
  clockInLongitude?: string | number | null;
  clockOutLatitude?: string | number | null;
  clockOutLongitude?: string | number | null;
  clockInAccuracy?: string | number | null;
  clockOutAccuracy?: string | number | null;
  isManual?: boolean | null;
  isIslandJob?: boolean | null;
  specialPayEnabled?: boolean | null;
  hourlyRateAdjustment?: string | number | null;
  rateType?: string | null;
  travelHours?: string | number | null;
  overtimeOverride?: boolean | null;
  reviewStatus?: string | null;
  managerNotes?: string | null;
  approvedByEmployeeId?: LegacyId | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface LegacyExpenseLineItemRecord {
  id: LegacyId;
  description: string;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  total?: string | number | null;
}

export interface LegacyExpenseRecord {
  id: LegacyId;
  projectId?: LegacyId | null;
  submittedByEmployeeId: LegacyId;
  employeeId?: LegacyId | null;
  approvedByEmployeeId?: LegacyId | null;
  vendor?: string | null;
  category: string;
  amount: string | number;
  subtotal?: string | number | null;
  tax?: string | number | null;
  expenseDate: Date | string;
  description?: string | null;
  receiptUrl?: string | null;
  customerName?: string | null;
  paymentMethod?: string | null;
  paymentMethodLast4?: string | null;
  invoiceNumber?: string | null;
  receiptNumber?: string | null;
  taxDeductible?: boolean | null;
  reimbursable?: boolean | null;
  reimbursementStatus?: string | null;
  reviewStatus?: string | null;
  duplicateStatus?: string | null;
  status?: string | null;
  notes?: string | null;
  lineItems?: LegacyExpenseLineItemRecord[] | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  externalId?: string | null;
  extractedData?: unknown;
}

export interface LegacyPaymentRecord {
  id: LegacyId;
  projectId: LegacyId;
  invoiceId?: LegacyId | null;
  amount: string | number;
  dateReceived: Date | string;
  method?: string | null;
  status?: string | null;
  checkNumber?: string | null;
  bank?: string | null;
  memo?: string | null;
  attachmentUrl?: string | null;
  clearedDate?: Date | string | null;
  recordedByEmployeeId?: LegacyId | null;
  notes?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  externalId?: string | null;
}

export interface LegacyOpportunityRecord {
  id: LegacyId;
  customerId: LegacyId;
  name: string;
  pipeline?: string | null;
  stage?: string | null;
  status?: string | null;
  leadValue?: string | number | null;
  source?: string | null;
  assignedToEmployeeId?: LegacyId | null;
  notes?: string | null;
  lastStageChangedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface LegacyReceiptRecord {
  id: LegacyId;
  projectId?: LegacyId | null;
  expenseId?: LegacyId | null;
  fileName: string;
  fileUrl?: string | null;
  previewUrl?: string | null;
  mimeType?: string | null;
  category?: string | null;
  notes?: string | null;
  storagePath?: string | null;
  uploadedByEmployeeId?: LegacyId | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  externalId?: string | null;
}

export interface LegacyMigrationSource {
  customers: LegacyCustomerRecord[];
  projects: LegacyProjectRecord[];
  employees: LegacyEmployeeRecord[];
  timeEntries: LegacyTimeEntryRecord[];
  expenses: LegacyExpenseRecord[];
  payments: LegacyPaymentRecord[];
  opportunities: LegacyOpportunityRecord[];
  receipts?: LegacyReceiptRecord[];
}

export interface MigrationStageTotals {
  imported: number;
  skipped: number;
  duplicates: number;
  merged: number;
}

export interface MigrationEmployeeMergeDecision {
  canonicalLegacyId: string;
  canonicalName: string;
  mergedLegacyId: string;
  mergedName: string;
  email: string;
}

export interface MigrationEmployeeImportSummary {
  sourceEmployeeRecords: number;
  distinctUsersRepresented: number;
  createdEmployees: number;
  explicitlyMergedEmployees: number;
  unresolvedDuplicateEmailConflicts: number;
}

export interface MigrationValidationIssue {
  entityType: MigrationEntityType | "summary";
  message: string;
  legacyId?: string;
  relatedLegacyId?: string;
  severity: "error" | "warning";
}

export interface MigrationFinancialTotals {
  payrollTotal: number;
  expenseTotal: number;
  paymentTotal: number;
  historicalLaborTotal: number;
  historicalMaterialTotal: number;
}

export interface MigrationJobRecalculation {
  legacyProjectId: string;
  jobId: number;
  summary: JobFinancialSummary;
  dashboardMetrics: DashboardMetricsResult;
}

export interface MigrationReport {
  startedAt: Date;
  completedAt: Date;
  counts: Record<MigrationEntityType, MigrationStageTotals>;
  validationErrors: MigrationValidationIssue[];
  missingRelationships: MigrationValidationIssue[];
  duplicates: MigrationValidationIssue[];
  financialTotals: MigrationFinancialTotals;
  databaseCounts: Record<MigrationEntityType, number>;
  recalculatedJobs: MigrationJobRecalculation[];
  dashboardMetrics: DashboardMetricsResult | null;
  employeeMerges: MigrationEmployeeMergeDecision[];
  employeeImportSummary: MigrationEmployeeImportSummary;
  success: boolean;
  validationCompleted: boolean;
  financialEngineRecalculatedAllJobs: boolean;
  databaseReadyForProduction: boolean;
}
