import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";

const MethodZ = z.enum(["check", "cash", "credit_card", "bank_transfer", "other"]);

export const paymentsRouter = router({
  list: protectedProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.prisma.payment.findMany({
        where: input?.jobId ? { jobId: input.jobId } : {},
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
      const payment = await ctx.prisma.payment.create({
        data: { ...input, recordedById: ctx.session!.userId },
      });

      // If linked to invoice, recompute amounts and status
      if (input.invoiceId) {
        const inv = await ctx.prisma.invoice.findUnique({
          where: { id: input.invoiceId },
          include: { payments: true },
        });
        if (inv) {
          const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
          const remaining = Number(inv.total) - paid;
          await ctx.prisma.invoice.update({
            where: { id: inv.id },
            data: {
              amountPaid: paid,
              amountRemaining: remaining,
              status: remaining <= 0 ? "paid" : paid > 0 ? "partial" : inv.status,
            },
          });
        }
      }
      return payment;
    }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.payment.delete({ where: { id: input.id } })
  ),
});
