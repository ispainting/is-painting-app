import { ManusReceiptExtractionProvider } from "./providers/manus-provider";
import { GoogleDocumentAiReceiptExtractionProvider } from "./providers/google-document-ai-provider";
import type { ReceiptExtractionInput, ReceiptExtractionProvider } from "./types";

function createProvider(): ReceiptExtractionProvider {
  const configured = (process.env.RECEIPT_EXTRACTION_PROVIDER || "google_document_ai").trim().toLowerCase();
  if (configured === "manus") {
    return new ManusReceiptExtractionProvider();
  }
  return new GoogleDocumentAiReceiptExtractionProvider();
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
