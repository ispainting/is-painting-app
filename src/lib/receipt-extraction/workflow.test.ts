import { describe, expect, it, vi } from "vitest";
import { runReceiptExtractionWorkflow } from "./workflow";
import type { ReceiptExtractionResult } from "./types";

const attachment = {
  id: 42,
  storagePath: "expense-receipts/receipt.png",
  originalFilename: "receipt.png",
  mimeType: "image/png",
  sizeBytes: 1024,
};

const extracted = {
  normalized: {
    vendor: { value: "Harbor Supply", confidence: 0.9 },
    date: { value: "2026-09-21", confidence: 0.9 },
    subtotal: { value: null, confidence: 0 },
    tax: { value: null, confidence: 0 },
    total: { value: 25, confidence: 0.9 },
    paymentMethod: { value: null, confidence: 0 },
    receiptNumber: { value: null, confidence: 0 },
    category: { value: "materials", confidence: 0.9 },
    description: { value: "Supplies", confidence: 0.9 },
    items: [],
    rawText: null,
    overallConfidence: 0.9,
  },
  provider: "openai",
  model: "test-model",
  needsReview: false,
} satisfies ReceiptExtractionResult;

function dependencies(overrides: Partial<Parameters<typeof runReceiptExtractionWorkflow>[2]> = {}) {
  return {
    download: vi.fn().mockResolvedValue({ objectKey: attachment.storagePath, contentType: "image/png", data: new ArrayBuffer(8) }),
    loadJobs: vi.fn().mockResolvedValue([]),
    extract: vi.fn().mockResolvedValue(extracted),
    saveSuccess: vi.fn().mockResolvedValue(undefined),
    saveFailure: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...overrides,
  };
}

describe("receipt extraction workflow", () => {
  it("saves successful extraction on the existing attachment", async () => {
    const deps = dependencies();
    await expect(runReceiptExtractionWorkflow(attachment, "req-success", deps)).resolves.toEqual({ ok: true, result: extracted });
    expect(deps.download).toHaveBeenCalledOnce();
    expect(deps.saveSuccess).toHaveBeenCalledWith(extracted);
    expect(deps.saveFailure).not.toHaveBeenCalled();
  });

  it("categorizes a private Blob read failure and preserves the attachment for fallback", async () => {
    const deps = dependencies({ download: vi.fn().mockRejectedValue(new Error("Vercel Blob token is invalid")) });
    const result = await runReceiptExtractionWorkflow(attachment, "req-blob", deps);
    expect(result).toMatchObject({ ok: false, error: { kind: "storage_unavailable", retryable: true } });
    expect(deps.saveFailure).toHaveBeenCalledOnce();
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("returns manual-entry fallback without uploading or creating an expense", async () => {
    const deps = dependencies({ extract: vi.fn().mockRejectedValue(new Error("AI response returned invalid JSON.")) });
    const result = await runReceiptExtractionWorkflow(attachment, "req-malformed", deps);
    expect(result).toMatchObject({ ok: false, error: { kind: "malformed_response" } });
    expect(deps.saveFailure).toHaveBeenCalledOnce();
    expect(deps.saveSuccess).not.toHaveBeenCalled();
    expect(Object.keys(deps)).not.toContain("upload");
    expect(Object.keys(deps)).not.toContain("createExpense");
  });

  it("retrying uses the same attachment and never duplicates upload or expense creation", async () => {
    const first = dependencies({ extract: vi.fn().mockRejectedValue(new Error("fetch failed: ECONNRESET")) });
    const second = dependencies();
    await runReceiptExtractionWorkflow(attachment, "req-first", first);
    await runReceiptExtractionWorkflow(attachment, "req-retry", second);
    expect(first.download).toHaveBeenCalledWith(attachment.storagePath);
    expect(second.download).toHaveBeenCalledWith(attachment.storagePath);
    expect(second.saveSuccess).toHaveBeenCalledOnce();
    expect(attachment.id).toBe(42);
  });

  it("logs structured metadata without receipt contents or storage paths", async () => {
    const log = vi.fn();
    const deps = dependencies({ extract: vi.fn().mockRejectedValue(new Error("AI response returned invalid JSON.")), log });
    await runReceiptExtractionWorkflow(attachment, "req-log", deps);
    const event = log.mock.calls[0][0];
    expect(event).toMatchObject({ requestId: "req-log", attachmentId: 42, category: "malformed_response", mimeType: "image/png", sizeBytes: 1024 });
    expect(JSON.stringify(event)).not.toContain(attachment.storagePath);
    expect(JSON.stringify(event)).not.toContain("Harbor Supply");
  });
});
