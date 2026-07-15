import { normalizeExtractionResponse, shouldMarkNeedsReview } from "../normalization";
import type {
  ReceiptExtractionInput,
  ReceiptExtractionProvider,
  ReceiptExtractionResult,
} from "../types";

const DEFAULT_MODEL = process.env.RECEIPT_EXTRACTION_OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const API_URL = process.env.RECEIPT_EXTRACTION_OPENAI_URL?.trim() || "https://api.openai.com/v1/responses";
const TIMEOUT_MS = Number(process.env.RECEIPT_EXTRACTION_TIMEOUT_MS || "45000");

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("AI provider unavailable: OPENAI_API_KEY is missing.");
  }
  return key;
}

function ensureSupportedMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  const supported = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

  if (supported.includes(normalized)) return;
  if (normalized === "application/pdf") {
    throw new Error("PDF extraction failed: current AI provider is configured for image receipts only.");
  }
  throw new Error(`Unsupported file type for AI reading: ${mimeType}`);
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
  const jobNameList = jobOptions.slice(0, 200).map((job) => job.name).join(" | ");
  return [
    "You are extracting data from a business receipt image.",
    "Return JSON only. No markdown. No extra keys.",
    "If uncertain, return null values and low confidence.",
    "Confidences must be between 0 and 1.",
    "Use YYYY-MM-DD for date.",
    "Suggested category should be one of: paint, materials, labor, tools, equipment, rentals, fuel, subcontractor, travel, ferry, payroll_related, office, advertising, insurance, vehicle, meals, other.",
    "Suggest a job only when strong evidence exists in receipt text.",
    `Known jobs: ${jobNameList || "none"}`,
    "JSON shape:",
    JSON.stringify({
      vendor: { value: "string|null", confidence: 0.5 },
      date: { value: "YYYY-MM-DD|null", confidence: 0.5 },
      subtotal: { value: "number|null", confidence: 0.5 },
      tax: { value: "number|null", confidence: 0.5 },
      total: { value: "number|null", confidence: 0.5 },
      paymentMethod: { value: "string|null", confidence: 0.5 },
      receiptNumber: { value: "string|null", confidence: 0.5 },
      category: { value: "string|null", confidence: 0.5 },
      description: { value: "string|null", confidence: 0.5 },
      items: [
        {
          description: "string",
          quantity: "number|null",
          unitPrice: "number|null",
          totalPrice: "number|null",
          confidence: 0.5,
        },
      ],
      rawText: "string|null",
      overallConfidence: 0.5,
      suggestedJob: {
        jobName: "string|null",
        confidence: 0.5,
        reason: "string|null",
      },
    }),
  ].join("\n");
}

export class OpenAiReceiptExtractionProvider implements ReceiptExtractionProvider {
  async extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult> {
    ensureSupportedMime(input.mimeType);

    const apiKey = getApiKey();
    const base64 = Buffer.from(input.fileData).toString("base64");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
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
                {
                  type: "input_image",
                  image_url: `data:${input.mimeType};base64,${base64}`,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`AI provider unavailable: ${response.status} ${details.slice(0, 300)}`);
      }

      const payload = await response.json();
      const json = extractJsonFromOutput(payload);
      const normalized = normalizeExtractionResponse(json, input.jobOptions);

      return {
        normalized,
        provider: "openai",
        model: DEFAULT_MODEL,
        needsReview: shouldMarkNeedsReview(normalized),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AI timeout: receipt reading exceeded the allowed time.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
