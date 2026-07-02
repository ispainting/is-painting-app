import { z } from "zod";
import { router, adminProcedure } from "../trpc";

const SURVIVAL_TARGET = 40_000;
const PRODUCTION_GOAL = 65_000;
const PROPOSAL_CLOSE_RATE_LOW = 0.35;
const PROPOSAL_CLOSE_RATE_HIGH = 0.5;
const PAY_PERIOD_ANCHOR = new Date("2026-01-05T00:00:00");

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthRange(date: Date) {
  const start = startOfMonth(date);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function getBiweeklyPeriod(date: Date) {
  const daysFromAnchor = Math.floor((date.getTime() - PAY_PERIOD_ANCHOR.getTime()) / 86_400_000);
  const periodIndex = Math.floor(daysFromAnchor / 14);
  const start = new Date(PAY_PERIOD_ANCHOR);
  start.setDate(start.getDate() + periodIndex * 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  return { start, end };
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function inRange(date: Date | null | undefined, start: Date, end: Date) {
  if (!date) return false;
  const time = date.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function jobValue(job: { contractAmount: unknown; totalEstimate: unknown }) {
  const contract = money(job.contractAmount);
  return contract > 0 ? contract : money(job.totalEstimate);
}

function estimatePayrollForPayPeriod(entries: Array<{
  userId: number;
  jobId: number | null;
  clockIn: Date;
  paidHours: unknown;
  grossHours: unknown;
  hoursWorked: unknown;
  travelHours: unknown;
  rateType: string | null;
  isIslandJob: boolean;
  specialPayEnabled: boolean;
  hourlyRateAdjustment: unknown;
  user: { hourlyRate: unknown };
  job: {
    isIslandJob: boolean;
    specialPayEnabled: boolean;
    hourlyRateAdjustment: unknown;
    travelPayEnabled: boolean;
    defaultTravelHours: unknown;
    travelRateType: string | null;
    customTravelRate: unknown;
  } | null;
}>) {
  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    const groupKey = `${entry.userId}:${entry.jobId ?? 0}:${entry.clockIn.toISOString().slice(0, 10)}`;
    const group = grouped.get(groupKey) || [];
    group.push(entry);
    grouped.set(groupKey, group);
  }

  let total = 0;
  for (const groupEntries of grouped.values()) {
    const anchor = groupEntries[0];
    const baseRate = money(anchor.user.hourlyRate);
    const specialPayEnabled = anchor.specialPayEnabled || anchor.isIslandJob || anchor.job?.specialPayEnabled || anchor.job?.isIslandJob;
    const rawAdjustment = specialPayEnabled
      ? money(anchor.hourlyRateAdjustment ?? anchor.job?.hourlyRateAdjustment ?? 0)
      : 0;
    const adjustment = rawAdjustment > 0 ? rawAdjustment : (anchor.isIslandJob || anchor.job?.isIslandJob ? 2 : 0);
    const effectiveRate = baseRate + adjustment;

    const workHours = groupEntries.reduce(
      (sum, entry) => sum + money(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked ?? 0),
      0
    );

    const travelEntry = groupEntries.find((entry) => entry.travelHours !== null && entry.travelHours !== undefined);
    const travelHours = travelEntry
      ? money(travelEntry.travelHours)
      : anchor.job?.travelPayEnabled
        ? money(anchor.job.defaultTravelHours)
        : 0;

    const travelRateType = anchor.job?.travelRateType || "regular";
    const travelRate = travelRateType === "special"
      ? effectiveRate
      : travelRateType === "custom"
        ? money(anchor.job?.customTravelRate ?? baseRate)
        : baseRate;

    total += workHours * effectiveRate + travelHours * travelRate;
  }

  return total;
}

function calculateStatus(completedRevenue: number) {
  if (completedRevenue >= SURVIVAL_TARGET) return "Safe";
  if (completedRevenue >= SURVIVAL_TARGET * 0.75) return "At Risk";
  return "Behind";
}

export const reportsRouter = router({
  dashboard: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const month = monthRange(now);
    const payPeriod = getBiweeklyPeriod(now);

    const [activeJobs, openOpps, employees, completedAndScheduledJobs, proposalsSent, invoices, expensesThisMonth, paymentsThisMonth, timeEntries] =
      await Promise.all([
        ctx.prisma.job.count({ where: { status: { in: ["approved", "active"] }, deletedAt: null } }),
        ctx.prisma.opportunity.count({ where: { status: "open" } }),
        ctx.prisma.user.count({ where: { isActive: true } }),
        ctx.prisma.job.findMany({
          where: {
            deletedAt: null,
            status: { in: ["approved", "active", "completed"] },
            OR: [
              { updatedAt: { gte: month.start, lt: month.end } },
              { startDate: { gte: month.start, lt: month.end } },
              { endDate: { gte: month.start, lt: month.end } },
            ],
          },
          select: {
            status: true,
            totalEstimate: true,
            contractAmount: true,
            startDate: true,
            endDate: true,
            updatedAt: true,
          },
        }),
        ctx.prisma.proposal.findMany({
          where: { sentAt: { gte: month.start, lt: month.end } },
          select: { totalAmount: true, status: true, sentAt: true },
        }),
        ctx.prisma.invoice.findMany({
          select: { status: true, amountPaid: true, amountRemaining: true, dueDate: true, updatedAt: true },
        }),
        ctx.prisma.expense.aggregate({ where: { expenseDate: { gte: month.start, lt: month.end } }, _sum: { amount: true } }),
        ctx.prisma.payment.aggregate({ where: { dateReceived: { gte: month.start, lt: month.end } }, _sum: { amount: true } }),
        ctx.prisma.timeEntry.findMany({
          where: { clockIn: { gte: payPeriod.start, lt: payPeriod.end } },
          select: {
            userId: true,
            jobId: true,
            clockIn: true,
            paidHours: true,
            grossHours: true,
            hoursWorked: true,
            travelHours: true,
            rateType: true,
            isIslandJob: true,
            specialPayEnabled: true,
            hourlyRateAdjustment: true,
            user: { select: { hourlyRate: true } },
            job: {
              select: {
                isIslandJob: true,
                specialPayEnabled: true,
                hourlyRateAdjustment: true,
                travelPayEnabled: true,
                defaultTravelHours: true,
                travelRateType: true,
                customTravelRate: true,
              },
            },
          },
        }),
      ]);

    const completedRevenueThisMonth = completedAndScheduledJobs
      .filter((job) => job.status === "completed")
      .reduce((sum, job) => sum + jobValue(job), 0);

    const scheduledRevenueThisMonth = completedAndScheduledJobs
      .filter((job) => job.status === "approved" || job.status === "active")
      .reduce((sum, job) => sum + jobValue(job), 0);

    const totalProjectedProduction = completedRevenueThisMonth + scheduledRevenueThisMonth;

    const proposalsSentThisMonth = proposalsSent.length;
    const totalProposalValue = proposalsSent.reduce((sum, proposal) => sum + money(proposal.totalAmount), 0);
    const expectedSoldAt35 = totalProposalValue * PROPOSAL_CLOSE_RATE_LOW;
    const expectedSoldAt50 = totalProposalValue * PROPOSAL_CLOSE_RATE_HIGH;

    const requiredProposalValueAt35 = PRODUCTION_GOAL / PROPOSAL_CLOSE_RATE_LOW;
    const requiredProposalValueAt50 = PRODUCTION_GOAL / PROPOSAL_CLOSE_RATE_HIGH;

    const paidInvoicesThisMonth = invoices.filter((invoice) => invoice.status === "paid" && inRange(invoice.updatedAt, month.start, month.end)).length;
    const openInvoicesList = invoices.filter((invoice) => ["sent", "partial"].includes(invoice.status) && money(invoice.amountRemaining) > 0);
    const overdueInvoicesList = invoices.filter((invoice) => {
      if (money(invoice.amountRemaining) <= 0) return false;
      if (invoice.status === "overdue") return true;
      return invoice.dueDate ? invoice.dueDate.getTime() < now.getTime() : false;
    });

    const openInvoiceAmount = openInvoicesList.reduce((sum, invoice) => sum + money(invoice.amountRemaining), 0);
    const overdueInvoiceAmount = overdueInvoicesList.reduce((sum, invoice) => sum + money(invoice.amountRemaining), 0);
    const amountCollectedThisMonth = money(paymentsThisMonth._sum.amount);
    const expensesAmountThisMonth = money(expensesThisMonth._sum.amount);

    const payrollEstimateCurrentPayPeriod = estimatePayrollForPayPeriod(timeEntries);
    const projectedNetAfterExpensesPayroll = totalProjectedProduction - expensesAmountThisMonth - payrollEstimateCurrentPayPeriod;

    const survivalRemaining = Math.max(0, SURVIVAL_TARGET - completedRevenueThisMonth);
    const survivalProgressPercent = Math.min(100, (completedRevenueThisMonth / SURVIVAL_TARGET) * 100);
    const productionProgressPercent = Math.min(100, (totalProjectedProduction / PRODUCTION_GOAL) * 100);

    const daysUntilPayPeriodEnd = Math.ceil((payPeriod.end.getTime() - now.getTime()) / 86_400_000);

    const alerts: Array<{ level: "info" | "warning" | "danger"; title: string; detail: string }> = [];

    if (totalProposalValue < requiredProposalValueAt35) {
      alerts.push({
        level: "warning",
        title: "Need more proposals",
        detail: `Sent proposals total ${formatMoney(totalProposalValue)}, which is below the ${Math.round(PROPOSAL_CLOSE_RATE_LOW * 100)}% target needed to support a $65,000 production month.`,
      });
    }

    if (completedRevenueThisMonth < SURVIVAL_TARGET) {
      alerts.push({
        level: "danger",
        title: "Below survival target",
        detail: `${formatMoney(survivalRemaining)} more completed revenue is needed to reach the $40,000 monthly survival target.`,
      });
    }

    if (expensesAmountThisMonth > Math.max(15_000, totalProjectedProduction * 0.4)) {
      alerts.push({
        level: "warning",
        title: "High expenses",
        detail: `Expenses this month are ${formatMoney(expensesAmountThisMonth)}, which is running hot against projected production.`,
      });
    }

    if (openInvoiceAmount > 0 || overdueInvoiceAmount > 0) {
      alerts.push({
        level: overdueInvoiceAmount > 0 ? "danger" : "warning",
        title: "Open invoices need collection",
        detail: overdueInvoiceAmount > 0
          ? `${overdueInvoicesList.length} overdue invoices total ${formatMoney(overdueInvoiceAmount)}.`
          : `${openInvoicesList.length} open invoices total ${formatMoney(openInvoiceAmount)}.`,
      });
    }

    if (daysUntilPayPeriodEnd <= 3) {
      alerts.push({
        level: "info",
        title: "Payroll coming due",
        detail: `Current pay period closes in ${Math.max(0, daysUntilPayPeriodEnd)} day${daysUntilPayPeriodEnd === 1 ? "" : "s"}. Estimated payroll is ${formatMoney(payrollEstimateCurrentPayPeriod)}.`,
      });
    }

    return {
      activeJobs,
      openOpps,
      employees,
      survival: {
        completedRevenueThisMonth,
        target: SURVIVAL_TARGET,
        remaining: survivalRemaining,
        progressPercent: survivalProgressPercent,
        status: calculateStatus(completedRevenueThisMonth),
      },
      production: {
        completedRevenueThisMonth,
        scheduledRevenueThisMonth,
        totalProjectedProduction,
        target: PRODUCTION_GOAL,
        progressPercent: productionProgressPercent,
      },
      pipeline: {
        proposalsSentThisMonth,
        totalProposalValue,
        expectedSoldAt35,
        expectedSoldAt50,
        requiredProposalValueAt35,
        requiredProposalValueAt50,
      },
      cash: {
        paidInvoicesThisMonth,
        openInvoices: openInvoicesList.length,
        overdueInvoices: overdueInvoicesList.length,
        amountCollectedThisMonth,
      },
      expenses: {
        expensesThisMonth: expensesAmountThisMonth,
        payrollEstimateCurrentPayPeriod,
        projectedNetAfterExpensesPayroll,
      },
      alerts,
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
