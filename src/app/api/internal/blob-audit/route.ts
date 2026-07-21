import { NextResponse } from "next/server";
import { del, list } from "@vercel/blob";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type BlobItem = {
  pathname: string;
  uploadedAt: string;
  size: number;
  url: string;
};

type AttachmentMatch = {
  id: number;
  storagePath: string;
  originalFilename: string;
  expenseId: number | null;
};

type Classification =
  | "referenced production file"
  | "referenced test file"
  | "orphaned test file"
  | "orphaned unknown file";

const TEST_PATTERN =
  /test|fixture|sample|e2e|receipt-test|disabled-mode|upload-only|expense_default_sample|invoice_default_sample|petrol_default_sample|items_classifier_default_sample|expense_us_receipt|live-mapping/i;

function isAuthorized(req: Request) {
  const expected = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  const provided = req.headers.get("x-internal-key")?.trim() || "";
  return Boolean(expected && provided && expected === provided);
}

function isTestLike(blob: BlobItem, attachment?: AttachmentMatch) {
  if (TEST_PATTERN.test(blob.pathname)) return true;
  if (attachment?.originalFilename && TEST_PATTERN.test(attachment.originalFilename)) return true;
  return false;
}

function classify(blob: BlobItem, attachment?: AttachmentMatch): Classification {
  const testLike = isTestLike(blob, attachment);
  if (attachment) {
    if (testLike) return "referenced test file";
    if (attachment.expenseId) return "referenced production file";
    return "orphaned unknown file";
  }

  if (testLike) return "orphaned test file";
  return "orphaned unknown file";
}

async function listAllBlobs(prefix: string) {
  const blobs: BlobItem[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const item of page.blobs) {
      blobs.push({
        pathname: item.pathname,
        uploadedAt: item.uploadedAt.toISOString(),
        size: item.size,
        url: item.url,
      });
    }
    cursor = page.cursor;
  } while (cursor);

  return blobs;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action === "cleanup" ? "cleanup" : "audit";
  const prefix = "expense-receipts/";

  const blobs = await listAllBlobs(prefix);
  const pathnames = blobs.map((b) => b.pathname);
  const attachments = pathnames.length
    ? await prisma.expenseAttachment.findMany({
        where: { storagePath: { in: pathnames } },
        select: {
          id: true,
          storagePath: true,
          originalFilename: true,
          expenseId: true,
        },
      })
    : [];

  const attachmentByPath = new Map<string, AttachmentMatch>();
  for (const attachment of attachments) {
    attachmentByPath.set(attachment.storagePath, attachment);
  }

  const audited = blobs.map((blob) => {
    const attachment = attachmentByPath.get(blob.pathname);
    const testLike = isTestLike(blob, attachment);
    const classification = classify(blob, attachment);

    return {
      pathname: blob.pathname,
      uploadedAt: blob.uploadedAt,
      size: blob.size,
      url: blob.url,
      matchingAttachmentExists: Boolean(attachment),
      matchingAttachmentId: attachment?.id ?? null,
      referencedBySavedExpense: Boolean(attachment?.expenseId),
      looksLikeKnownTestOrFixture: testLike,
      originalFilename: attachment?.originalFilename ?? null,
      classification,
    };
  });

  const unknownFilesRequiringReview = audited.filter(
    (row) => row.classification === "orphaned unknown file" && row.matchingAttachmentExists,
  );

  let deletedPathnames: string[] = [];

  if (action === "cleanup") {
    const deletable = audited.filter((row) => {
      if (row.matchingAttachmentExists && row.referencedBySavedExpense) {
        return false;
      }

      if (!row.matchingAttachmentExists) {
        return true;
      }

      if (row.classification === "referenced test file" && !row.referencedBySavedExpense) {
        return true;
      }

      return false;
    });

    if (deletable.length > 0) {
      const paths = deletable.map((row) => row.pathname);
      await del(paths);
      deletedPathnames = paths;
    }
  }

  const remainingBlobs = await listAllBlobs(prefix);
  const remainingPaths = new Set(remainingBlobs.map((b) => b.pathname));

  const attachmentCount = await prisma.expenseAttachment.count();
  const orphanedAttachmentRecords = attachmentCount === 0
    ? 0
    : await prisma.expenseAttachment.count({
        where: {
          NOT: {
            storagePath: {
              in: Array.from(remainingPaths),
            },
          },
        },
      });

  const brokenAttachmentUrls = attachmentCount === 0
    ? 0
    : await prisma.expenseAttachment.count({
        where: {
          expenseId: { not: null },
          NOT: {
            storagePath: {
              in: Array.from(remainingPaths),
            },
          },
        },
      });

  const referencedPreserved = audited.filter(
    (row) => row.matchingAttachmentExists && row.referencedBySavedExpense,
  ).length;

  const testBlobRemaining = remainingBlobs.filter((blob) => TEST_PATTERN.test(blob.pathname)).length;

  return NextResponse.json({
    action,
    auditedCount: audited.length,
    audited,
    deletedCount: deletedPathnames.length,
    deletedPathnames,
    referencedPreserved,
    unknownFilesRequiringReview: unknownFilesRequiringReview.map((row) => row.pathname),
    validation: {
      brokenAttachmentUrls,
      orphanedAttachmentRecords,
      testBlobRemaining,
      remainingBlobCount: remainingBlobs.length,
    },
  });
}
