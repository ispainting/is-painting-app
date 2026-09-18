import { z } from "zod";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import type { InvoiceStatus } from "@prisma/client";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import {
  calculateInvoicePaymentState,
  calculateInvoiceTotals,
  unpaidInvoiceStatus,
  type InvoiceStatusValue,
} from "@/lib/invoice-calculations";

const StatusZ = z.enum(["draft", "sent", "partial", "paid", "overdue", "cancelled"]);

const lineItemInput = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

const invoiceFields = z.object({
  title: z.string().trim().min(1),
  taxPercent: z.number().min(0).default(0),
  dueDate: z.coerce.date().nullable().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemInput).min(1),
});

function createInvoiceNumber() {
  return `INV-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

export const invoicesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.invoice.findMany({
      where: ctx.session?.role === "employee" ? { job: { assignments: { some: { userId: ctx.session.userId } } } } : {},
      include: { customer: true, job: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  ),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const invoice = await ctx.prisma.invoice.findUnique({
      where: { id: input.id },
      include: { customer: true, job: { include: { assignments: { select: { userId: true } } } }, lineItems: true, payments: true },
    });
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
    if (ctx.session?.role === "employee" && !invoice.job.assignments.some((assignment) => assignment.userId === ctx.session!.userId)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return invoice;
  }),

  byJob: protectedProcedure.input(z.object({ jobId: z.number() })).query(async ({ ctx, input }) => {
    if (ctx.session?.role === "employee") {
      const assignment = await ctx.prisma.employeeJobAssignment.findFirst({ where: { jobId: input.jobId, userId: ctx.session.userId }, select: { id: true } });
      if (!assignment) throw new TRPCError({ code: "FORBIDDEN" });
    }
    return ctx.prisma.invoice.findMany({
      where: { jobId: input.jobId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { dateReceived: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: adminProcedure
    .input(invoiceFields.extend({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const totals = calculateInvoiceTotals(input.lineItems, input.taxPercent);
        return await ctx.prisma.$transaction(async (tx) => {
          const job = await tx.job.findUnique({ where: { id: input.jobId }, include: { customer: { select: { id: true } } } });
          if (!job?.customer) throw new TRPCError({ code: "NOT_FOUND", message: "Job or customer not found." });
          return tx.invoice.create({
            data: {
              customerId: job.customerId,
              jobId: input.jobId,
              invoiceNumber: createInvoiceNumber(),
              title: input.title,
              subtotal: totals.subtotal,
              tax: totals.tax,
              total: totals.total,
              amountRemaining: totals.total,
              dueDate: input.dueDate,
              notes: input.notes,
              createdById: ctx.session!.userId,
              lineItems: { create: totals.lineItems.map((lineItem, sortOrder) => ({ ...lineItem, sortOrder })) },
            },
            include: { lineItems: true, payments: true },
          });
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to create invoice." });
      }
    }),

  update: adminProcedure
    .input(invoiceFields.extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const totals = calculateInvoiceTotals(input.lineItems, input.taxPercent);
        return await ctx.prisma.$transaction(async (tx) => {
          const invoice = await tx.invoice.findUnique({
            where: { id: input.id },
            include: { payments: { select: { amount: true } } },
          });
          if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
          const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
          const paymentState = calculateInvoicePaymentState(
            totals.total,
            paid,
            unpaidInvoiceStatus({ ...invoice, status: invoice.status as InvoiceStatusValue }),
          );

          await tx.invoiceLineItem.deleteMany({ where: { invoiceId: input.id } });
          return tx.invoice.update({
            where: { id: input.id },
            data: {
              title: input.title,
              dueDate: input.dueDate,
              notes: input.notes,
              subtotal: totals.subtotal,
              tax: totals.tax,
              total: totals.total,
              ...paymentState,
              status: paymentState.status as InvoiceStatus,
              lineItems: { create: totals.lineItems.map((lineItem, sortOrder) => ({ ...lineItem, sortOrder })) },
            },
            include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: true },
          });
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to update invoice." });
      }
    }),

  setStatus: adminProcedure
    .input(z.object({ id: z.number(), status: StatusZ }))
    .mutation(async ({ ctx, input }) => {
      if (input.status === "paid" || input.status === "partial") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment status is calculated from recorded payments." });
      }
      const invoice = await ctx.prisma.invoice.findUnique({ where: { id: input.id }, select: { amountPaid: true } });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      if (Number(invoice.amountPaid) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoices with payments keep their calculated payment status." });
      }
      const data: any = { status: input.status };
      if (input.status === "sent") data.sentAt = new Date();
      if (input.status === "draft") data.sentAt = null;
      return ctx.prisma.invoice.update({ where: { id: input.id }, data });
    }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.invoice.delete({ where: { id: input.id } })
  ),
});
