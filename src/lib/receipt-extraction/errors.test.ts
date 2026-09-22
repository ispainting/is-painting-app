import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiReceiptExtractionProvider } from "./providers/openai-provider";
import { normalizeExtractionResponse, shouldMarkNeedsReview } from "./normalization";
import { ReceiptExtractionError } from "./errors";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const input = {
  attachmentId: 1,
  originalFilename: "receipt.png",
  mimeType: "image/png",
  fileData: onePixelPng.buffer.slice(onePixelPng.byteOffset, onePixelPng.byteOffset + onePixelPng.byteLength) as ArrayBuffer,
  jobOptions: [],
};

function providerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeUserFacingMessage(error: unknown) {
  if (error instanceof ReceiptExtractionError) return error.userMessage;
  const message = providerErrorMessage(error).toLowerCase();
  if (message.includes("timeout") || message.includes("timed out")) {
    return "Receipt reading timed out. You can enter the expense manually.";
  }
  if (
    message.includes("429")
    || message.includes("credit_balance_exhausted")
    || message.includes("provider unavailable")
  ) {
    return "Receipt reading is temporarily unavailable. You can enter the expense manually.";
  }
  return "Receipt reading failed. You can enter the expense manually.";
}

function responseWithError(status: number, body: string) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("receipt extraction error handling", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

  it.each([
    ["429", '{"error":{"code":"credit_balance_exhausted","message":"quota exhausted"}}'],
    ["429 rate limit", '{"error":{"code":"rate_limit_exceeded","message":"too many requests"}}'],
  ])("classifies %s as temporary provider unavailability without exposing provider JSON", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWithError(429, body)));

    const error = await new OpenAiReceiptExtractionProvider().extract(input).catch((reason) => reason);
    expect(error).toBeInstanceOf(ReceiptExtractionError);
    const technicalMessage = (error as ReceiptExtractionError).logMessage;
    const userMessage = safeUserFacingMessage(error);

    expect((error as ReceiptExtractionError).providerStatus).toBe(429);
    expect(["billing_unavailable", "rate_limited"]).toContain((error as ReceiptExtractionError).kind);
    expect(technicalMessage).toContain("OpenAI");
    expect(technicalMessage).toContain("429");
    expect(userMessage).toContain("temporarily unavailable");
    expect(userMessage).toContain("receipt is attached");
    expect(userMessage).not.toContain("credit_balance_exhausted");
    expect(userMessage).not.toContain("rate_limit_exceeded");
    expect(userMessage).not.toContain("quota exhausted");
  });

  it("returns a safe timeout/manual-entry message while preserving technical timeout classification", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
      ),
    );

    const fetchMock = vi.fn((_url: string, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiReceiptExtractionProvider({ timeoutMs: 5, retryDelayMs: 0 });
    const extraction = provider.extract(input);
    await expect(extraction).rejects.toMatchObject({ kind: "timeout", retryable: true });
    const error = await extraction.catch((reason) => reason);

    expect((error as ReceiptExtractionError).logMessage).toContain("timed out");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(safeUserFacingMessage(error)).toContain("Receipt scanning timed out");
    expect(safeUserFacingMessage(error)).toContain("receipt is attached");
  });

  it("returns a safe unavailable/manual-entry message for a network error", async () => {
    const networkError = new Error("fetch failed: ECONNRESET");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    const error = await new OpenAiReceiptExtractionProvider().extract(input).catch((reason) => reason);

    expect((error as ReceiptExtractionError).logMessage).toContain("ECONNRESET");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(safeUserFacingMessage(error)).toContain("temporarily unavailable");
    expect(safeUserFacingMessage(error)).toContain("receipt is attached");
    expect(safeUserFacingMessage(error)).not.toContain("ECONNRESET");
  });

  it("reports missing provider configuration without exposing environment details", async () => {
    delete process.env.OPENAI_API_KEY;
    const error = await new OpenAiReceiptExtractionProvider().extract(input).catch((reason) => reason);
    expect(error).toMatchObject({ kind: "missing_configuration", retryable: false });
    expect((error as ReceiptExtractionError).userMessage).toContain("not configured");
    expect((error as ReceiptExtractionError).userMessage).not.toContain("OPENAI_API_KEY");
  });

  it("reads only the simplified receipt fields and maps amount to the expense total", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        vendor: { value: "Harbor Supply", confidence: 0.95 },
        category: { value: "materials", confidence: 0.9 },
        amount: { value: 123.45, confidence: 0.96 },
        date: { value: "2026-08-20", confidence: 0.94 },
        description: { value: "Paint supplies", confidence: 0.9 },
      }),
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAiReceiptExtractionProvider().extract(input);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt = requestBody.input[0].content[0].text as string;

    expect(result.normalized.vendor.value).toBe("Harbor Supply");
    expect(result.normalized.category.value).toBe("materials");
    expect(result.normalized.total.value).toBe(123.45);
    expect(result.normalized.date.value).toBe("2026-08-20");
    expect(result.normalized.description.value).toBe("Paint supplies");
    expect(prompt).toContain("Extract only vendor, category, amount, date, and description");
    expect(prompt).not.toContain("paymentMethod");
    expect(prompt).not.toContain("lineItems");
    expect(prompt).not.toContain("Known jobs");
  });

  it("sends PDFs as provider input_file without converting or re-uploading", async () => {
    const pdf = Buffer.from("%PDF-1.4\n%%EOF", "ascii");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        vendor: { value: "PDF Vendor", confidence: 0.9 },
        category: { value: "materials", confidence: 0.9 },
        amount: { value: 10, confidence: 0.9 },
        date: { value: "2026-09-21", confidence: 0.9 },
        description: { value: "PDF receipt", confidence: 0.9 },
      }),
    }), { status: 200 }));
    const provider = new OpenAiReceiptExtractionProvider({ fetch: fetchMock });

    await provider.extract({
      ...input,
      originalFilename: "receipt.pdf",
      mimeType: "application/pdf",
      fileData: pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer,
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const fileContent = requestBody.input[0].content[1];
    expect(fileContent.type).toBe("input_file");
    expect(fileContent.filename).toBe("receipt.pdf");
    expect(fileContent.file_data).toMatch(/^data:application\/pdf;base64,/);
  });

  it("treats malformed provider output as a recoverable extraction failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "not json" }), { status: 200 })));

    await expect(new OpenAiReceiptExtractionProvider().extract(input)).rejects.toMatchObject({
      kind: "malformed_response",
      retryable: false,
    });
  });

  it("classifies an invalid provider HTTP body as malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(new OpenAiReceiptExtractionProvider().extract(input)).rejects.toMatchObject({ kind: "malformed_response", retryable: false });
  });

  it("classifies provider payload limits as non-retryable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWithError(413, "payload too large"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new OpenAiReceiptExtractionProvider().extract(input)).rejects.toMatchObject({ kind: "payload_too_large", providerStatus: 413, retryable: false });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("marks an unusable but valid provider response for review instead of crashing the workflow", () => {
    const normalized = normalizeExtractionResponse(
      {
        vendor: { value: null, confidence: 0 },
        total: { value: null, confidence: 0 },
        overallConfidence: 0,
      },
      [],
    );

    expect(shouldMarkNeedsReview(normalized)).toBe(true);
    expect(normalized.total.value).toBeNull();
    expect(normalized.vendor.value).toBeNull();
  });

  it("keeps technical details available for logging while removing them from the user message", () => {
    const technicalError = new Error(
      'AI provider unavailable: 429 {"error":{"code":"credit_balance_exhausted"}}',
    );

    expect(technicalError.message).toContain("credit_balance_exhausted");
    expect(safeUserFacingMessage(technicalError)).not.toContain("credit_balance_exhausted");
    expect(safeUserFacingMessage(technicalError)).not.toContain("429");
  });
});
