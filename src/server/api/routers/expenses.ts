import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";

const CategoryZ = z.enum([
  "materials", "labor", "equipment", "subcontractor", "travel", "office", "other",
]);

export const expensesRouter = router({
  list: protectedProcedure
    .input(z.object({ jobId: z.number().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.prisma.expense.findMany({
        where: {
          ...(input?.jobId && { jobId: input.jobId }),
          ...(ctx.session?.role === "employee" && { submittedById: ctx.session.userId }),
        },
        include: { job: true, submittedBy: true, approvedBy: true },
        orderBy: { expenseDate: "desc" },
        take: 500,
      })
    ),

  create: protectedProcedure
    .input(z.object({
      jobId: z.number().optional(),
      vendor: z.string().optional(),
      category: CategoryZ,
      amount: z.number().min(0),
      expenseDate: z.coerce.date(),
      description: z.string().optional(),
      receiptUrl: z.string().url().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.expense.create({
        data: { ...input, submittedById: ctx.session!.userId },
      })
    ),

  approve: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.expense.update({
      where: { id: input.id },
      data: { status: "approved", approvedById: ctx.session!.userId },
    })
  ),

  reject: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.expense.update({
      where: { id: input.id },
      data: { status: "rejected", approvedById: ctx.session!.userId },
    })
  ),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.expense.delete({ where: { id: input.id } })
  ),
});
