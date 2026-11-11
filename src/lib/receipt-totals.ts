import { round2 } from "./utils";

export interface ReceiptLineItemLike {
  id?: number;
  description: string;
  quantity?: number | string | { toString(): string } | null;
  unitPrice?: number | string | { toString(): string } | null;
  total?: number | string | { toString(): string } | null;
}

export interface ReceiptLike {
  id?: number;
  vendor?: string | null;
  amount?: number | string | { toString(): string } | null;
  subtotal?: number | string | { toString(): string } | null;
  tax?: number | string | { toString(): string } | null;
  expenseDate?: Date | string | null;
  jobId?: number | null;
  job?: { id?: number; name?: string | null } | null;
  status?: string | null;
  reviewStatus?: string | null;
  extractedData?: unknown;
  ocrStructured?: unknown;
  attachments?: Array<{
    id?: number;
    extractionStatus?: string | null;
    extractionConfidence?: number | string | { toString(): string } | null;
    extractionStructured?: unknown;
  }>;
  lineItems?: ReceiptLineItemLike[];
}

export interface ComputedReceiptTotal {
  authoritativeTotal: number;
  source: "expense_amount" | "extracted_total" | "line_items_sum" | "zero";
  subtotal: number | null;
  tax: number | null;
  lineItemsTotal: number;
  hasLineItems: boolean;
  hasMismatch: boolean;
  mismatchWarning: string | null;
}

export interface FilteredReceiptAggregates {
  totalCount: number;
  totalAmount: number;
  reviewedCount: number;
  reviewedTotal: number;
  unreviewedCount: number;
  unreviewedTotal: number;
}

function parseNum(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const str = typeof val === "object" && val && "toString" in val ? val.toString() : String(val);
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Computes authoritative receipt total according to the strict priority order:
 * 1. Linked authoritative Expense amount
 * 2. Stored receipt final total / extracted total
 * 3. Sum of valid line items as fallback
 */
export function computeReceiptTotal(receipt: ReceiptLike): ComputedReceiptTotal {
  const expenseAmount = parseNum(receipt.amount);
  const subtotal = parseNum(receipt.subtotal);
  const tax = parseNum(receipt.tax);

  // Calculate line items sum
  let lineItemsTotal = 0;
  const lineItems = receipt.lineItems ?? [];
  for (const item of lineItems) {
    const itemTotal = parseNum(item.total);
    if (itemTotal != null) {
      lineItemsTotal = round2(lineItemsTotal + itemTotal);
    } else {
      const q = parseNum(item.quantity) ?? 1;
      const u = parseNum(item.unitPrice) ?? 0;
      lineItemsTotal = round2(lineItemsTotal + q * u);
    }
  }

  // Extract from OCR / extracted data if available
  let extractedTotal: number | null = null;
  const extractedObj = (receipt.extractedData || receipt.ocrStructured) as Record<string, any> | undefined;
  if (extractedObj && typeof extractedObj === "object") {
    if (typeof extractedObj.total === "number") extractedTotal = extractedObj.total;
    else if (extractedObj.total && typeof extractedObj.total === "object" && "value" in extractedObj.total) {
      extractedTotal = parseNum(extractedObj.total.value);
    }
  }

  let authoritativeTotal = 0;
  let source: ComputedReceiptTotal["source"] = "zero";

  if (expenseAmount != null && expenseAmount > 0) {
    authoritativeTotal = round2(expenseAmount);
    source = "expense_amount";
  } else if (extractedTotal != null && extractedTotal > 0) {
    authoritativeTotal = round2(extractedTotal);
    source = "extracted_total";
  } else if (lineItems.length > 0 && lineItemsTotal > 0) {
    authoritativeTotal = round2(lineItemsTotal);
    source = "line_items_sum";
  }

  const hasLineItems = lineItems.length > 0;
  const hasMismatch = hasLineItems && Math.abs(lineItemsTotal - authoritativeTotal) > 0.01;
  const mismatchWarning = hasMismatch ? "Line items do not match receipt total." : null;

  return {
    authoritativeTotal,
    source,
    subtotal,
    tax,
    lineItemsTotal,
    hasLineItems,
    hasMismatch,
    mismatchWarning,
  };
}

/**
 * Calculates aggregate figures across a filtered list of receipts/expenses.
 * Prevents double counting by operating at the unique Expense level.
 */
export function computeFilteredReceiptAggregates(
  receipts: ReceiptLike[],
  filters?: {
    vendor?: string;
    jobId?: number;
    startDate?: Date | string;
    endDate?: Date | string;
    reviewStatus?: string;
    status?: string;
  }
): FilteredReceiptAggregates {
  const seenIds = new Set<number>();
  let totalCount = 0;
  let totalAmount = 0;
  let reviewedCount = 0;
  let reviewedTotal = 0;
  let unreviewedCount = 0;
  let unreviewedTotal = 0;

  for (const receipt of receipts) {
    if (receipt.id != null) {
      if (seenIds.has(receipt.id)) continue;
      seenIds.add(receipt.id);
    }

    if (filters?.vendor && (!receipt.vendor || !receipt.vendor.toLowerCase().includes(filters.vendor.toLowerCase()))) {
      continue;
    }

    if (filters?.jobId != null && receipt.jobId !== filters.jobId) {
      continue;
    }

    if (filters?.startDate && receipt.expenseDate) {
      const date = new Date(receipt.expenseDate);
      if (date < new Date(filters.startDate)) continue;
    }

    if (filters?.endDate && receipt.expenseDate) {
      const date = new Date(receipt.expenseDate);
      if (date > new Date(filters.endDate)) continue;
    }

    if (filters?.reviewStatus && receipt.reviewStatus !== filters.reviewStatus) {
      continue;
    }

    if (filters?.status && receipt.status !== filters.status) {
      continue;
    }

    const { authoritativeTotal } = computeReceiptTotal(receipt);
    totalCount += 1;
    totalAmount = round2(totalAmount + authoritativeTotal);

    const isReviewed = receipt.reviewStatus === "reviewed" || receipt.status === "approved";
    if (isReviewed) {
      reviewedCount += 1;
      reviewedTotal = round2(reviewedTotal + authoritativeTotal);
    } else {
      unreviewedCount += 1;
      unreviewedTotal = round2(unreviewedTotal + authoritativeTotal);
    }
  }

  return {
    totalCount,
    totalAmount,
    reviewedCount,
    reviewedTotal,
    unreviewedCount,
    unreviewedTotal,
  };
}
