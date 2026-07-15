import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getReceiptStorageProvider } from "@/lib/receipt-storage";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid attachment id." }, { status: 400 });
  }

  const attachment = await prisma.expenseAttachment.findUnique({
    where: { id },
    select: {
      id: true,
      storagePath: true,
      originalFilename: true,
      mimeType: true,
      expense: {
        select: { submittedById: true },
      },
      uploadedById: true,
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const canAccess =
    session.role === "admin" ||
    attachment.uploadedById === session.userId ||
    attachment.expense?.submittedById === session.userId;

  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const provider = getReceiptStorageProvider();

  try {
    const protectedUrl = await provider.getProtectedUrl({
      objectKey: attachment.storagePath,
      disposition: "inline",
      filename: attachment.originalFilename,
    });
    if (protectedUrl) {
      return NextResponse.redirect(protectedUrl);
    }

    const object = await provider.preview(attachment.storagePath);
    return new Response(object.data, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.originalFilename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File is missing from object storage." }, { status: 404 });
  }
}
