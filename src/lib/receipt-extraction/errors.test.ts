import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiReceiptExtractionProvider } from "./providers/openai-provider";
import { normalizeExtractionResponse, shouldMarkNeedsReview } from "./normalization";

const input = {
  attachmentId: 1,
  originalFilename: "receipt.png",
  mimeType: "image/png",
  fileData: new ArrayBuffer(0),
  jobOptions: [],
};

function providerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeUserFacingMessage(error: unknown) {
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
    const technicalMessage = providerErrorMessage(error);
    const userMessage = safeUserFacingMessage(error);

    expect(technicalMessage).toContain("AI provider unavailable: 429");
    expect(technicalMessage).toContain(body.slice(0, 20));
    expect(userMessage).toBe("Receipt reading is temporarily unavailable. You can enter the expense manually.");
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

    const provider = new OpenAiReceiptExtractionProvider();
    const extraction = provider.extract(input);
    await expect(extraction).rejects.toThrow("AI timeout: receipt reading exceeded the allowed time.");
    const error = await extraction.catch((reason) => reason);

    expect(providerErrorMessage(error)).toContain("AI timeout");
    expect(safeUserFacingMessage(error)).toBe(
      "Receipt reading timed out. You can enter the expense manually.",
    );
  }, 50_000);

  it("returns a safe unavailable/manual-entry message for a network error", async () => {
    const networkError = new Error("fetch failed: ECONNRESET");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    const error = await new OpenAiReceiptExtractionProvider().extract(input).catch((reason) => reason);

    expect(providerErrorMessage(error)).toContain("ECONNRESET");
    expect(safeUserFacingMessage(error)).toBe("Receipt reading failed. You can enter the expense manually.");
    expect(safeUserFacingMessage(error)).not.toContain("ECONNRESET");
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

  it("treats malformed provider output as a recoverable extraction failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "not json" }), { status: 200 })));

    await expect(new OpenAiReceiptExtractionProvider().extract(input)).rejects.toThrow(
      "AI response returned invalid JSON.",
    );
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
