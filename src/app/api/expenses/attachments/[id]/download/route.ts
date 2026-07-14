import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { getExpenseStorageRoot } from "@/lib/expense-attachments";

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

  const filePath = path.join(getExpenseStorageRoot(), attachment.storagePath);

  try {
    const data = await readFile(filePath);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.originalFilename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File is missing from storage." }, { status: 404 });
  }
}
