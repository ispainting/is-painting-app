import { normalizeExtractionResponse, shouldMarkNeedsReview } from "../normalization";
import { createOpenAiHttpError, normalizeReceiptExtractionError, ReceiptExtractionError } from "../errors";
import { normalizeReceiptFile } from "../file-normalization";
import type {
  ReceiptExtractionInput,
  ReceiptExtractionProvider,
  ReceiptExtractionResult,
} from "../types";

const DEFAULT_MODEL = process.env.RECEIPT_EXTRACTION_OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const API_URL = process.env.RECEIPT_EXTRACTION_OPENAI_URL?.trim() || "https://api.openai.com/v1/responses";
const TIMEOUT_MS = Number(process.env.RECEIPT_EXTRACTION_TIMEOUT_MS || "45000");
const MAX_ATTEMPTS = 2;

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new ReceiptExtractionError({ kind: "missing_configuration", userMessage: "Receipt scanning is not configured right now. The receipt is attached, and you can enter the expense manually.", logMessage: "OPENAI_API_KEY is missing." });
  }
  return key;
}

function extractJsonFromOutput(payload: any): unknown {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return tryParseJson(payload.output_text);
  }

  const message = Array.isArray(payload?.output)
    ? payload.output.find((item: any) => item?.type === "message")
    : null;

  if (message?.content && Array.isArray(message.content)) {
    for (const entry of message.content) {
      if (entry?.type === "output_text" && typeof entry?.text === "string") {
        return tryParseJson(entry.text);
      }
    }
  }

  throw new Error("AI response did not include valid JSON output.");
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = trimmed.slice(first, last + 1);
      return JSON.parse(candidate);
    }
    throw new Error("AI response returned invalid JSON.");
  }
}

function buildPrompt(jobOptions: Array<{ id: number; name: string }>) {
  return [
    "You are extracting data from a business receipt image.",
    "Return JSON only. No markdown. No extra keys.",
    "If uncertain, return null values and low confidence.",
    "Confidences must be between 0 and 1.",
    "Use YYYY-MM-DD for date.",
    "Suggested category should be one of: paint, materials, labor, tools, equipment, rentals, fuel, subcontractor, travel, ferry, payroll_related, office, advertising, insurance, vehicle, meals, other.",
    "Extract only vendor, category, amount, date, and description. Do not extract subtotal, tax, payment method, receipt number, invoice number, line items, jobs, or raw receipt text.",
    "If category is uncertain, return null; the expense form will default it to materials.",
    "JSON shape (amount is the final receipt total):",
    JSON.stringify({
      vendor: { value: "string|null", confidence: 0.5 },
      category: { value: "string|null", confidence: 0.5 },
      amount: { value: "number|null", confidence: 0.5 },
      date: { value: "YYYY-MM-DD|null", confidence: 0.5 },
      description: { value: "string|null", confidence: 0.5 },
    }),
  ].join("\n");
}

export class OpenAiReceiptExtractionProvider implements ReceiptExtractionProvider {
  constructor(private readonly options: {
    fetch?: typeof fetch;
    timeoutMs?: number;
    maxAttempts?: number;
    retryDelayMs?: number;
  } = {}) {}

  async extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult> {
    const apiKey = getApiKey();
    const file = await normalizeReceiptFile({ data: input.fileData, mimeType: input.mimeType, filename: input.originalFilename });
    const base64 = Buffer.from(file.data).toString("base64");
    const fileContent = file.mimeType === "application/pdf"
      ? { type: "input_file", filename: file.filename, file_data: `data:application/pdf;base64,${base64}` }
      : { type: "input_image", image_url: `data:${file.mimeType};base64,${base64}` };
    const fetchImpl = this.options.fetch ?? fetch;
    const maxAttempts = this.options.maxAttempts ?? MAX_ATTEMPTS;
    let lastError: ReceiptExtractionError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? TIMEOUT_MS);
      try {
        const response = await fetchImpl(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: buildPrompt(input.jobOptions) },
                  fileContent,
                ],
              },
            ],
          }),
        });

        if (!response.ok) {
          const details = await response.text().catch(() => "");
          throw createOpenAiHttpError(response.status, details.slice(0, 300));
        }

        const payload = await response.json().catch((error) => {
          throw new ReceiptExtractionError({ kind: "malformed_response", userMessage: "The receipt was attached, but the scanner could not understand the result. Retry reading or enter the expense manually.", logMessage: "OpenAI response body was not valid JSON.", cause: error });
        });
        const json = extractJsonFromOutput(payload);
        const normalized = normalizeExtractionResponse(json, input.jobOptions);

        return {
          normalized,
          provider: "openai",
          model: DEFAULT_MODEL,
          needsReview: shouldMarkNeedsReview(normalized),
        };
      } catch (error) {
        lastError = error instanceof Error && error.name === "AbortError"
          ? new ReceiptExtractionError({ kind: "timeout", userMessage: "Receipt scanning timed out. The receipt is attached; retry reading or enter the expense manually.", logMessage: "OpenAI receipt extraction timed out.", cause: error, retryable: true })
          : normalizeReceiptExtractionError(error);
        if (!lastError.retryable || attempt >= maxAttempts) throw lastError;
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 250 * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new Error("Receipt extraction failed.");
  }
}
