import { z } from "zod";
import { router, adminProcedure } from "../trpc";

const SURVIVAL_TARGET = 40_000;
const PRODUCTION_GOAL = 65_000;
const PROPOSAL_CLOSE_RATE_LOW = 0.35;
const PROPOSAL_CLOSE_RATE_HIGH = 0.5;
const PAY_PERIOD_ANCHOR = new Date("2026-01-05T00:00:00");
const TRACKED_SOURCES = ["Google", "Meta", "Website", "Referral", "Property Manager", "Unknown"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthRange(date: Date) {
  const start = startOfMonth(date);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function monthRangeFromParts(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
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

function normalizeSource(source: string | null | undefined) {
  const value = source?.trim();
  if (!value) return "Unknown";
  const lower = value.toLowerCase();
  if (lower === "google") return "Google";
  if (lower === "meta") return "Meta";
  if (lower === "website") return "Website";
  if (lower === "referral") return "Referral";
  if (lower === "property manager" || lower === "property_manager") return "Property Manager";
  return value;
}

type TrendSourceRow = {
  source: string;
  leads: number;
  proposals: number;
  won: number;
  closeRate: number | null;
  averageJobValue: number | null;
};

type TrendSnapshot = {
  month: number;
  year: number;
  label: string;
  hasData: boolean;
  newLeads: number;
  estimatesCreated: number;
  proposalsSent: number;
  proposalsWon: number;
  proposalsLost: number;
  totalProposalValue: number;
  averageProposalValue: number | null;
  closeRate: number | null;
  leadQualityBySource: TrendSourceRow[];
};

async function buildTrendSnapshot(prisma: any, year: number, month: number): Promise<TrendSnapshot> {
  const range = monthRangeFromParts(year, month);
  const [opportunities, proposals]: [
    Array<{ source: string | null; createdAt: Date }>,
    Array<{
      totalAmount: unknown;
      status: string;
      createdAt: Date;
      sentAt: Date | null;
      approvedAt: Date | null;
      updatedAt: Date;
      customer: { source: string | null } | null;
    }>,
  ] = await Promise.all([
    prisma.opportunity.findMany({
      where: { createdAt: { gte: range.start, lt: range.end } },
      select: { source: true, createdAt: true },
    }),
    prisma.proposal.findMany({
      where: {
        OR: [
          { createdAt: { gte: range.start, lt: range.end } },
          { sentAt: { gte: range.start, lt: range.end } },
          { approvedAt: { gte: range.start, lt: range.end } },
          { updatedAt: { gte: range.start, lt: range.end } },
        ],
      },
      select: {
        totalAmount: true,
        status: true,
        createdAt: true,
        sentAt: true,
        approvedAt: true,
        updatedAt: true,
        customer: { select: { source: true } },
      },
    }),
  ]);

  const newLeads = opportunities.length;
  const estimatesCreated = proposals.filter((proposal) => inRange(proposal.createdAt, range.start, range.end)).length;
  const sentProposals = proposals.filter((proposal) => inRange(proposal.sentAt, range.start, range.end));
  const proposalsSent = sentProposals.length;
  const proposalsWonItems = proposals.filter(
    (proposal) => (proposal.status === "approved" || proposal.status === "converted") && inRange(proposal.approvedAt ?? proposal.updatedAt, range.start, range.end)
  );
  const proposalsLost = proposals.filter(
    (proposal) => proposal.status === "declined" && inRange(proposal.updatedAt, range.start, range.end)
  ).length;
  const proposalsWon = proposalsWonItems.length;
  const totalProposalValue = sentProposals.reduce((sum, proposal) => sum + money(proposal.totalAmount), 0);
  const averageProposalValue = proposalsSent > 0 ? totalProposalValue / proposalsSent : null;
  const closeRate = proposalsSent > 0 ? proposalsWon / proposalsSent : null;

  const sourceBuckets = new Map<string, { leads: number; proposals: number; won: number; wonValue: number }>();
  for (const source of TRACKED_SOURCES) {
    sourceBuckets.set(source, { leads: 0, proposals: 0, won: 0, wonValue: 0 });
  }

  const ensureBucket = (source: string) => {
    if (!sourceBuckets.has(source)) {
      sourceBuckets.set(source, { leads: 0, proposals: 0, won: 0, wonValue: 0 });
    }
    return sourceBuckets.get(source)!;
  };

  for (const opportunity of opportunities) {
    const bucket = ensureBucket(normalizeSource(opportunity.source));
    bucket.leads += 1;
  }

  for (const proposal of sentProposals) {
    const bucket = ensureBucket(normalizeSource(proposal.customer?.source));
    bucket.proposals += 1;
  }

  for (const proposal of proposalsWonItems) {
    const bucket = ensureBucket(normalizeSource(proposal.customer?.source));
    bucket.won += 1;
    bucket.wonValue += money(proposal.totalAmount);
  }

  const sourceOrder = [
    ...TRACKED_SOURCES,
    ...Array.from(sourceBuckets.keys()).filter((source) => !TRACKED_SOURCES.includes(source)).sort(),
  ];

  const leadQualityBySource = sourceOrder.map((source) => {
    const bucket = sourceBuckets.get(source) ?? { leads: 0, proposals: 0, won: 0, wonValue: 0 };
    return {
      source,
      leads: bucket.leads,
      proposals: bucket.proposals,
      won: bucket.won,
      closeRate: bucket.proposals > 0 ? bucket.won / bucket.proposals : null,
      averageJobValue: bucket.won > 0 ? bucket.wonValue / bucket.won : null,
    };
  });

  return {
    month,
    year,
    label: formatMonthLabel(year, month),
    hasData: newLeads + estimatesCreated + proposalsSent + proposalsWon + proposalsLost > 0,
    newLeads,
    estimatesCreated,
    proposalsSent,
    proposalsWon,
    proposalsLost,
    totalProposalValue,
    averageProposalValue,
    closeRate,
    leadQualityBySource,
  };
}

export const reportsRouter = router({
  dashboard: adminProcedure
    .input(
      z
        .object({
          month: z.number().int().min(1).max(12).optional(),
          year: z.number().int().min(2000).max(3000).optional(),
          comparePreviousMonth: z.boolean().optional(),
          compareSameMonthLastYear: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const month = monthRange(now);
      const payPeriod = getBiweeklyPeriod(now);
      const trendMonth = input?.month ?? now.getMonth() + 1;
      const trendYear = input?.year ?? now.getFullYear();
      const comparePreviousMonth = input?.comparePreviousMonth ?? true;
      const compareSameMonthLastYear = input?.compareSameMonthLastYear ?? true;

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
          detail: `Current pay period closes in ${Math.max(0, daysUntilPayPeriodEnd)} day${daysUntilPayPeriodEnd === 1 ? "s" : ""}. Estimated payroll is ${formatMoney(payrollEstimateCurrentPayPeriod)}.`,
        });
      }

      const selectedTrend = await buildTrendSnapshot(ctx.prisma, trendYear, trendMonth);
      const previousMonth = comparePreviousMonth
        ? shiftMonth(trendYear, trendMonth, -1)
        : null;
      const sameMonthLastYear = compareSameMonthLastYear
        ? { year: trendYear - 1, month: trendMonth }
        : null;

      const [previousTrend, lastYearTrend] = await Promise.all([
        previousMonth ? buildTrendSnapshot(ctx.prisma, previousMonth.year, previousMonth.month) : Promise.resolve(null),
        sameMonthLastYear ? buildTrendSnapshot(ctx.prisma, sameMonthLastYear.year, sameMonthLastYear.month) : Promise.resolve(null),
      ]);

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
        trends: {
          selected: selectedTrend,
          previousMonth: previousTrend,
          sameMonthLastYear: lastYearTrend,
          comparePreviousMonth,
          compareSameMonthLastYear,
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
