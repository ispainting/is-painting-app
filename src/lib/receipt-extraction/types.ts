import { z } from "zod";

export const extractionFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1),
  });

export const extractionLineItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  totalPrice: z.number().nullable(),
  confidence: z.number().min(0).max(1),
});

export const suggestedJobSchema = z.object({
  jobId: z.number().int().positive().nullable(),
  jobName: z.string().trim().max(200).nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().max(400).nullable(),
});

export const normalizedReceiptExtractionSchema = z.object({
  vendor: extractionFieldSchema(z.string().trim().min(1).max(200)),
  date: extractionFieldSchema(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  subtotal: extractionFieldSchema(z.number()),
  tax: extractionFieldSchema(z.number()),
  total: extractionFieldSchema(z.number()),
  paymentMethod: extractionFieldSchema(z.string().trim().max(120)),
  receiptNumber: extractionFieldSchema(z.string().trim().max(120)),
  invoiceNumber: extractionFieldSchema(z.string().trim().max(120)),
  category: extractionFieldSchema(z.string().trim().max(100)),
  description: extractionFieldSchema(z.string().trim().max(500)),
  items: z.array(extractionLineItemSchema),
  rawText: z.string().nullable(),
  overallConfidence: z.number().min(0).max(1),
  suggestedJob: suggestedJobSchema.optional(),
});

export type NormalizedReceiptExtraction = z.infer<typeof normalizedReceiptExtractionSchema>;

export type ReceiptExtractionInput = {
  attachmentId: number;
  originalFilename: string;
  mimeType: string;
  fileData: ArrayBuffer;
  jobOptions: Array<{ id: number; name: string }>;
  existingTaskId?: string | null;
};

export type ReceiptExtractionResult = {
  normalized: NormalizedReceiptExtraction;
  provider: string;
  model: string;
  needsReview: boolean;
  metadata?: {
    taskId: string | null;
    creditsUsed: number | null;
    durationMs: number;
    success: boolean;
    status: string | null;
    taskCreated: boolean;
    providerErrorCode?: string | null;
  };
};

export interface ReceiptExtractionProvider {
  extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult>;
}

export type ExtractionConfidenceByField = {
  vendor: number;
  date: number;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: number;
  receiptNumber: number;
  invoiceNumber: number;
  category: number;
  description: number;
  overallConfidence: number;
};

export function buildConfidenceByField(
  normalized: NormalizedReceiptExtraction
): ExtractionConfidenceByField {
  return {
    vendor: normalized.vendor.confidence,
    date: normalized.date.confidence,
    subtotal: normalized.subtotal.confidence,
    tax: normalized.tax.confidence,
    total: normalized.total.confidence,
    paymentMethod: normalized.paymentMethod.confidence,
    receiptNumber: normalized.receiptNumber.confidence,
    invoiceNumber: normalized.invoiceNumber.confidence,
    category: normalized.category.confidence,
    description: normalized.description.confidence,
    overallConfidence: normalized.overallConfidence,
  };
}
