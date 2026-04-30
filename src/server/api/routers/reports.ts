import { z } from "zod";
import { router, adminProcedure } from "../trpc";

export const reportsRouter = router({
  dashboard: adminProcedure.query(async ({ ctx }) => {
    const [activeJobs, openInvoices, pendingExpenses, employees, revenueAgg, openOpps] =
      await Promise.all([
        ctx.prisma.job.count({ where: { status: { in: ["approved", "active"] }, deletedAt: null } }),
        ctx.prisma.invoice.count({ where: { status: { in: ["sent", "partial", "overdue"] } } }),
        ctx.prisma.expense.count({ where: { status: "pending" } }),
        ctx.prisma.user.count({ where: { isActive: true } }),
        ctx.prisma.payment.aggregate({ _sum: { amount: true } }),
        ctx.prisma.opportunity.count({ where: { status: "open" } }),
      ]);
    return {
      activeJobs,
      openInvoices,
      pendingExpenses,
      employees,
      totalRevenue: Number(revenueAgg._sum.amount ?? 0),
      openOpps,
    };
  }),

  jobProfitability: adminProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [job, expenses, payments, time] = await Promise.all([
        ctx.prisma.job.findUnique({ where: { id: input.jobId } }),
        ctx.prisma.expense.aggregate({
          where: { jobId: input.jobId, status: "approved" },
          _sum: { amount: true },
        }),
        ctx.prisma.payment.aggregate({
          where: { jobId: input.jobId },
          _sum: { amount: true },
        }),
        ctx.prisma.timeEntry.findMany({
          where: { jobId: input.jobId, hoursWorked: { not: null } },
          include: { user: true },
        }),
      ]);
      const laborCost = time.reduce(
        (s, t) => s + Number(t.hoursWorked ?? 0) * Number(t.user.hourlyRate ?? 0),
        0
      );
      const expenseCost = Number(expenses._sum.amount ?? 0);
      const revenue = Number(payments._sum.amount ?? 0);
      return {
        job,
        revenue,
        laborCost,
        expenseCost,
        totalCost: laborCost + expenseCost,
        profit: revenue - (laborCost + expenseCost),
      };
    }),
});
