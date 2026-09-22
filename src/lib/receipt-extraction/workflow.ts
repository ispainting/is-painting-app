import { normalizeReceiptExtractionError, ReceiptExtractionError } from "./errors";
import type { ReceiptExtractionResult } from "./types";
import type { ReceiptObject } from "@/lib/receipt-storage/types";

export type ReceiptExtractionAttachment = {
  id: number;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

type WorkflowDependencies = {
  download: (storagePath: string) => Promise<ReceiptObject>;
  loadJobs: () => Promise<Array<{ id: number; name: string }>>;
  extract: (input: {
    attachmentId: number;
    originalFilename: string;
    mimeType: string;
    fileData: ArrayBuffer;
    jobOptions: Array<{ id: number; name: string }>;
  }) => Promise<ReceiptExtractionResult>;
  saveSuccess: (result: ReceiptExtractionResult) => Promise<void>;
  saveFailure: (message: string) => Promise<void>;
  log?: (event: Record<string, unknown>) => void;
};

export type ReceiptExtractionWorkflowResult =
  | { ok: true; result: ReceiptExtractionResult }
  | { ok: false; error: ReceiptExtractionError };

export async function runReceiptExtractionWorkflow(
  attachment: ReceiptExtractionAttachment,
  requestId: string,
  dependencies: WorkflowDependencies,
): Promise<ReceiptExtractionWorkflowResult> {
  const startedAt = Date.now();
  try {
    let object: ReceiptObject;
    try {
      object = await dependencies.download(attachment.storagePath);
    } catch (error) {
      throw new ReceiptExtractionError({
        kind: "storage_unavailable",
        userMessage: "The receipt was attached, but it could not be opened for scanning. Retry reading or enter the expense manually.",
        logMessage: error instanceof Error ? `Receipt storage download failed: ${error.message}` : "Receipt storage download failed.",
        cause: error,
        retryable: true,
      });
    }

    const jobs = await dependencies.loadJobs();
    const result = await dependencies.extract({
      attachmentId: attachment.id,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      fileData: object.data,
      jobOptions: jobs,
    });
    await dependencies.saveSuccess(result);
    dependencies.log?.({
      event: "receipt_extraction_completed",
      requestId,
      attachmentId: attachment.id,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      provider: result.provider,
      model: result.model,
      elapsedMs: Date.now() - startedAt,
    });
    return { ok: true, result };
  } catch (error) {
    const normalized = normalizeReceiptExtractionError(error);
    dependencies.log?.({
      event: "receipt_extraction_failed",
      requestId,
      attachmentId: attachment.id,
      category: normalized.kind,
      providerStatus: normalized.providerStatus ?? null,
      retryable: normalized.retryable,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      elapsedMs: Date.now() - startedAt,
    });
    await dependencies.saveFailure(normalized.userMessage);
    return { ok: false, error: normalized };
  }
}
