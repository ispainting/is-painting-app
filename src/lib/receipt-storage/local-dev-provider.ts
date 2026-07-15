import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  GetProtectedUrlInput,
  ReceiptObject,
  ReceiptStorageProvider,
  ReplaceReceiptInput,
  UploadReceiptInput,
  UploadReceiptResult,
} from "./types";

const LOCAL_DEV_ROOT = path.join(process.cwd(), ".local-storage", "expenses");

function assertLocalProviderAllowed() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Local receipt storage is blocked in production/Vercel.");
  }
}

function resolveLocalPath(objectKey: string) {
  const clean = objectKey.replace(/[^A-Za-z0-9._/-]/g, "_");
  return path.join(LOCAL_DEV_ROOT, clean);
}

export class LocalDevReceiptStorageProvider implements ReceiptStorageProvider {
  async upload(input: UploadReceiptInput): Promise<UploadReceiptResult> {
    assertLocalProviderAllowed();

    const targetPath = resolveLocalPath(input.objectKey);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, Buffer.from(input.data));

    return { objectKey: input.objectKey };
  }

  async download(objectKey: string): Promise<ReceiptObject> {
    assertLocalProviderAllowed();

    const targetPath = resolveLocalPath(objectKey);
    const fileData = await readFile(targetPath);
    const data = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
    return { objectKey, data, contentType: "application/octet-stream" };
  }

  async preview(objectKey: string): Promise<ReceiptObject> {
    return this.download(objectKey);
  }

  async delete(objectKey: string): Promise<void> {
    assertLocalProviderAllowed();
    const targetPath = resolveLocalPath(objectKey);
    await unlink(targetPath).catch(() => undefined);
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
    return null;
  }
}
