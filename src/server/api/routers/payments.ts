import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import {
  calculateInvoicePaymentState,
  unpaidInvoiceStatus,
  validatePaymentTarget,
  type InvoiceStatusValue,
} from "@/lib/invoice-calculations";

const MethodZ = z.enum(["check", "cash", "credit_card", "bank_transfer", "other"]);

async function recomputeInvoice(tx: Prisma.TransactionClient, invoiceId: number) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, total: true, status: true, sentAt: true, dueDate: true },
  });
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });

  const aggregate = await tx.payment.aggregate({ where: { invoiceId, status: { not: "bounced" } }, _sum: { amount: true } });
  const state = calculateInvoicePaymentState(
    Number(invoice.total),
    Number(aggregate._sum.amount ?? 0),
    unpaidInvoiceStatus({ ...invoice, status: invoice.status as InvoiceStatusValue }),
  );
  return tx.invoice.update({
    where: { id: invoiceId },
    data: { ...state, status: state.status as InvoiceStatus },
  });
}

export const paymentsRouter = router({
  list: protectedProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.prisma.payment.findMany({
        where: {
          ...(input?.jobId ? { jobId: input.jobId } : {}),
          ...(ctx.session?.role === "employee" ? { job: { assignments: { some: { userId: ctx.session.userId } } } } : {}),
        },
        include: { invoice: true, job: true, recordedBy: true },
        orderBy: { dateReceived: "desc" },
        take: 300,
      })
    ),

  create: adminProcedure
    .input(z.object({
      jobId: z.number(),
      invoiceId: z.number().optional(),
      amount: z.number().positive(),
      dateReceived: z.coerce.date(),
      method: MethodZ.default("check"),
      checkNumber: z.string().optional(),
      bank: z.string().optional(),
      memo: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.$transaction(async (tx) => {
          const [job, invoice] = await Promise.all([
            tx.job.findUnique({ where: { id: input.jobId }, select: { id: true, contractAmount: true, totalEstimate: true } }),
            input.invoiceId
              ? tx.invoice.findUnique({ where: { id: input.invoiceId }, select: { id: true, jobId: true, total: true, status: true } })
              : Promise.resolve(null),
          ]);
          validatePaymentTarget(Boolean(job), invoice, input.jobId, input.invoiceId != null);
          if (invoice?.status === "cancelled") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot record a payment against a cancelled invoice." });
          }

          if (invoice) {
            const existing = await tx.payment.aggregate({ where: { invoiceId: invoice.id, status: { not: "bounced" } }, _sum: { amount: true } });
            calculateInvoicePaymentState(Number(invoice.total), Number(existing._sum.amount ?? 0) + input.amount, "sent");
          }

          if (job) {
            const [existing, invoiced] = await Promise.all([
              tx.payment.aggregate({ where: { jobId: input.jobId, status: { not: "bounced" } }, _sum: { amount: true } }),
              tx.invoice.aggregate({ where: { jobId: input.jobId, status: { not: "cancelled" } }, _sum: { total: true } }),
            ]);
            const projectTotal = Number(job.contractAmount) > 0 ? Number(job.contractAmount) : Number(job.totalEstimate);
            const collectibleTotal = Math.max(projectTotal, Number(invoiced._sum.total ?? 0));
            calculateInvoicePaymentState(collectibleTotal, Number(existing._sum.amount ?? 0) + input.amount, "sent");
          }

          const payment = await tx.payment.create({
            data: { ...input, recordedById: ctx.session!.userId },
          });
          if (input.invoiceId) await recomputeInvoice(tx, input.invoiceId);
          return payment;
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to record payment." });
      }
    }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    return ctx.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: input.id }, select: { id: true, invoiceId: true } });
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found." });
      const removed = await tx.payment.delete({ where: { id: input.id } });
      if (payment.invoiceId) await recomputeInvoice(tx, payment.invoiceId);
      return removed;
    }, { isolationLevel: "Serializable" });
  }),
});
