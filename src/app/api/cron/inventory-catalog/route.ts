import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildConfidenceByField, extractReceipt, normalizedReceiptExtractionSchema } from "@/lib/receipt-extraction";
import { getReceiptStorageProvider } from "@/lib/receipt-storage";
import { syncReceiptLineItemsToInventory } from "@/lib/inventory/receipt-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MATERIAL_EXPENSE_CATEGORIES = ["paint", "materials", "tools", "equipment", "rentals"] as const;
const BACKFILL_BATCH_SIZE = 3;
const HISTORY_WINDOW_MS = 183 * 24 * 60 * 60 * 1000;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasBeenScanned(value: unknown) {
  return Boolean(value && typeof value === "object" && "catalogBackfillProcessedAt" in value);
}

async function backfillReceiptLines(now: Date) {
  const attachments = await prisma.expenseAttachment.findMany({
    where: {
      uploadedAt: { gte: new Date(now.getTime() - HISTORY_WINDOW_MS) },
      expense: {
        is: {
          category: { in: [...MATERIAL_EXPENSE_CATEGORIES] },
          status: { not: "rejected" },
          duplicateStatus: "clear",
          reviewStatus: { in: ["reviewed", "approved"] },
        },
      },
      extractionAttemptCount: { lt: 3 },
    },
    include: {
      expense: { select: { id: true, lineItems: { select: { id: true } } } },
    },
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
    take: 1000,
  });

  const pending = attachments.filter((attachment) => {
    if (!attachment.expense || attachment.expense.lineItems.length > 0) return false;
    return !hasBeenScanned(attachment.extractionStructured);
  }).slice(0, BACKFILL_BATCH_SIZE);

  if (pending.length === 0) return { processed: 0, remaining: 0, newLines: 0 };

  const [provider, jobs] = await Promise.all([
    Promise.resolve(getReceiptStorageProvider()),
    prisma.job.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  let newLines = 0;
  let processed = 0;

  for (const attachment of pending) {
    if (!attachment.expense) continue;
    try {
      await prisma.expenseAttachment.update({ where: { id: attachment.id }, data: { extractionStatus: "processing", extractionError: null, extractionStartedAt: now, extractionAttemptCount: { increment: 1 } } });
      const prior = attachment.extractionStructured as { items?: unknown[] } | null;
      const hasSavedItems = Array.isArray(prior?.items) && prior.items.length > 0;
      const extracted = hasSavedItems ? null : await extractReceipt({
        attachmentId: attachment.id,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        fileData: (await provider.download(attachment.storagePath)).data,
        jobOptions: jobs,
      });
      const normalized = hasSavedItems
        ? normalizedReceiptExtractionSchema.parse(attachment.extractionStructured)
        : extracted!.normalized;
      const needsReview = extracted?.needsReview ?? attachment.extractionStatus === "needs_review";
      const providerName = extracted?.provider ?? attachment.extractionProvider ?? "historical";
      const modelName = extracted?.model ?? attachment.extractionModel ?? "historical";
      const marker = { ...normalized, catalogBackfillProcessedAt: now.toISOString() };
      const lines = normalized.items.filter((item) => item.confidence >= 0.65);

      await prisma.$transaction(async (tx) => {
        await tx.expenseAttachment.update({
          where: { id: attachment.id },
          data: {
            extractionStatus: needsReview ? "needs_review" : "completed",
            extractionRawText: normalized.rawText,
            extractionStructured: marker,
            extractionConfidence: normalized.overallConfidence,
            extractionConfidenceByField: buildConfidenceByField(normalized),
            extractionProvider: providerName,
            extractionModel: modelName,
            extractionProcessedAt: now,
            extractionError: null,
          },
        });
        await tx.expense.update({
          where: { id: attachment.expense!.id },
          data: { ocrRawText: normalized.rawText, ocrStructured: marker, ocrConfidence: normalized.overallConfidence },
        });
        if (lines.length) {
          await tx.expenseLineItem.createMany({
            data: lines.map((item) => ({
              expenseId: attachment.expense!.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.totalPrice,
            })),
          });
        }
      });
      newLines += lines.length;
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Receipt scan failed";
      console.error("[cron/inventory-catalog] Receipt backfill failed", { attachmentId: attachment.id, message });
      await prisma.expenseAttachment.update({
        where: { id: attachment.id },
        data: { extractionStatus: "failed", extractionError: message.slice(0, 1000), extractionProcessedAt: now },
      }).catch(() => undefined);
    }
  }

  const after = await prisma.expenseAttachment.findMany({
    where: {
      uploadedAt: { gte: new Date(now.getTime() - HISTORY_WINDOW_MS) },
      expense: { is: { category: { in: [...MATERIAL_EXPENSE_CATEGORIES] }, status: { not: "rejected" }, duplicateStatus: "clear", reviewStatus: { in: ["reviewed", "approved"] } } },
      extractionAttemptCount: { lt: 3 },
    },
    select: { extractionStructured: true, expense: { select: { lineItems: { select: { id: true } } } } },
    take: 1000,
  });
  const remaining = after.filter((item) => item.expense?.lineItems.length === 0 && !hasBeenScanned(item.extractionStructured)).length;
  return { processed, remaining, newLines };
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const now = new Date();
    const backfill = await backfillReceiptLines(now);
    const catalog = await syncReceiptLineItemsToInventory(prisma);
    return NextResponse.json({ ok: true, backfill, catalog, generatedAt: now.toISOString() });
  } catch (error) {
    console.error("[cron/inventory-catalog] Scheduled receipt catalog sync failed", error);
    return NextResponse.json({ error: "Inventory catalog sync failed" }, { status: 500 });
  }
}
