import { del, get, put } from "@vercel/blob";
import type {
  GetProtectedUrlInput,
  ReceiptObject,
  ReceiptStorageProvider,
  ReplaceReceiptInput,
  UploadReceiptInput,
  UploadReceiptResult,
} from "./types";

function getOptionalBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? token : undefined;
}

function toStorageError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("token")) {
      return new Error(
        "Vercel Blob credentials are not available. Ensure Blob is connected to this project in Vercel, or set BLOB_READ_WRITE_TOKEN for local/non-integrated environments."
      );
    }
    return error;
  }
  return new Error("Vercel Blob operation failed.");
}

async function fetchBlobObject(objectKey: string): Promise<ReceiptObject> {
  let result;
  try {
    result = await get(objectKey, {
      access: "private",
      token: getOptionalBlobToken(),
      useCache: false,
    });
  } catch (error) {
    throw toStorageError(error);
  }

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
    let withBuffer;
    try {
      withBuffer = await put(input.objectKey, Buffer.from(input.data), {
        token: getOptionalBlobToken(),
        contentType: input.contentType,
        addRandomSuffix: false,
        access: "private",
        cacheControlMaxAge: 0,
      });
    } catch (error) {
      throw toStorageError(error);
    }

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
    try {
      await del(objectKey, { token: getOptionalBlobToken() });
    } catch (error) {
      throw toStorageError(error);
    }
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
