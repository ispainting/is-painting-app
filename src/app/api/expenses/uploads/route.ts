import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import {
  buildStoredAttachmentName,
  sanitizeOriginalFilename,
  validateExpenseUpload,
} from "@/lib/expense-attachments";
import { getReceiptStorageProvider } from "@/lib/receipt-storage";

export const runtime = "nodejs";

const DEBUG_EXPENSE_UPLOADS = process.env.DEBUG_EXPENSE_UPLOADS === "1";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Upload failed.";
}

function getUploadErrorStatus(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("timed out")) return 504;
  if (normalized.includes("credentials") || normalized.includes("token")) return 503;
  return 500;
}

export async function POST(req: Request) {
  const requestId = `exp-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const debug = (...args: unknown[]) => {
    if (!DEBUG_EXPENSE_UPLOADS) return;
    console.info(`[${requestId}]`, ...args);
  };

  const session = getSessionFromRequest(req);
  if (!session) {
    debug("unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    debug("start", { userId: session.userId });
    const form = await req.formData();
    const raw = form.get("file");

    if (!(raw instanceof File)) {
      debug("invalid payload: file missing");
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const originalFilename = sanitizeOriginalFilename(raw.name);
    const validation = validateExpenseUpload({
      fileName: originalFilename,
      mimeType: raw.type,
      size: raw.size,
    });

    if (!validation.ok) {
      debug("validation failed", { reason: validation.reason });
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const provider = getReceiptStorageProvider();
    const objectKey = buildStoredAttachmentName(validation.extension);
    const bytes = await raw.arrayBuffer();

    debug("blob upload begin", { objectKey, bytes: bytes.byteLength });
    const uploaded = await provider.upload({
      objectKey,
      data: bytes,
      contentType: validation.mimeType,
      originalFilename,
    });
    debug("blob upload complete", { storagePath: uploaded.objectKey });

    let attachment;
    try {
      debug("db insert begin");
      attachment = await prisma.expenseAttachment.create({
        data: {
          originalFilename,
          storagePath: uploaded.objectKey,
          mimeType: validation.mimeType,
          sizeBytes: raw.size,
          uploadedById: session.userId,
        },
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
        },
      });
      debug("db insert complete", { attachmentId: attachment.id });
    } catch (dbError) {
      const dbMessage = getErrorMessage(dbError);
      debug("db insert failed; attempting blob cleanup", { message: dbMessage });
      await provider.delete(uploaded.objectKey).catch((cleanupError) => {
        debug("blob cleanup failed", { message: getErrorMessage(cleanupError) });
      });
      return NextResponse.json(
        { error: "Upload failed while saving metadata. Please retry." },
        { status: 500 }
      );
    }

    debug("response complete", { elapsedMs: Date.now() - startedAt });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = getUploadErrorStatus(message);
    debug("request failed", { message, status, elapsedMs: Date.now() - startedAt });
    return NextResponse.json({ error: message }, { status });
  }
}
