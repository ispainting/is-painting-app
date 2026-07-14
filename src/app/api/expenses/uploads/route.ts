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

export async function POST(req: Request) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const raw = form.get("file");

    if (!(raw instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const originalFilename = sanitizeOriginalFilename(raw.name);
    const validation = validateExpenseUpload({
      fileName: originalFilename,
      mimeType: raw.type,
      size: raw.size,
    });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    const provider = getReceiptStorageProvider();
    const objectKey = buildStoredAttachmentName(validation.extension);
    const bytes = await raw.arrayBuffer();
    const uploaded = await provider.upload({
      objectKey,
      data: bytes,
      contentType: validation.mimeType,
      originalFilename,
    });

    const attachment = await prisma.expenseAttachment.create({
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

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
