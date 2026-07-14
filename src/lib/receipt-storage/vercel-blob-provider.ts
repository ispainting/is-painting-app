import { del, get, put } from "@vercel/blob";
import type {
  GetProtectedUrlInput,
  ReceiptObject,
  ReceiptStorageProvider,
  ReplaceReceiptInput,
  UploadReceiptInput,
  UploadReceiptResult,
} from "./types";

function getBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for receipt storage.");
  }
  return token;
}

async function fetchBlobObject(objectKey: string): Promise<ReceiptObject> {
  const token = getBlobToken();
  const result = await get(objectKey, {
    access: "private",
    token,
    useCache: false,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Blob fetch failed.");
  }

  const contentType = result.blob.contentType || "application/octet-stream";
  const data = await new Response(result.stream).arrayBuffer();

  return {
    objectKey,
    contentType,
    data,
  };
}

export class VercelBlobReceiptStorageProvider implements ReceiptStorageProvider {
  async upload(input: UploadReceiptInput): Promise<UploadReceiptResult> {
    const token = getBlobToken();

    const withBuffer = await put(input.objectKey, Buffer.from(input.data), {
      token,
      contentType: input.contentType,
      addRandomSuffix: false,
      access: "private",
      cacheControlMaxAge: 0,
    });

    return {
      objectKey: withBuffer.pathname,
      providerUrl: withBuffer.url,
    };
  }

  async download(objectKey: string): Promise<ReceiptObject> {
    return fetchBlobObject(objectKey);
  }

  async preview(objectKey: string): Promise<ReceiptObject> {
    return fetchBlobObject(objectKey);
  }

  async delete(objectKey: string): Promise<void> {
    const token = getBlobToken();
    await del(objectKey, { token });
  }

  async replace(input: ReplaceReceiptInput): Promise<UploadReceiptResult> {
    const uploaded = await this.upload({
      objectKey: input.newObjectKey,
      data: input.data,
      contentType: input.contentType,
      originalFilename: input.originalFilename,
    });

    await this.delete(input.oldObjectKey).catch(() => undefined);
    return uploaded;
  }

  async getProtectedUrl(_input: GetProtectedUrlInput): Promise<string | null> {
    // Blob URLs are not directly exposed to clients for private receipts.
    // API routes proxy content after auth/access checks.
    return null;
  }
}
