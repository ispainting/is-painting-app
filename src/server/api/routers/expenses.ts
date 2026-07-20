import { ExpenseCategory, ExpenseStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  getAttachmentDownloadUrl,
} from "@/lib/expense-attachments";
import { buildConfidenceByField, extractReceipt } from "@/lib/receipt-extraction";
import { getReceiptStorageProvider } from "@/lib/receipt-storage";
import { adminProcedure, protectedProcedure, router } from "../trpc";

const listInput = z
  .object({
    search: z.string().trim().optional(),
    status: z.nativeEnum(ExpenseStatus).optional(),
    category: z.nativeEnum(ExpenseCategory).optional(),
    jobId: z.number().int().positive().optional(),
    employeeId: z.number().int().positive().optional(),
    sortBy: z
      .enum(["date", "amount", "vendor", "status", "createdAt"])
      .default("date"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
  })
  .optional();

const createInput = z.object({
  vendor: z.string().trim().max(160).optional(),
  expenseDate: z.coerce.date(),
  description: z.string().trim().max(500).optional(),
  amount: z.number().positive(),
  subtotal: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  category: z.nativeEnum(ExpenseCategory),
  paymentMethod: z.string().trim().max(120).optional(),
  receiptNumber: z.string().trim().max(100).optional(),
  invoiceNumber: z.string().trim().max(100).optional(),
  jobId: z.number().int().positive().optional(),
  employeeId: z.number().int().positive().optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  attachmentIds: z.array(z.number().int().positive()).default([]),
  extractedRawText: z.string().trim().optional(),
  extractedStructured: z.unknown().optional(),
  extractedConfidence: z.number().min(0).max(1).optional(),
  lineItems: z.array(
    z.object({
      description: z.string().trim().min(1).max(300),
      quantity: z.number().nonnegative().nullable().optional(),
      unitPrice: z.number().nonnegative().nullable().optional(),
      totalPrice: z.number().nonnegative().nullable().optional(),
    })
  ).default([]),
});

export const expensesRouter = router({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const search = input?.search?.trim();
    const where = {
      ...(ctx.session.role === "employee" && { submittedById: ctx.session.userId }),
      ...(input?.status && { status: input.status }),
      ...(input?.category && { category: input.category }),
      ...(input?.jobId && { jobId: input.jobId }),
      ...(input?.employeeId && { employeeId: input.employeeId }),
      ...(search && {
        OR: [
          { vendor: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
          { notes: { contains: search, mode: "insensitive" as const } },
          { job: { name: { contains: search, mode: "insensitive" as const } } },
        ],
      }),
    };

    const orderBy =
      input?.sortBy === "amount"
        ? { amount: input.sortDir }
        : input?.sortBy === "vendor"
          ? { vendor: input.sortDir }
          : input?.sortBy === "status"
            ? { status: input.sortDir }
            : input?.sortBy === "createdAt"
              ? { createdAt: input.sortDir }
              : { expenseDate: input?.sortDir ?? "desc" };

    return ctx.prisma.expense.findMany({
      where,
      include: {
        job: { select: { id: true, name: true } },
        employee: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        attachments: {
          orderBy: { uploadedAt: "desc" },
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
          },
        },
      },
      orderBy,
      take: 500,
    });
  }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const where = ctx.session.role === "employee" ? { submittedById: ctx.session.userId } : {};

    const [expenseAgg, pendingUploads] = await Promise.all([
      ctx.prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      ctx.prisma.expenseAttachment.count({
        where: {
          expenseId: null,
          ...(ctx.session.role === "employee" ? { uploadedById: ctx.session.userId } : {}),
        },
      }),
    ]);

    return {
      totalExpenses: Number(expenseAgg._sum.amount ?? 0),
      expenseCount: expenseAgg._count._all,
      pendingUploads,
    };
  }),

  meta: protectedProcedure.query(async ({ ctx }) => {
    const [jobs, employees, orphanAttachments] = await Promise.all([
      ctx.prisma.job.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      ctx.prisma.user.findMany({
        where: { role: "employee", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      ctx.prisma.expenseAttachment.findMany({
        where: {
          expenseId: null,
          ...(ctx.session.role === "employee" ? { uploadedById: ctx.session.userId } : {}),
        },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
          extractionStatus: true,
          extractionError: true,
          extractionConfidence: true,
          extractionProcessedAt: true,
        },
      }),
    ]);

    return { jobs, employees, orphanAttachments };
  }),

  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const attachmentIds = Array.from(new Set(input.attachmentIds));
    const isEmployee = ctx.session.role === "employee";

    let attachments: Array<{
      id: number;
      extractionRawText: string | null;
      extractionStructured: Prisma.JsonValue | null;
      extractionConfidence: Prisma.Decimal | null;
    }> = [];
    if (attachmentIds.length > 0) {
      attachments = await ctx.prisma.expenseAttachment.findMany({
        where: {
          id: { in: attachmentIds },
          ...(isEmployee ? { uploadedById: ctx.session.userId } : {}),
        },
        select: {
          id: true,
          extractionRawText: true,
          extractionStructured: true,
          extractionConfidence: true,
        },
      });
      if (attachments.length !== attachmentIds.length) {
        throw new Error("One or more attachments were not found or are inaccessible.");
      }
    }

    const primaryAttachment = attachments[0];
    const inputStructured = input.extractedStructured === undefined
      ? undefined
      : (input.extractedStructured as Prisma.InputJsonValue);
    const attachmentStructured = primaryAttachment?.extractionStructured == null
      ? undefined
      : (primaryAttachment.extractionStructured as Prisma.InputJsonValue);
    const attachmentConfidence = primaryAttachment?.extractionConfidence == null
      ? undefined
      : Number(primaryAttachment.extractionConfidence);

    return ctx.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          vendor: input.vendor,
          expenseDate: input.expenseDate,
          description: input.description,
          amount: input.amount,
          subtotal: input.subtotal,
          tax: input.tax,
          category: input.category,
          paymentMethod: input.paymentMethod,
          receiptNumber: input.receiptNumber,
          invoiceNumber: input.invoiceNumber,
          jobId: input.jobId,
          employeeId: isEmployee ? ctx.session.userId : input.employeeId,
          submittedById: ctx.session.userId,
          notes: input.notes,
          extractedData: inputStructured ?? attachmentStructured,
          ocrRawText: input.extractedRawText ?? primaryAttachment?.extractionRawText,
          ocrStructured: inputStructured ?? attachmentStructured,
          ocrConfidence:
            input.extractedConfidence
            ?? attachmentConfidence,
          status: input.status ?? "pending",
          receiptUrl:
            attachmentIds.length > 0
              ? getAttachmentDownloadUrl(attachmentIds[0])
              : undefined,
        },
      });

      if (attachmentIds.length > 0) {
        await tx.expenseAttachment.updateMany({
          where: { id: { in: attachmentIds } },
          data: { expenseId: expense.id },
        });
      }

      if (input.lineItems.length > 0) {
        await tx.expenseLineItem.createMany({
          data: input.lineItems.map((item) => ({
            expenseId: expense.id,
            description: item.description,
            quantity: item.quantity ?? null,
            unitPrice: item.unitPrice ?? null,
            total: item.totalPrice ?? null,
          })),
        });
      }

      return expense;
    });
  }),

  extractReceipt: protectedProcedure
    .input(z.object({ attachmentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const provider = getReceiptStorageProvider();
      const attachment = await ctx.prisma.expenseAttachment.findUnique({
        where: { id: input.attachmentId },
        select: {
          id: true,
          uploadedById: true,
          storagePath: true,
          originalFilename: true,
          mimeType: true,
          extractionStatus: true,
          expense: {
            select: { submittedById: true },
          },
        },
      });

      if (!attachment) {
        throw new Error("Attachment not found.");
      }

      const canAccess =
        ctx.session.role === "admin"
        || attachment.uploadedById === ctx.session.userId
        || attachment.expense?.submittedById === ctx.session.userId;
      if (!canAccess) {
        throw new Error("Forbidden");
      }

      await ctx.prisma.expenseAttachment.update({
        where: { id: attachment.id },
        data: {
          extractionStatus: "processing",
          extractionError: null,
          extractionStartedAt: new Date(),
        },
      });

      const extractionStartedAt = Date.now();
      try {
        const object = await provider.download(attachment.storagePath);
        const jobs = await ctx.prisma.job.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 500,
        });

        const extracted = await extractReceipt({
          attachmentId: attachment.id,
          originalFilename: attachment.originalFilename,
          mimeType: attachment.mimeType,
          fileData: object.data,
          jobOptions: jobs,
        });

        const status = extracted.needsReview ? "needs_review" : "completed";
        await ctx.prisma.expenseAttachment.update({
          where: { id: attachment.id },
          data: {
            extractionStatus: status,
            extractionRawText: extracted.normalized.rawText,
            extractionStructured: extracted.normalized,
            extractionConfidence: extracted.normalized.overallConfidence,
            extractionConfidenceByField: buildConfidenceByField(extracted.normalized),
            extractionProvider: extracted.provider,
            extractionModel: extracted.model,
            extractionError: null,
            extractionProcessedAt: new Date(),
          },
        });

        console.info("[receipt-extraction] completed", {
          attachmentId: attachment.id,
          provider: extracted.provider,
          model: extracted.model,
          taskId: extracted.metadata?.taskId ?? null,
          creditsUsed: extracted.metadata?.creditsUsed ?? null,
          durationMs: extracted.metadata?.durationMs ?? (Date.now() - extractionStartedAt),
          success: extracted.metadata?.success ?? true,
          status: extracted.metadata?.status ?? status,
          overallConfidence: extracted.normalized.overallConfidence,
        });

        return {
          status,
          attachmentId: attachment.id,
          message: status === "needs_review" ? "Receipt extracted with low confidence. Needs review." : "Receipt extracted successfully.",
          data: extracted.normalized,
          rawStructuredOutput: extracted.metadata?.rawStructuredOutput ?? null,
          parsedNormalizedOutput: extracted.metadata?.parsedNormalizedOutput ?? extracted.normalized,
          provider: extracted.provider,
          model: extracted.model,
          runtime: {
            vercelEnv: process.env.VERCEL_ENV ?? null,
            manusApiKey: process.env.MANUS_API_KEY ? "FOUND" : "MISSING",
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Receipt extraction failed.";
        await ctx.prisma.expenseAttachment.update({
          where: { id: attachment.id },
          data: {
            extractionStatus: "failed",
            extractionError: message,
            extractionProcessedAt: new Date(),
          },
        });

        console.warn("[receipt-extraction] failed", {
          attachmentId: attachment.id,
          provider: "manus",
          model: "manus-1.6",
          taskId: null,
          creditsUsed: null,
          durationMs: Date.now() - extractionStartedAt,
          success: false,
          status: "failed",
          overallConfidence: null,
          error: message,
        });

        return {
          status: "failed" as const,
          attachmentId: attachment.id,
          message,
          data: null,
          provider: "manus",
          model: "manus-1.6",
          runtime: {
            vercelEnv: process.env.VERCEL_ENV ?? null,
            manusApiKey: process.env.MANUS_API_KEY ? "FOUND" : "MISSING",
          },
        };
      }
    }),

  replaceAttachment: protectedProcedure
    .input(
      z.object({
        expenseId: z.number().int().positive(),
        newAttachmentId: z.number().int().positive(),
        oldAttachmentId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = getReceiptStorageProvider();
      const expense = await ctx.prisma.expense.findUnique({
        where: { id: input.expenseId },
        select: { id: true, submittedById: true },
      });
      if (!expense) throw new Error("Expense not found.");
      if (ctx.session.role === "employee" && expense.submittedById !== ctx.session.userId) {
        throw new Error("You do not have permission to edit this expense.");
      }

      const [newAttachment, oldAttachment] = await Promise.all([
        ctx.prisma.expenseAttachment.findUnique({
        where: { id: input.newAttachmentId },
        select: { id: true, uploadedById: true },
        }),
        input.oldAttachmentId
          ? ctx.prisma.expenseAttachment.findFirst({
              where: { id: input.oldAttachmentId, expenseId: input.expenseId },
              select: { id: true, storagePath: true },
            })
          : Promise.resolve(null),
      ]);
      if (!newAttachment) throw new Error("Replacement attachment not found.");
      if (ctx.session.role === "employee" && newAttachment.uploadedById !== ctx.session.userId) {
        throw new Error("You do not have permission to use this attachment.");
      }
      if (input.oldAttachmentId && !oldAttachment) {
        throw new Error("Current attachment was not found on this expense.");
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.expenseAttachment.update({
          where: { id: input.newAttachmentId },
          data: { expenseId: input.expenseId },
        });

        if (oldAttachment) {
          await tx.expenseAttachment.delete({ where: { id: oldAttachment.id } });
        }

        await tx.expense.update({
          where: { id: input.expenseId },
          data: { receiptUrl: getAttachmentDownloadUrl(input.newAttachmentId) },
        });
      });

      if (oldAttachment) {
        await provider.delete(oldAttachment.storagePath).catch(() => undefined);
      }

      return { ok: true };
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const provider = getReceiptStorageProvider();
      const attachment = await ctx.prisma.expenseAttachment.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          expenseId: true,
          uploadedById: true,
          storagePath: true,
        },
      });

      if (!attachment) throw new Error("Attachment not found.");
      if (ctx.session.role === "employee" && attachment.uploadedById !== ctx.session.userId) {
        throw new Error("You do not have permission to delete this attachment.");
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.expenseAttachment.delete({ where: { id: input.id } });

        if (attachment.expenseId) {
          const replacement = await tx.expenseAttachment.findFirst({
            where: { expenseId: attachment.expenseId },
            orderBy: { uploadedAt: "desc" },
            select: { id: true },
          });
          await tx.expense.update({
            where: { id: attachment.expenseId },
            data: {
              receiptUrl: replacement ? getAttachmentDownloadUrl(replacement.id) : null,
            },
          });
        }
      });

      await provider.delete(attachment.storagePath).catch(() => undefined);

      return { ok: true };
    }),

  approve: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.expense.update({
      where: { id: input.id },
      data: { status: "approved", approvedById: ctx.session.userId },
    })
  ),

  reject: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.expense.update({
      where: { id: input.id },
      data: { status: "rejected", approvedById: ctx.session.userId },
    })
  ),
});
