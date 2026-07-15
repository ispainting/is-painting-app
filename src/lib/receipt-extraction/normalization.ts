import { ExpenseCategory } from "@prisma/client";
import { z } from "zod";
import {
  normalizedReceiptExtractionSchema,
  type NormalizedReceiptExtraction,
} from "./types";

const rawLineItemSchema = z.object({
  description: z.string().optional().nullable(),
  quantity: z.union([z.number(), z.string()]).optional().nullable(),
  unitPrice: z.union([z.number(), z.string()]).optional().nullable(),
  totalPrice: z.union([z.number(), z.string()]).optional().nullable(),
  confidence: z.union([z.number(), z.string()]).optional().nullable(),
});

const rawExtractionSchema = z.object({
  vendor: z.object({ value: z.union([z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  date: z.object({ value: z.union([z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  subtotal: z.object({ value: z.union([z.number(), z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  tax: z.object({ value: z.union([z.number(), z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  total: z.object({ value: z.union([z.number(), z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  paymentMethod: z.object({ value: z.union([z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  receiptNumber: z.object({ value: z.union([z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  invoiceNumber: z.object({ value: z.union([z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  category: z.object({ value: z.union([z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  description: z.object({ value: z.union([z.string(), z.null()]).optional(), confidence: z.union([z.number(), z.string()]).optional() }).optional(),
  items: z.array(rawLineItemSchema).optional(),
  rawText: z.union([z.string(), z.null()]).optional(),
  overallConfidence: z.union([z.number(), z.string()]).optional(),
  suggestedJob: z
    .object({
      jobName: z.union([z.string(), z.null()]).optional(),
      confidence: z.union([z.number(), z.string()]).optional(),
      reason: z.union([z.string(), z.null()]).optional(),
    })
    .optional(),
});

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
  return trimmed.slice(0, maxLen);
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
  const parsed = rawExtractionSchema.parse(input);

  const normalized: NormalizedReceiptExtraction = {
    vendor: {
      value: toStringValue(parsed.vendor?.value, 200),
      confidence: clampConfidence(parsed.vendor?.confidence),
    },
    date: {
      value: toDateOnly(parsed.date?.value),
      confidence: clampConfidence(parsed.date?.confidence),
    },
    subtotal: {
      value: toNumber(parsed.subtotal?.value),
      confidence: clampConfidence(parsed.subtotal?.confidence),
    },
    tax: {
      value: toNumber(parsed.tax?.value),
      confidence: clampConfidence(parsed.tax?.confidence),
    },
    total: {
      value: toNumber(parsed.total?.value),
      confidence: clampConfidence(parsed.total?.confidence),
    },
    paymentMethod: {
      value: toStringValue(parsed.paymentMethod?.value, 120),
      confidence: clampConfidence(parsed.paymentMethod?.confidence),
    },
    receiptNumber: {
      value: toStringValue(parsed.receiptNumber?.value, 120),
      confidence: clampConfidence(parsed.receiptNumber?.confidence),
    },
    invoiceNumber: {
      value: toStringValue(parsed.invoiceNumber?.value, 120),
      confidence: clampConfidence(parsed.invoiceNumber?.confidence),
    },
    category: {
      value: normalizeCategory(parsed.category?.value),
      confidence: clampConfidence(parsed.category?.confidence),
    },
    description: {
      value: toStringValue(parsed.description?.value, 500),
      confidence: clampConfidence(parsed.description?.confidence),
    },
    items: (parsed.items ?? [])
      .map((item) => ({
        description: toStringValue(item.description, 300) ?? "Line item",
        quantity: toNumber(item.quantity),
        unitPrice: toNumber(item.unitPrice),
        totalPrice: toNumber(item.totalPrice),
        confidence: clampConfidence(item.confidence, 0.2),
      }))
      .slice(0, 100),
    rawText: toStringValue(parsed.rawText, 20000),
    overallConfidence: clampConfidence(parsed.overallConfidence),
    suggestedJob: inferSuggestedJob(
      toStringValue(parsed.suggestedJob?.jobName, 200),
      clampConfidence(parsed.suggestedJob?.confidence),
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
