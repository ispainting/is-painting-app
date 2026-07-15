import { ManusReceiptExtractionProvider } from "./providers/manus-provider";
import type { ReceiptExtractionInput, ReceiptExtractionProvider } from "./types";

function createProvider(): ReceiptExtractionProvider {
  return new ManusReceiptExtractionProvider();
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
