import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { nextNumber } from "@/lib/utils";

const StatusZ = z.enum(["draft", "sent", "partial", "paid", "overdue", "cancelled"]);

const lineItemInput = z.object({
  description: z.string().min(1),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
});

export const invoicesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.invoice.findMany({
      include: { customer: true, job: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  ),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.invoice.findUnique({
      where: { id: input.id },
      include: { customer: true, job: true, lineItems: true, payments: true },
    })
  ),

  create: adminProcedure
    .input(z.object({
      jobId: z.number(),
      title: z.string().min(1),
      taxPercent: z.number().min(0).default(0),
      dueDate: z.coerce.date().optional(),
      notes: z.string().optional(),
      lineItems: z.array(lineItemInput).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.job.findUnique({ where: { id: input.jobId } });
      if (!job) throw new Error("Job not found");
      const last = await ctx.prisma.invoice.findFirst({
        orderBy: { id: "desc" },
        select: { invoiceNumber: true },
      });
      const invoiceNumber = nextNumber("INV", last?.invoiceNumber);

      const subtotal = input.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
      const tax = (subtotal * input.taxPercent) / 100;
      const total = subtotal + tax;

      return ctx.prisma.invoice.create({
        data: {
          customerId: job.customerId,
          jobId: input.jobId,
          invoiceNumber,
          title: input.title,
          subtotal,
          tax,
          total,
          amountRemaining: total,
          dueDate: input.dueDate,
          notes: input.notes,
          createdById: ctx.session!.userId,
          lineItems: {
            create: input.lineItems.map((li, i) => ({
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              totalPrice: li.quantity * li.unitPrice,
              sortOrder: i,
            })),
          },
        },
        include: { lineItems: true },
      });
    }),

  setStatus: adminProcedure
    .input(z.object({ id: z.number(), status: StatusZ }))
    .mutation(({ ctx, input }) => {
      const data: any = { status: input.status };
      if (input.status === "sent") data.sentAt = new Date();
      return ctx.prisma.invoice.update({ where: { id: input.id }, data });
    }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.invoice.delete({ where: { id: input.id } })
  ),
});
