import { LocalDevReceiptStorageProvider } from "./local-dev-provider";
import { VercelBlobReceiptStorageProvider } from "./vercel-blob-provider";
import type { ReceiptStorageProvider } from "./types";

function getProviderName() {
  const explicit = process.env.RECEIPT_STORAGE_PROVIDER?.trim().toLowerCase();
  if (explicit) return explicit;

  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return "vercel-blob";
  }

  return "local-dev";
}

function createProvider(): ReceiptStorageProvider {
  const provider = getProviderName();

  if (provider === "vercel-blob") {
    return new VercelBlobReceiptStorageProvider();
  }

  if (provider === "local-dev") {
    return new LocalDevReceiptStorageProvider();
  }

  throw new Error(`Unsupported receipt storage provider: ${provider}`);
}

let singleton: ReceiptStorageProvider | null = null;

export function getReceiptStorageProvider(): ReceiptStorageProvider {
  if (!singleton) singleton = createProvider();
  return singleton;
}
