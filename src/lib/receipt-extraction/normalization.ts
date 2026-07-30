import { ExpenseCategory } from "@prisma/client";
import { z } from "zod";
import {
  normalizedReceiptExtractionSchema,
  type NormalizedReceiptExtraction,
} from "./types";

type LooseRecord = Record<string, unknown>;

function toRecord(value: unknown): LooseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LooseRecord;
}

function readAlias(source: LooseRecord, aliases: string[]): unknown {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

function unwrapValue(raw: unknown): { value: unknown; confidence: unknown } {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as LooseRecord;
    const nestedValue = readAlias(obj, ["value", "val", "text", "amount", "data"]);
    const nestedConfidence = readAlias(obj, ["confidence", "score", "probability", "conf"]);
    if (nestedValue !== undefined || nestedConfidence !== undefined) {
      return {
        value: nestedValue,
        confidence: nestedConfidence,
      };
    }
  }

  return {
    value: raw,
    confidence: null,
  };
}

const CATEGORY_VALUES = Object.values(ExpenseCategory);

function clampConfidence(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return fallback;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return Number(numeric.toFixed(4));
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }
  if (typeof value === "string") {
    const sanitized = value.replace(/[^\d.-]/g, "");
    const parsed = Number(sanitized);
    if (Number.isNaN(parsed)) return null;
    return Number(parsed.toFixed(2));
  }
  return null;
}

function toStringValue(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "null" || lowered === "none" || lowered === "n/a" || lowered === "na") return null;
  return trimmed.slice(0, maxLen);
}

function toNumberWithConfidence(value: unknown, confidence: unknown): number | null {
  const numeric = toNumber(value);
  const conf = clampConfidence(confidence, 0);
  if (numeric == null) return null;
  if (conf === 0 && numeric === 0) return null;
  return numeric;
}

function toDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const direct = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeLineItems(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const row = toRecord(item);
      const description = toStringValue(readAlias(row, ["description", "name", "title", "item"]), 300);

      const quantityField = unwrapValue(readAlias(row, ["quantity", "qty"]));
      const unitPriceField = unwrapValue(readAlias(row, ["unitPrice", "unit_price", "price", "unit"]));
      const totalPriceField = unwrapValue(readAlias(row, ["totalPrice", "total_price", "amount", "lineTotal"]));

      const confidenceField = unwrapValue(readAlias(row, ["confidence", "score", "probability"]));

      return {
        description: description ?? "Line item",
        quantity: toNumber(quantityField.value),
        unitPrice: toNumber(unitPriceField.value),
        totalPrice: toNumber(totalPriceField.value),
        confidence: clampConfidence(confidenceField.value ?? confidenceField.confidence, 0.2),
      };
    })
    .slice(0, 100);
}

function normalizeCategory(value: unknown): string | null {
  const text = toStringValue(value, 100);
  if (!text) return null;

  const lowered = text.toLowerCase().replace(/\s+/g, "_");
  const exact = CATEGORY_VALUES.find((cat) => cat === lowered);
  if (exact) return exact;

  if (lowered.includes("paint")) return "paint";
  if (lowered.includes("material")) return "materials";
  if (lowered.includes("fuel") || lowered.includes("gas")) return "fuel";
  if (lowered.includes("meal") || lowered.includes("food")) return "meals";
  if (lowered.includes("travel") || lowered.includes("flight") || lowered.includes("hotel")) return "travel";

  return null;
}

function inferSuggestedJob(
  suggestedJobName: string | null,
  suggestedJobConfidence: number,
  jobs: Array<{ id: number; name: string }>
) {
  if (!suggestedJobName || suggestedJobConfidence < 0.85) {
    return { jobId: null, jobName: null, confidence: clampConfidence(suggestedJobConfidence), reason: null };
  }

  const normalized = suggestedJobName.trim().toLowerCase();
  const match = jobs.find((job) => job.name.trim().toLowerCase() === normalized)
    ?? jobs.find((job) => job.name.trim().toLowerCase().includes(normalized) || normalized.includes(job.name.trim().toLowerCase()));

  if (!match) {
    return { jobId: null, jobName: suggestedJobName, confidence: clampConfidence(suggestedJobConfidence), reason: "No matching job found." };
  }

  return {
    jobId: match.id,
    jobName: match.name,
    confidence: clampConfidence(suggestedJobConfidence),
    reason: "Matched against active job names.",
  };
}

export function normalizeExtractionResponse(input: unknown, jobs: Array<{ id: number; name: string }>) {
  const parsed = toRecord(input);

  const vendorField = unwrapValue(readAlias(parsed, ["vendor", "merchant", "supplier", "store"]));
  const dateField = unwrapValue(readAlias(parsed, ["date", "expenseDate", "purchaseDate", "transactionDate"]));
  const subtotalField = unwrapValue(readAlias(parsed, ["subtotal", "subTotal", "net", "pretax"]));
  const taxField = unwrapValue(readAlias(parsed, ["tax", "totalTax", "vat", "gst"]));
  const totalField = unwrapValue(readAlias(parsed, ["total", "grandTotal", "amount", "amountTotal"]));
  const paymentMethodField = unwrapValue(readAlias(parsed, ["paymentMethod", "payment_method", "method", "paymentType"]));
  const receiptNumberField = unwrapValue(readAlias(parsed, ["receiptNumber", "receipt_number", "referenceNumber", "reference_number", "transactionId", "transaction_id"]));
  const invoiceNumberField = unwrapValue(readAlias(parsed, ["invoiceNumber", "invoice_number", "invoiceNo", "invoice_no"]));
  const categoryField = unwrapValue(readAlias(parsed, ["category", "expenseCategory", "expense_category"]));
  const descriptionField = unwrapValue(readAlias(parsed, ["description", "memo", "note", "summary"]));
  const overallConfidenceField = unwrapValue(readAlias(parsed, ["overallConfidence", "overall_confidence", "confidence", "score"]));

  const rawTextValue = readAlias(parsed, ["rawText", "raw_text", "ocrText", "ocr_text", "text"]);
  const itemsValue = readAlias(parsed, ["items", "lineItems", "line_items"]);

  const suggestedJobRaw = toRecord(readAlias(parsed, ["suggestedJob", "suggested_job", "jobSuggestion", "job"]));
  const suggestedJobName = toStringValue(readAlias(suggestedJobRaw, ["jobName", "job_name", "name"]), 200);
  const suggestedJobConfidence = clampConfidence(readAlias(suggestedJobRaw, ["confidence", "score", "probability"]));

  const normalized: NormalizedReceiptExtraction = {
    vendor: {
      value: toStringValue(vendorField.value, 200),
      confidence: clampConfidence(vendorField.confidence),
    },
    date: {
      value: toDateOnly(dateField.value),
      confidence: clampConfidence(dateField.confidence),
    },
    subtotal: {
      value: toNumberWithConfidence(subtotalField.value, subtotalField.confidence),
      confidence: clampConfidence(subtotalField.confidence),
    },
    tax: {
      value: toNumberWithConfidence(taxField.value, taxField.confidence),
      confidence: clampConfidence(taxField.confidence),
    },
    total: {
      value: toNumberWithConfidence(totalField.value, totalField.confidence),
      confidence: clampConfidence(totalField.confidence),
    },
    paymentMethod: {
      value: toStringValue(paymentMethodField.value, 120),
      confidence: clampConfidence(paymentMethodField.confidence),
    },
    receiptNumber: {
      value: toStringValue(receiptNumberField.value, 120),
      confidence: clampConfidence(receiptNumberField.confidence),
    },
    invoiceNumber: {
      value: toStringValue(invoiceNumberField.value, 120),
      confidence: clampConfidence(invoiceNumberField.confidence),
    },
    category: {
      value: normalizeCategory(categoryField.value),
      confidence: clampConfidence(categoryField.confidence),
    },
    description: {
      value: toStringValue(descriptionField.value, 500),
      confidence: clampConfidence(descriptionField.confidence),
    },
    items: normalizeLineItems(itemsValue),
    rawText: toStringValue(rawTextValue, 20000),
    overallConfidence: clampConfidence(overallConfidenceField.value ?? overallConfidenceField.confidence),
    suggestedJob: inferSuggestedJob(
      suggestedJobName,
      suggestedJobConfidence,
      jobs
    ),
  };

  return normalizedReceiptExtractionSchema.parse(normalized);
}

export function shouldMarkNeedsReview(normalized: NormalizedReceiptExtraction) {
  if (normalized.total.value == null) return true;
  if (normalized.overallConfidence < 0.65) return true;
  if (normalized.vendor.value == null || normalized.vendor.confidence < 0.5) return true;
  return false;
}
