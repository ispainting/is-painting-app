import type { MigrationEntityType, MigrationFinancialTotals, MigrationReport, MigrationStageTotals, MigrationValidationIssue } from "./types";

export const MIGRATION_ENTITY_TYPES: MigrationEntityType[] = [
  "customer",
  "project",
  "employee",
  "time_entry",
  "expense",
  "payment",
  "opportunity",
  "receipt",
  "job_material",
];

export function createEmptyStageTotals(): MigrationStageTotals {
  return { imported: 0, skipped: 0, duplicates: 0, merged: 0 };
}

export function createEmptyFinancialTotals(): MigrationFinancialTotals {
  return {
    payrollTotal: 0,
    expenseTotal: 0,
    paymentTotal: 0,
    historicalLaborTotal: 0,
    historicalMaterialTotal: 0,
  };
}

export function createEmptyMigrationReport(startedAt: Date): MigrationReport {
  return {
    startedAt,
    completedAt: startedAt,
    counts: {
      customer: createEmptyStageTotals(),
      project: createEmptyStageTotals(),
      employee: createEmptyStageTotals(),
      time_entry: createEmptyStageTotals(),
      expense: createEmptyStageTotals(),
      payment: createEmptyStageTotals(),
      opportunity: createEmptyStageTotals(),
      receipt: createEmptyStageTotals(),
      job_material: createEmptyStageTotals(),
    },
    validationErrors: [],
    missingRelationships: [],
    duplicates: [],
    financialTotals: createEmptyFinancialTotals(),
    databaseCounts: {
      customer: 0,
      project: 0,
      employee: 0,
      time_entry: 0,
      expense: 0,
      payment: 0,
      opportunity: 0,
      receipt: 0,
      job_material: 0,
    },
    recalculatedJobs: [],
    dashboardMetrics: null,
    employeeMerges: [],
    employeeImportSummary: {
      sourceEmployeeRecords: 0,
      distinctUsersRepresented: 0,
      createdEmployees: 0,
      explicitlyMergedEmployees: 0,
      unresolvedDuplicateEmailConflicts: 0,
    },
    success: false,
    validationCompleted: false,
    financialEngineRecalculatedAllJobs: false,
    databaseReadyForProduction: false,
  };
}

export function pushValidationIssue(report: MigrationReport, issue: MigrationValidationIssue) {
  report.validationErrors.push(issue);
  if (issue.message.toLowerCase().includes("missing relationship") || issue.message.toLowerCase().includes("orphan")) {
    report.missingRelationships.push(issue);
  }
}
