import { ExpenseCategory, ExpenseStatus } from "@prisma/client";
import { z } from "zod";
import {
  getAttachmentDownloadUrl,
} from "@/lib/expense-attachments";
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
  category: z.nativeEnum(ExpenseCategory),
  paymentMethod: z.string().trim().max(120).optional(),
  jobId: z.number().int().positive().optional(),
  employeeId: z.number().int().positive().optional(),
  notes: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  attachmentIds: z.array(z.number().int().positive()).default([]),
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
        },
      }),
    ]);

    return { jobs, employees, orphanAttachments };
  }),

  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const attachmentIds = Array.from(new Set(input.attachmentIds));
    const isEmployee = ctx.session.role === "employee";

    let attachments: Array<{ id: number }> = [];
    if (attachmentIds.length > 0) {
      attachments = await ctx.prisma.expenseAttachment.findMany({
        where: {
          id: { in: attachmentIds },
          ...(isEmployee ? { uploadedById: ctx.session.userId } : {}),
        },
        select: { id: true },
      });
      if (attachments.length !== attachmentIds.length) {
        throw new Error("One or more attachments were not found or are inaccessible.");
      }
    }

    return ctx.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          vendor: input.vendor,
          expenseDate: input.expenseDate,
          description: input.description,
          amount: input.amount,
          category: input.category,
          paymentMethod: input.paymentMethod,
          jobId: input.jobId,
          employeeId: isEmployee ? ctx.session.userId : input.employeeId,
          submittedById: ctx.session.userId,
          notes: input.notes,
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

      return expense;
    });
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
