import type { LegacyExpenseRecord } from "./types";
import { normalizeExpenseCategory } from "./budget-map";

type RawExpenseRecord = Record<string, any>;

export interface ExpenseSourceAuditEntry {
  legacyId: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ExpenseSourceAudit {
  sourceCount: number;
  validCount: number;
  importableCount: number;
  skippedCount: number;
  duplicateCount: number;
  duplicateIds: string[];
  invalidAmounts: ExpenseSourceAuditEntry[];
  invalidDates: ExpenseSourceAuditEntry[];
  missingJobReferences: ExpenseSourceAuditEntry[];
  missingEmployeeReferences: ExpenseSourceAuditEntry[];
  unknownCategories: ExpenseSourceAuditEntry[];
  unsupportedStatuses: ExpenseSourceAuditEntry[];
  receiptMetadataCount: number;
  receiptMetadataWithoutAvailableFile: ExpenseSourceAuditEntry[];
  categoryMappingSummary: Record<string, number>;
  approvalStatusSummary: Record<string, number>;
  reimbursementStatusSummary: Record<string, number>;
  totalsByCategory: Record<string, number>;
  totalsByJob: Record<string, number>;
  totalAmount: number;
}

export interface NormalizedExpenseSourceResult {
  expenses: LegacyExpenseRecord[];
  audit: ExpenseSourceAudit;
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function parseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapStatus(value: unknown): "pending" | "approved" | "rejected" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected" || normalized === "cancelled" || normalized === "canceled") return "rejected";
  return "pending";
}

function mapReviewStatus(value: unknown): "pending_review" | "reviewed" | "approved" | "skipped" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "reviewed") return "reviewed";
  if (normalized === "rejected" || normalized === "skipped") return "skipped";
  return "pending_review";
}

const KNOWN_RAW_CATEGORIES = new Set([
  "paint",
  "materials",
  "labor",
  "tools",
  "equipment",
  "rentals",
  "fuel",
  "subcontractor",
  "subcontractors",
  "travel",
  "ferry",
  "payroll_related",
  "office",
  "advertising",
  "insurance",
  "vehicle",
  "meals",
  "other",
]);

const KNOWN_RAW_STATUSES = new Set(["pending", "approved", "rejected"]);

function parseReceiptMetadata(raw: RawExpenseRecord): unknown {
  const extracted = raw.extracted_data;
  if (typeof extracted !== "string" || extracted.trim().length === 0) return null;
  return JSON.parse(extracted);
}

export function buildNormalizedExpenseSource(rawExpenses: RawExpenseRecord[], importedProjectIds: Set<string>, importedEmployeeIds: Set<string>): NormalizedExpenseSourceResult {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const invalidAmounts: ExpenseSourceAuditEntry[] = [];
  const invalidDates: ExpenseSourceAuditEntry[] = [];
  const missingJobReferences: ExpenseSourceAuditEntry[] = [];
  const missingEmployeeReferences: ExpenseSourceAuditEntry[] = [];
  const unknownCategories: ExpenseSourceAuditEntry[] = [];
  const unsupportedStatuses: ExpenseSourceAuditEntry[] = [];
  const receiptMetadataWithoutAvailableFile: ExpenseSourceAuditEntry[] = [];
  const categoryMappingSummary: Record<string, number> = {};
  const approvalStatusSummary: Record<string, number> = {};
  const reimbursementStatusSummary: Record<string, number> = { not_applicable: 0, pending: 0, reimbursed: 0 };
  const totalsByCategory: Record<string, number> = {};
  const totalsByJob: Record<string, number> = {};
  const normalizedExpenses: LegacyExpenseRecord[] = [];
  let receiptMetadataCount = 0;
  let totalAmount = 0;

  for (const raw of rawExpenses) {
    const legacyId = normalizeId(raw.expense_id ?? raw.id);
    if (!legacyId) continue;
    if (seenIds.has(legacyId)) {
      duplicateIds.push(legacyId);
      continue;
    }
    seenIds.add(legacyId);

    const amount = parseAmount(raw.amount);
    if (amount == null) {
      invalidAmounts.push({ legacyId, message: "Invalid amount", details: { amount: raw.amount } });
      continue;
    }

    const expenseDate = parseDate(raw.expense_date);
    if (expenseDate == null) {
      invalidDates.push({ legacyId, message: "Invalid expense date", details: { expenseDate: raw.expense_date } });
      continue;
    }

    const projectId = raw.project_id == null || raw.project_id === "" ? null : normalizeId(raw.project_id);
    if (projectId != null && !importedProjectIds.has(projectId)) {
      missingJobReferences.push({
        legacyId,
        message: "Project reference does not resolve to an imported job",
        details: {
          projectId: raw.project_id,
          projectName: raw.project_name ?? null,
        },
      });
      continue;
    }
    if (projectId == null) {
      missingJobReferences.push({
        legacyId,
        message: "Expense is intentionally unlinked from a job",
        details: {
          projectId: null,
          projectName: raw.project_name ?? null,
        },
      });
    }

    const submittedByEmployeeId = normalizeId(raw.submitted_by_id);
    if (!submittedByEmployeeId || !importedEmployeeIds.has(submittedByEmployeeId)) {
      missingEmployeeReferences.push({
        legacyId,
        message: "Submitted-by employee does not resolve to an imported employee",
        details: {
          submittedByEmployeeId: raw.submitted_by_id ?? null,
          submittedByName: raw.submitted_by_name ?? null,
        },
      });
      continue;
    }

    const category = String(raw.category ?? "").trim().toLowerCase();
    const mappedCategory = normalizeExpenseCategory(category || "other");
    if (!category || !KNOWN_RAW_CATEGORIES.has(category)) {
      unknownCategories.push({ legacyId, message: "Blank expense category", details: { category: raw.category ?? null, mappedCategory } });
    }

    const rawStatus = String(raw.status ?? "").trim().toLowerCase();
    if (!KNOWN_RAW_STATUSES.has(rawStatus)) {
      unsupportedStatuses.push({ legacyId, message: "Unsupported expense status", details: { status: raw.status ?? null } });
    }

    const status = mapStatus(raw.status);
    const reviewStatus = mapReviewStatus(raw.status);
    if (!approvalStatusSummary[status]) approvalStatusSummary[status] = 0;
    approvalStatusSummary[status] += 1;
    reimbursementStatusSummary.not_applicable += 1;
    categoryMappingSummary[mappedCategory] = (categoryMappingSummary[mappedCategory] ?? 0) + 1;
    totalsByCategory[mappedCategory] = (totalsByCategory[mappedCategory] ?? 0) + amount;
    if (projectId == null) {
      totalsByJob.unlinked = (totalsByJob.unlinked ?? 0) + amount;
    } else {
      totalsByJob[projectId] = (totalsByJob[projectId] ?? 0) + amount;
    }
    totalAmount += amount;

    const extractedData = raw.extracted_data ? parseReceiptMetadata(raw) : null;
    if (raw.receipt_url || extractedData) receiptMetadataCount += 1;
    if ((raw.receipt_url || extractedData) && !raw.receipt_url) {
      receiptMetadataWithoutAvailableFile.push({
        legacyId,
        message: "Receipt metadata exists without a direct receipt file reference",
        details: { extractedData: extractedData ?? null },
      });
    }

    normalizedExpenses.push({
      id: legacyId,
      projectId,
      submittedByEmployeeId,
      employeeId: null,
      approvedByEmployeeId: raw.approved_by_id == null ? null : normalizeId(raw.approved_by_id),
      vendor: raw.vendor ?? null,
      category: mappedCategory,
      amount: raw.amount,
      subtotal: extractedData && typeof extractedData === "object" && extractedData !== null && "subtotal" in extractedData
        ? (extractedData as any).subtotal
        : null,
      tax: extractedData && typeof extractedData === "object" && extractedData !== null && "tax" in extractedData
        ? (extractedData as any).tax
        : null,
      expenseDate,
      description: raw.description ?? null,
      receiptUrl: raw.receipt_url ?? null,
      customerName: null,
      paymentMethod: null,
      paymentMethodLast4: null,
      invoiceNumber: null,
      receiptNumber: null,
      taxDeductible: null,
      reimbursable: null,
      reimbursementStatus: "not_applicable",
      reviewStatus,
      duplicateStatus: "clear",
      status,
      notes: raw.notes ?? null,
      createdAt: raw.created_at ?? null,
      updatedAt: raw.updated_at ?? null,
      extractedData,
    });
  }

  const sourceCount = rawExpenses.length;
  const skippedCount = invalidAmounts.length + invalidDates.length + missingEmployeeReferences.length + duplicateIds.length;
  const validCount = sourceCount - skippedCount;

  return {
    expenses: normalizedExpenses,
    audit: {
      sourceCount,
      validCount,
      importableCount: normalizedExpenses.length,
      skippedCount,
      duplicateCount: duplicateIds.length,
      duplicateIds,
      invalidAmounts,
      invalidDates,
      missingJobReferences,
      missingEmployeeReferences,
      unknownCategories,
      unsupportedStatuses,
      receiptMetadataCount,
      receiptMetadataWithoutAvailableFile,
      categoryMappingSummary,
      approvalStatusSummary,
      reimbursementStatusSummary,
      totalsByCategory,
      totalsByJob,
      totalAmount,
    },
  };
}