import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { MigrationImporter } from "../src/lib/migration/importer";
import { buildNormalizedExpenseSource } from "../src/lib/migration/expense-source";
import type { LegacyMigrationSource } from "../src/lib/migration/types";

class DryRunRollback extends Error {
  constructor() {
    super("DRY_RUN_ROLLBACK");
  }
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function roundTotals(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, roundMoney(value)]));
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function countRelevant(prisma: PrismaClient) {
  return {
    Expense: await prisma.expense.count(),
    ExpenseAttachment: await prisma.expenseAttachment.count(),
    ExpenseReceiptUpload: await prisma.expenseReceiptUpload.count(),
    MigrationMap: await prisma.migrationMap.count(),
    Job: await prisma.job.count(),
    User: await prisma.user.count(),
  };
}

async function main() {
  const workspaceRoot = process.cwd();
  const legacySourcePath = path.resolve(workspaceRoot, "data/legacy-export/import-source.json");
  const legacyExpensesPath = path.resolve(workspaceRoot, "data/legacy-export/expenses.json");
  const normalizedSourcePath = path.resolve(workspaceRoot, "data/import-source.expenses.preview.json");
  const reportPath = path.resolve(workspaceRoot, "data/import-report.expenses.preview.dryrun.json");

  const baseSource = await loadJson<LegacyMigrationSource>(legacySourcePath);
  const rawExpenses = await loadJson<Array<Record<string, any>>>(legacyExpensesPath);
  const importedProjectIds = new Set(baseSource.projects.map((project) => String(project.id)));
  const importedEmployeeIds = new Set(baseSource.employees.map((employee) => String(employee.id)));
  const normalized = buildNormalizedExpenseSource(rawExpenses, importedProjectIds, importedEmployeeIds);

  const normalizedSource: LegacyMigrationSource = {
    ...baseSource,
    expenses: normalized.expenses,
    payments: [],
    opportunities: [],
    receipts: [],
  };

  await fs.writeFile(normalizedSourcePath, JSON.stringify(normalizedSource, null, 2), "utf8");

  const prisma = new PrismaClient();
  const beforeCounts = await countRelevant(prisma);
  let migrationReport: any = null;

  try {
    await prisma.$transaction(async (tx) => {
      const importer = new MigrationImporter(tx, normalizedSource);
      migrationReport = await importer.run();
      throw new DryRunRollback();
    }, { maxWait: 60000, timeout: 600000 });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) {
      throw error;
    }
  }

  if (!migrationReport) {
    throw new Error("Dry-run did not produce a migration report.");
  }

  const reportData = migrationReport;

  const afterCounts = await countRelevant(prisma);
  await prisma.$disconnect();

  const rollbackVerified = JSON.stringify(beforeCounts) === JSON.stringify(afterCounts);
  const sourceTotalAmount = normalized.audit.totalAmount;
  const normalizedExpenseTotalAmount = normalized.audit.importableCount === 0
    ? 0
    : normalized.expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceInspection: {
      filePath: path.relative(workspaceRoot, legacyExpensesPath),
      canonicalSource: true,
      actualRowCount: rawExpenses.length,
      expectedRowCount: 421,
      sourceCountMismatch: rawExpenses.length !== 421,
      originalFileUnchanged: true,
      fields: Object.keys(rawExpenses[0] ?? {}).sort(),
    },
    sourceAudit: {
      ...normalized.audit,
      sourceCount: rawExpenses.length,
      validCount: normalized.audit.importableCount,
      skippedCount: rawExpenses.length - normalized.audit.importableCount,
    },
    sourceToSchemaMapping: {
      legacyId: "expense_id -> MigrationMap.expense.legacyId",
      jobId: "project_id -> Expense.jobId (nullable; unresolved references reported separately)",
      submittedById: "submitted_by_id -> Expense.submittedById",
      approvedById: "approved_by_id -> Expense.approvedById",
      vendor: "vendor -> Expense.vendor",
      description: "description -> Expense.description",
      category: "category -> Expense.category via normalizeExpenseCategory",
      amount: "amount -> Expense.amount",
      expenseDate: "expense_date -> Expense.expenseDate",
      status: "status -> Expense.status and Expense.reviewStatus mapping",
      receiptUrl: "receipt_url -> Expense.receiptUrl",
      receiptMetadata: "extracted_data -> Expense.extractedData (parsed JSON)",
      notes: "notes -> Expense.notes",
      createdAt: "created_at -> Expense.createdAt",
      updatedAt: "updated_at -> Expense.updatedAt",
      paymentMethod: "not present in source export",
      reimbursementStatus: "not present in source export; defaults to not_applicable",
    },
    normalizedPayload: {
      path: path.relative(workspaceRoot, normalizedSourcePath),
      expenseCount: normalized.expenses.length,
      includedLegacyIds: normalized.expenses.slice(0, 10).map((expense) => expense.id),
    },
    validation: {
      duplicateIds: normalized.audit.duplicateIds,
      invalidAmounts: normalized.audit.invalidAmounts,
      invalidDates: normalized.audit.invalidDates,
      missingJobReferences: normalized.audit.missingJobReferences,
      missingEmployeeReferences: normalized.audit.missingEmployeeReferences,
      unknownCategories: normalized.audit.unknownCategories,
      unsupportedStatuses: normalized.audit.unsupportedStatuses,
      receiptMetadataCount: normalized.audit.receiptMetadataCount,
      receiptMetadataWithoutAvailableFile: rawExpenses
        .filter((expense) => expense.receipt_url || expense.extracted_data)
        .map((expense) => ({
          legacyId: String(expense.expense_id),
          receiptUrl: expense.receipt_url ?? null,
          hasParsedMetadata: Boolean(expense.extracted_data),
          reason: "Receipt files are not imported in this phase; metadata is preserved for the later Receipts migration.",
        })),
    },
    expectedImportableExpenses: normalized.expenses.length,
    totalExpenseAmount: Number(sourceTotalAmount.toFixed(2)),
    totalExpenseAmountImportable: Number(normalizedExpenseTotalAmount.toFixed(2)),
    expenseTotalsByCategory: Object.fromEntries(Object.entries(normalized.audit.totalsByCategory).sort((a, b) => b[1] - a[1])),
    expenseTotalsByJob: roundTotals(Object.fromEntries(Object.entries(normalized.audit.totalsByJob).sort((a, b) => b[1] - a[1]))),
    approvalStatusMappingSummary: normalized.audit.approvalStatusSummary,
    reimbursementStatusMappingSummary: normalized.audit.reimbursementStatusSummary,
    categoryMappingSummary: normalized.audit.categoryMappingSummary,
    importerReport: reportData,
    financialReconciliation: {
      sourceExpenseTotals: {
        totalAmount: Number(sourceTotalAmount.toFixed(2)),
      },
      simulatedRecalculatedFinancialTotals: {
        payrollTotal: roundMoney(reportData.financialTotals.payrollTotal),
        expenseTotal: roundMoney(reportData.financialTotals.expenseTotal),
        paymentTotal: roundMoney(reportData.financialTotals.paymentTotal),
        historicalLaborTotal: roundMoney(reportData.financialTotals.historicalLaborTotal),
        historicalMaterialTotal: roundMoney(reportData.financialTotals.historicalMaterialTotal),
        actualProfitTotal: roundMoney(reportData.dashboardMetrics?.actualProfitTotal ?? 0),
        actualMarginPct: roundMoney(reportData.dashboardMetrics?.actualMarginPct ?? 0),
      },
      affectedJobs: reportData.recalculatedJobs.length,
    },
    rollbackVerification: {
      beforeCounts,
      afterCounts,
      rollbackVerified,
    },
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ reportPath: path.relative(workspaceRoot, reportPath), rollbackVerified }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});