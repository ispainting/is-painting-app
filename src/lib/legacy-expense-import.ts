import { ExpenseCategory, ExpenseStatus, Prisma } from "@prisma/client";

export type LegacyExpenseImportClassification =
  | "imported"
  | "imported_with_unresolved_submitter";

export type LegacyExpenseImportRowStatus = "planned" | "already_imported";

export type LegacyExpenseSourceRow = {
  legacyExpenseId: string | number;
  amount: string | number;
  expenseDate: string | Date;
  category: ExpenseCategory;
  submittedByLegacyId: string | number;
  submittedByLegacyName?: string | null;
  projectReference?: string | number | null;
  vendor?: string | null;
  description?: string | null;
  notes?: string | null;
  paymentMethod?: string | null;
  receiptNumber?: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  subtotal?: string | number | null;
  tax?: string | number | null;
  status?: ExpenseStatus;
  sourceMetadata?: Prisma.InputJsonValue | null;
  receiptMetadata?: Prisma.InputJsonValue | null;
};

export type LegacyExpenseImportMetadata = {
  importSource: "legacy-expense";
  legacyExpenseId: string;
  legacySubmittedById: string | null;
  legacySubmittedByName: string | null;
  legacyProjectReference: string | null;
  classification: LegacyExpenseImportClassification;
  sourceMetadata: Prisma.InputJsonValue | null;
  receiptMetadata: Prisma.InputJsonValue | null;
};

export type PlannedLegacyExpense = {
  legacyExpenseId: string;
  classification: LegacyExpenseImportClassification;
  expense: {
    vendor: string | null;
    expenseDate: Date;
    description: string | null;
    amount: string;
    subtotal: string | null;
    tax: string | null;
    category: ExpenseCategory;
    paymentMethod: string | null;
    receiptNumber: string | null;
    invoiceNumber: string | null;
    customerName: string | null;
    jobId: number | null;
    submittedById: number | null;
    legacySubmittedById: string | null;
    legacySubmittedByName: string | null;
    notes: string | null;
    status: ExpenseStatus;
    extractedData: LegacyExpenseImportMetadata;
  };
  sourceRow: LegacyExpenseSourceRow;
};

export type LegacyExpenseImportRowResult = {
  legacyExpenseId: string;
  status: LegacyExpenseImportRowStatus;
  classification: LegacyExpenseImportClassification;
  amount: string;
  jobId: number | null;
  submittedById: number | null;
  legacySubmittedById: string | null;
  legacySubmittedByName: string | null;
  preservedReceiptMetadata: boolean;
  silentSkip: false;
  existingExpenseId?: number;
  plannedExpense?: PlannedLegacyExpense;
};

export type LegacyExpenseImportSummary = {
  sourceRows: number;
  accountedRows: number;
  simulatedImportedExpenses: number;
  alreadyImportedExpenses: number;
  silentSkips: 0;
  linkedImportableExpenses: number;
  unresolvedSubmitterImports: number;
  unlinkedGeneralExpenses: number;
  duplicateLegacyExpenseIds: number;
  invalidNonEmptyProjectReferences: number;
  sourceTotal: string;
  simulatedImportedTotal: string;
  receiptMetadataPreserved: number;
};

export type LegacyExpenseImportPlan = {
  summary: LegacyExpenseImportSummary;
  plannedExpenses: PlannedLegacyExpense[];
  alreadyImported: Array<{ legacyExpenseId: string; expenseId: number }>;
  rowResults: LegacyExpenseImportRowResult[];
};

export type LegacyExpenseDryRunReport = LegacyExpenseImportSummary & {
  rollbackConfirmed: boolean;
  liveDatabaseCountsUnchanged: boolean;
};

export class MigrationMap {
  private readonly expenseIds = new Map<string, number>();

  constructor(entries?: Iterable<[string, number]>) {
    if (!entries) return;
    for (const [legacyExpenseId, expenseId] of entries) {
      this.expenseIds.set(String(legacyExpenseId).trim(), expenseId);
    }
  }

  getExpenseId(legacyExpenseId: string) {
    return this.expenseIds.get(legacyExpenseId);
  }

  hasExpense(legacyExpenseId: string) {
    return this.expenseIds.has(legacyExpenseId);
  }

  rememberExpense(legacyExpenseId: string, expenseId: number) {
    this.expenseIds.set(legacyExpenseId, expenseId);
  }
}

type LegacyExpenseImportOptions = {
  jobIdByProjectReference: Readonly<Record<string, number>>;
  submittedByIdByLegacyId: Readonly<Record<string, number>>;
  migrationMap?: MigrationMap;
  defaultStatus?: ExpenseStatus;
};

function normalizeNullableString(value: string | number | null | undefined) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toRequiredAmountString(
  value: string | number | null | undefined,
  fieldName: string,
  legacyExpenseId: string,
): string {
  const amount = toAmountString(value, fieldName, legacyExpenseId, false);
  if (amount == null) {
    throw new Error(`Legacy expense ${legacyExpenseId} has an invalid ${fieldName}.`);
  }
  return amount;
}

function toOptionalAmountString(
  value: string | number | null | undefined,
  fieldName: string,
  legacyExpenseId: string,
): string | null {
  return toAmountString(value, fieldName, legacyExpenseId, true);
}

function toAmountString(
  value: string | number | null | undefined,
  fieldName: string,
  legacyExpenseId: string,
  allowNull: boolean,
): string | null {
  if (value == null || value === "") {
    if (allowNull) return null;
    throw new Error(`Legacy expense ${legacyExpenseId} has an invalid ${fieldName}.`);
  }

  const parsed = typeof value === "number"
    ? value
    : Number(String(value).replaceAll(",", "").replaceAll("$", "").trim());

  if (!Number.isFinite(parsed) || parsed < 0 || (!allowNull && parsed <= 0)) {
    throw new Error(`Legacy expense ${legacyExpenseId} has an invalid ${fieldName}.`);
  }

  return parsed.toFixed(2);
}

function toExpenseDate(value: string | Date, legacyExpenseId: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Legacy expense ${legacyExpenseId} has an invalid expense date.`);
  }
  return date;
}

function assertNoDuplicateLegacyExpenseIds(sourceRows: readonly LegacyExpenseSourceRow[]) {
  const seen = new Set<string>();
  for (const row of sourceRows) {
    const legacyExpenseId = normalizeNullableString(row.legacyExpenseId);
    if (!legacyExpenseId) {
      throw new Error("Encountered a malformed legacy expense record with no legacy expense id.");
    }
    if (seen.has(legacyExpenseId)) {
      throw new Error(`Duplicate legacy expense id detected: ${legacyExpenseId}.`);
    }
    seen.add(legacyExpenseId);
  }
}

export function buildLegacyExpenseImportPlan(
  sourceRows: readonly LegacyExpenseSourceRow[],
  options: LegacyExpenseImportOptions,
): LegacyExpenseImportPlan {
  assertNoDuplicateLegacyExpenseIds(sourceRows);

  const migrationMap = options.migrationMap ?? new MigrationMap();
  const plannedExpenses: PlannedLegacyExpense[] = [];
  const alreadyImported: Array<{ legacyExpenseId: string; expenseId: number }> = [];
  const rowResults: LegacyExpenseImportRowResult[] = [];

  let linkedImportableExpenses = 0;
  let unresolvedSubmitterImports = 0;
  let unlinkedGeneralExpenses = 0;
  let receiptMetadataPreserved = 0;
  let sourceTotal = 0;
  let simulatedImportedTotal = 0;

  for (const row of sourceRows) {
    const legacyExpenseId = normalizeNullableString(row.legacyExpenseId);
    const submittedByLegacyId = normalizeNullableString(row.submittedByLegacyId);
    if (!legacyExpenseId || !submittedByLegacyId) {
      throw new Error("Encountered a malformed legacy expense record with no submitter id.");
    }

    const amount = toRequiredAmountString(row.amount, "amount", legacyExpenseId);
    const subtotal = toOptionalAmountString(row.subtotal, "subtotal", legacyExpenseId);
    const tax = toOptionalAmountString(row.tax, "tax", legacyExpenseId);
    const expenseDate = toExpenseDate(row.expenseDate, legacyExpenseId);
    const projectReference = normalizeNullableString(row.projectReference);
    const submittedByLegacyName = normalizeNullableString(row.submittedByLegacyName);
    const preservedReceiptMetadata = row.receiptMetadata != null;

    if (preservedReceiptMetadata) {
      receiptMetadataPreserved += 1;
    }

    sourceTotal += Number(amount);

    let jobId: number | null = null;
    if (projectReference) {
      const mappedJobId = options.jobIdByProjectReference[projectReference];
      if (mappedJobId == null) {
        throw new Error(`Legacy expense ${legacyExpenseId} has an invalid non-empty project reference: ${projectReference}.`);
      }
      jobId = mappedJobId;
      linkedImportableExpenses += 1;
    } else {
      unlinkedGeneralExpenses += 1;
    }

    const mappedSubmittedById = options.submittedByIdByLegacyId[submittedByLegacyId];
    const classification: LegacyExpenseImportClassification =
      mappedSubmittedById == null ? "imported_with_unresolved_submitter" : "imported";

    if (classification === "imported_with_unresolved_submitter") {
      unresolvedSubmitterImports += 1;
    }

    if (migrationMap.hasExpense(legacyExpenseId)) {
      const existingExpenseId = migrationMap.getExpenseId(legacyExpenseId)!;
      alreadyImported.push({ legacyExpenseId, expenseId: existingExpenseId });
      rowResults.push({
        legacyExpenseId,
        status: "already_imported",
        classification,
        amount,
        jobId,
        submittedById: mappedSubmittedById ?? null,
        legacySubmittedById: submittedByLegacyId,
        legacySubmittedByName: submittedByLegacyName,
        preservedReceiptMetadata,
        silentSkip: false,
        existingExpenseId,
      });
      continue;
    }

    const metadata: LegacyExpenseImportMetadata = {
      importSource: "legacy-expense",
      legacyExpenseId,
      legacySubmittedById: submittedByLegacyId,
      legacySubmittedByName: submittedByLegacyName,
      legacyProjectReference: projectReference,
      classification,
      sourceMetadata: row.sourceMetadata ?? null,
      receiptMetadata: row.receiptMetadata ?? null,
    };

    const plannedExpense: PlannedLegacyExpense = {
      legacyExpenseId,
      classification,
      expense: {
        vendor: normalizeNullableString(row.vendor),
        expenseDate,
        description: normalizeNullableString(row.description),
        amount,
        subtotal,
        tax,
        category: row.category,
        paymentMethod: normalizeNullableString(row.paymentMethod),
        receiptNumber: normalizeNullableString(row.receiptNumber),
        invoiceNumber: normalizeNullableString(row.invoiceNumber),
        customerName: normalizeNullableString(row.customerName),
        jobId,
        submittedById: mappedSubmittedById ?? null,
        legacySubmittedById: submittedByLegacyId,
        legacySubmittedByName: submittedByLegacyName,
        notes: normalizeNullableString(row.notes),
        status: row.status ?? options.defaultStatus ?? "pending",
        extractedData: metadata,
      },
      sourceRow: row,
    };

    plannedExpenses.push(plannedExpense);
    simulatedImportedTotal += Number(amount);

    rowResults.push({
      legacyExpenseId,
      status: "planned",
      classification,
      amount,
      jobId,
      submittedById: plannedExpense.expense.submittedById,
      legacySubmittedById: plannedExpense.expense.legacySubmittedById,
      legacySubmittedByName: plannedExpense.expense.legacySubmittedByName,
      preservedReceiptMetadata,
      silentSkip: false,
      plannedExpense,
    });
  }

  return {
    summary: {
      sourceRows: sourceRows.length,
      accountedRows: rowResults.length,
      simulatedImportedExpenses: plannedExpenses.length,
      alreadyImportedExpenses: alreadyImported.length,
      silentSkips: 0,
      linkedImportableExpenses,
      unresolvedSubmitterImports,
      unlinkedGeneralExpenses,
      duplicateLegacyExpenseIds: 0,
      invalidNonEmptyProjectReferences: 0,
      sourceTotal: sourceTotal.toFixed(2),
      simulatedImportedTotal: simulatedImportedTotal.toFixed(2),
      receiptMetadataPreserved,
    },
    plannedExpenses,
    alreadyImported,
    rowResults,
  };
}

export function buildLegacyExpenseDryRunReport(
  plan: LegacyExpenseImportPlan,
  verification: { rollbackConfirmed: boolean; liveDatabaseCountsUnchanged: boolean },
): LegacyExpenseDryRunReport {
  return {
    ...plan.summary,
    rollbackConfirmed: verification.rollbackConfirmed,
    liveDatabaseCountsUnchanged: verification.liveDatabaseCountsUnchanged,
  };
}
