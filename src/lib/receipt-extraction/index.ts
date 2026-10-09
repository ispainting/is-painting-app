import { OpenAiReceiptExtractionProvider, describeOpenAiApiKeyConfiguration } from "./providers/openai-provider";
import { ReceiptExtractionError } from "./errors";
import type { ReceiptExtractionInput, ReceiptExtractionProvider } from "./types";

function getConfiguredProviderName() {
  return process.env.RECEIPT_EXTRACTION_PROVIDER?.trim().toLowerCase() || "";
}

function createProvider(): ReceiptExtractionProvider {
  const configured = getConfiguredProviderName();
  if (configured && configured !== "openai") {
    // Reject stale overrides such as google_document_ai; never silently fall back.
    throw new ReceiptExtractionError({
      kind: "missing_configuration",
      userMessage: "Receipt scanning is not configured right now. The receipt is attached, and you can enter the expense manually.",
      logMessage: `Stale receipt extraction provider configured: "${configured}". OpenAI is required when OPENAI_API_KEY exists.`,
    });
  }
  return new OpenAiReceiptExtractionProvider();
}

let singleton: ReceiptExtractionProvider | null = null;

export function getReceiptExtractionProvider() {
  if (!singleton) {
    singleton = createProvider();
    console.info({
      event: "receipt_extraction_provider_selected",
      provider: "openai",
      openAiKeyConfig: describeOpenAiApiKeyConfiguration(),
    });
  }
  return singleton;
}

export async function extractReceipt(input: ReceiptExtractionInput) {
  return getReceiptExtractionProvider().extract(input);
}

export * from "./types";
