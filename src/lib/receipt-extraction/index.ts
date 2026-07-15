import { OpenAiReceiptExtractionProvider } from "./providers/openai-provider";
import type { ReceiptExtractionInput, ReceiptExtractionProvider } from "./types";

function getProviderName() {
  return process.env.RECEIPT_EXTRACTION_PROVIDER?.trim().toLowerCase() || "openai";
}

function createProvider(): ReceiptExtractionProvider {
  const provider = getProviderName();
  if (provider === "openai") {
    return new OpenAiReceiptExtractionProvider();
  }
  throw new Error(`Unsupported receipt extraction provider: ${provider}`);
}

let singleton: ReceiptExtractionProvider | null = null;

export function getReceiptExtractionProvider() {
  if (!singleton) singleton = createProvider();
  return singleton;
}

export async function extractReceipt(input: ReceiptExtractionInput) {
  return getReceiptExtractionProvider().extract(input);
}

export * from "./types";
