import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_EXPENSE_UPLOAD_BYTES = 12 * 1024 * 1024;

const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic", ".heif"],
  "image/heif": [".heif", ".heic"],
};

const EXTENSIONS = new Set(Object.values(MIME_TO_EXTENSIONS).flat());

export const SUPPORTED_EXPENSE_UPLOAD_FORMATS = [
  "PDF (.pdf)",
  "JPG (.jpg, .jpeg)",
  "PNG (.png)",
  "WebP (.webp)",
  "HEIC/HEIF (.heic, .heif)",
] as const;

export function sanitizeOriginalFilename(input: string) {
  const base = path.basename(input || "receipt");
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180) || "receipt";
}

export function getExtensionFromName(fileName: string) {
  return path.extname(fileName || "").toLowerCase();
}

export function validateExpenseUpload(file: { fileName: string; mimeType: string; size: number }) {
  const extension = getExtensionFromName(file.fileName);
  const mimeType = (file.mimeType || "").toLowerCase();

  if (!mimeType || !MIME_TO_EXTENSIONS[mimeType]) {
    return { ok: false as const, reason: "Unsupported MIME type." };
  }

  if (!extension || !EXTENSIONS.has(extension)) {
    return { ok: false as const, reason: "Unsupported file extension." };
  }

  const allowedForMime = MIME_TO_EXTENSIONS[mimeType];
  if (!allowedForMime.includes(extension)) {
    return { ok: false as const, reason: "File extension does not match MIME type." };
  }

  if (file.size <= 0) {
    return { ok: false as const, reason: "File is empty." };
  }

  if (file.size > MAX_EXPENSE_UPLOAD_BYTES) {
    return {
      ok: false as const,
      reason: `File is too large. Max size is ${Math.round(MAX_EXPENSE_UPLOAD_BYTES / (1024 * 1024))}MB.`,
    };
  }

  return { ok: true as const, extension, mimeType };
}

export function buildStoredAttachmentName(extension: string) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `expense-receipts/${yyyy}/${mm}/${Date.now()}-${randomUUID()}${extension}`;
}

export function getAttachmentDownloadUrl(id: number) {
  return `/api/expenses/attachments/${id}/download`;
}

export function getAttachmentPreviewUrl(id: number) {
  return `/api/expenses/attachments/${id}/preview`;
}
