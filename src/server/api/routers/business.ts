import { endOfMonth, endOfQuarter, endOfYear, format, startOfMonth, startOfQuarter, startOfYear, subMonths, subYears } from "date-fns";
import { z } from "zod";
import { router, adminProcedure } from "../trpc";

const SURVIVAL_TARGET = 40_000;
const MONTHLY_GOAL = 65_000;
const CLOSE_RATE_BASELINE = 0.4;
const DIRECT_EXPENSE_CATEGORIES = new Set(["materials", "labor", "subcontractor", "travel", "equipment"]);
const SOURCE_BUCKETS = ["Google", "Google Business", "Facebook", "Instagram", "Website", "Referral", "Builder", "Repeat Customer", "Other", "Unknown"];

const analyticsInput = z.object({
  periodType: z.enum(["month", "quarter", "year", "custom"]).default("month"),
  month: z.number().int().min(1).max(12).optional(),
  quarter: z.number().int().min(1).max(4).optional(),
  year: z.number().int().min(2000).max(3000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  comparePreviousMonth: z.boolean().optional(),
  compareSameMonthLastYear: z.boolean().optional(),
  comparePreviousYear: z.boolean().optional(),
  compareCustomPeriods: z.boolean().optional(),
});

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function monthLabel(date: Date) {
  return format(date, "MMM yyyy");
}

function quarterLabel(date: Date) {
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
}

function startOfQuarterFromMonth(year: number, quarter: number) {
  return startOfQuarter(new Date(year, (quarter - 1) * 3, 1));
}

function endOfQuarterFromMonth(year: number, quarter: number) {
  return endOfQuarter(new Date(year, (quarter - 1) * 3, 1));
}

function normalizeSource(source: string | null | undefined) {
  const value = (source ?? "").trim();
  if (!value) return "Unknown";
  const lower = value.toLowerCase();
  if (lower === "google") return "Google";
  if (lower === "google business") return "Google Business";
  if (lower === "facebook" || lower === "meta") return "Facebook";
  if (lower === "instagram") return "Instagram";
  if (lower === "website") return "Website";
  if (lower === "referral") return "Referral";
  if (lower === "builder") return "Builder";
  if (lower === "repeat customer" || lower === "repeat_customer") return "Repeat Customer";
  return SOURCE_BUCKETS.includes(value) ? value : "Other";
}

function isInRange(date: Date | null | undefined, start: Date, end: Date) {
  if (!date) return false;
  const time = date.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function rangeMonths(start: Date, end: Date) {
  const months: Date[] = [];
  let cursor = startOfMonth(start);
  while (cursor <= end) {
    months.push(cursor);
    cursor = subMonths(cursor, -1);
  }
  return months;
}

function rangeYears(start: Date, end: Date) {
  const years: number[] = [];
  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) years.push(year);
  return years;
}

function totalHours(entry: { paidHours: unknown; grossHours: unknown; hoursWorked: unknown }) {
  return money(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked ?? 0);
}

function payrollForEntries(entries: Array<{ user: { hourlyRate: unknown }; specialPayEnabled: boolean; isIslandJob: boolean; hourlyRateAdjustment: unknown; job: { specialPayEnabled: boolean; isIslandJob: boolean; hourlyRateAdjustment: unknown; travelPayEnabled: boolean; defaultTravelHours: unknown; travelRateType: string | null; customTravelRate: unknown } | null; paidHours: unknown; grossHours: unknown; hoursWorked: unknown; travelHours: unknown; userId: number; jobId: number | null; clockIn: Date }>) {
  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = `${entry.userId}:${entry.jobId ?? 0}:${entry.clockIn.toISOString().slice(0, 10)}`;
    const group = grouped.get(key) ?? [];
    group.push(entry);
    grouped.set(key, group);
  }

  let total = 0;
  for (const group of grouped.values()) {
    const anchor = group[0];
    const baseRate = money(anchor.user.hourlyRate);
    const specialPayEnabled = anchor.specialPayEnabled || anchor.isIslandJob || anchor.job?.specialPayEnabled || anchor.job?.isIslandJob;
    const adjustment = specialPayEnabled ? money(anchor.hourlyRateAdjustment ?? anchor.job?.hourlyRateAdjustment ?? 0) || ((anchor.isIslandJob || anchor.job?.isIslandJob) ? 2 : 0) : 0;
    const effectiveRate = baseRate + adjustment;
    const workHours = group.reduce((sum: number, entry: any) => sum + totalHours(entry), 0);
    const travelEntry = group.find((entry) => entry.travelHours !== null && entry.travelHours !== undefined);
    const travelHours = travelEntry ? money(travelEntry.travelHours) : anchor.job?.travelPayEnabled ? money(anchor.job.defaultTravelHours) : 0;
    const travelRateType = anchor.job?.travelRateType || "regular";
    const travelRate = travelRateType === "special" ? effectiveRate : travelRateType === "custom" ? money(anchor.job?.customTravelRate ?? baseRate) : baseRate;
    total += workHours * effectiveRate + travelHours * travelRate;
  }
  return total;
}

function jobValue(job: { contractAmount: unknown; totalEstimate: unknown }) {
  const contract = money(job.contractAmount);
  return contract > 0 ? contract : money(job.totalEstimate);
}

function calcRange(periodType: "month" | "quarter" | "year" | "custom", input: z.infer<typeof analyticsInput>, now: Date) {
  if (periodType === "month") {
    const year = input.year ?? now.getFullYear();
    const month = input.month ?? now.getMonth() + 1;
    const start = startOfMonth(new Date(year, month - 1, 1));
    const end = endOfMonth(start);
    return { start, end, label: monthLabel(start), year, month, periodType };
  }
  if (periodType === "quarter") {
    const year = input.year ?? now.getFullYear();
    const quarter = input.quarter ?? Math.floor(now.getMonth() / 3) + 1;
    const start = startOfQuarterFromMonth(year, quarter);
    const end = endOfQuarterFromMonth(year, quarter);
    return { start, end, label: `Q${quarter} ${year}`, year, quarter, periodType };
  }
  if (periodType === "year") {
    const year = input.year ?? now.getFullYear();
    const start = startOfYear(new Date(year, 0, 1));
    const end = endOfYear(start);
    return { start, end, label: `${year}`, year, periodType };
  }
  const start = input.startDate ? startOfDay(input.startDate) : startOfMonth(now);
  const end = input.endDate ? endOfDay(input.endDate) : endOfMonth(now);
  return { start, end, label: `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`, periodType };
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function shiftRange(start: Date, end: Date, months: number) {
  return { start: subMonths(start, months), end: subMonths(end, months) };
}

function shiftRangeYears(start: Date, end: Date, years: number) {
  return { start: subYears(start, years), end: subYears(end, years) };
}

function mapSeries(keys: string[], values: Map<string, number>, formatter?: (key: string) => string) {
  return keys.map((key) => ({
    key,
    label: formatter ? formatter(key) : key,
    value: values.get(key) ?? 0,
  }));
}

function percentile(value: number, base: number) {
  return base > 0 ? value / base : null;
}

function safeCloseRate(won: number, sent: number) {
  return sent > 0 ? won / sent : null;
}

function average(value: number, count: number) {
  return count > 0 ? value / count : null;
}

function buildAIReview(summary: any, leadSources: any[], seasonal: any) {
  const recommendations: string[] = [];
  const lines: string[] = [];

  if (summary.revenueGrowthPercent !== null) {
    lines.push(`Revenue changed ${summary.revenueGrowthPercent >= 0 ? "up" : "down"} ${Math.abs(summary.revenueGrowthPercent).toFixed(1)}% versus the comparison period.`);
  }
  if (summary.payrollShare !== null) {
    lines.push(`Payroll represents ${(summary.payrollShare * 100).toFixed(1)}% of revenue.`);
  }

  const topSource = leadSources.filter((source: any) => source.revenueGenerated > 0).sort((a: any, b: any) => (b.roi ?? 0) - (a.roi ?? 0))[0];
  if (topSource) {
    lines.push(`${topSource.source} generated the strongest ROI.`);
    recommendations.push(`Increase ${topSource.source} marketing if volume stays profitable.`);
  }

  const weakSource = leadSources.filter((source: any) => source.leads > 5).sort((a: any, b: any) => (a.closeRate ?? 0) - (b.closeRate ?? 0))[0];
  if (weakSource && weakSource.closeRate !== null) {
    lines.push(`${weakSource.source} generated many leads but only a ${(weakSource.closeRate * 100).toFixed(1)}% close rate.`);
    recommendations.push(`Tighten follow-up or reduce spend on ${weakSource.source}.`);
  }

  if (seasonal.bestMonth?.label) {
    lines.push(`${seasonal.bestMonth.label} was the strongest month.`);
  }
  if (seasonal.worstMonth?.label) {
    lines.push(`${seasonal.worstMonth.label} was the weakest month.`);
  }

  if (summary.overdueInvoices > 0) recommendations.push("Improve invoice collections and follow-up.");
  if (summary.payrollShare !== null && summary.payrollShare > 0.3) recommendations.push("Watch payroll pressure before peak season.");
  if (summary.proposalCloseRate !== null && summary.proposalCloseRate < 0.25) recommendations.push("Improve proposal quality and follow-up cadence.");

  return {
    summary: lines.join(" ") || "Performance looks stable, but the business should continue to watch pipeline, payroll, and collections.",
    recommendations: recommendations.length > 0 ? recommendations : ["Keep improving proposal follow-up and collections discipline."],
  };
}

async function loadBusinessHistory(prisma: any, start: Date, end: Date) {
  const [jobs, opportunities, proposals, invoices, payments, expenses, timeEntries, users] = await Promise.all([
    prisma.job.findMany({
      where: {
        deletedAt: null,
        OR: [
          { createdAt: { gte: start, lte: end } },
          { updatedAt: { gte: start, lte: end } },
          { startDate: { gte: start, lte: end } },
          { endDate: { gte: start, lte: end } },
          { approvedAt: { gte: start, lte: end } },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        contractAmount: true,
        totalEstimate: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, name: true, source: true } },
      },
    }),
    prisma.opportunity.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        source: true,
        stage: true,
        status: true,
        leadValue: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, name: true, source: true } },
        job: { select: { id: true, name: true } },
      },
    }),
    prisma.proposal.findMany({
      where: {
        OR: [
          { createdAt: { gte: start, lte: end } },
          { sentAt: { gte: start, lte: end } },
          { approvedAt: { gte: start, lte: end } },
          { updatedAt: { gte: start, lte: end } },
        ],
      },
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        sentAt: true,
        approvedAt: true,
        updatedAt: true,
        customer: { select: { id: true, name: true, source: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { OR: [{ createdAt: { gte: start, lte: end } }, { updatedAt: { gte: start, lte: end } }, { sentAt: { gte: start, lte: end } }] },
      select: {
        id: true,
        total: true,
        amountPaid: true,
        amountRemaining: true,
        status: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        sentAt: true,
        customer: { select: { id: true, name: true, source: true } },
        job: { select: { id: true, name: true, contractAmount: true, totalEstimate: true, customer: { select: { id: true, name: true, source: true } } } },
      },
    }),
    prisma.payment.findMany({
      where: { dateReceived: { gte: start, lte: end } },
      select: {
        id: true,
        amount: true,
        dateReceived: true,
        jobId: true,
        invoiceId: true,
        job: { select: { id: true, name: true, customer: { select: { id: true, name: true, source: true } } } },
      },
    }),
    prisma.expense.findMany({
      where: { expenseDate: { gte: start, lte: end }, status: "approved" },
      select: {
        id: true,
        amount: true,
        category: true,
        expenseDate: true,
        status: true,
        jobId: true,
        job: { select: { id: true, name: true, customer: { select: { id: true, name: true, source: true } } } },
      },
    }),
    prisma.timeEntry.findMany({
      where: { clockIn: { gte: start, lte: end } },
      select: {
        id: true,
        userId: true,
        jobId: true,
        clockIn: true,
        clockOut: true,
        paidHours: true,
        grossHours: true,
        hoursWorked: true,
        travelHours: true,
        specialPayEnabled: true,
        isIslandJob: true,
        hourlyRateAdjustment: true,
        user: { select: { id: true, name: true, hourlyRate: true } },
        job: { select: { id: true, name: true, customer: { select: { id: true, name: true, source: true } }, contractAmount: true, totalEstimate: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, hourlyRate: true, isActive: true },
    }),
  ]);

  return { jobs, opportunities, proposals, invoices, payments, expenses, timeEntries, users };
}

function buildMonthSeries(payments: any[], start: Date, end: Date) {
  const months = [] as Date[];
  const cursor = startOfMonth(start);
  const stop = startOfMonth(end);
  while (cursor <= stop) {
    months.push(new Date(cursor));
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    cursor.setTime(next.getTime());
  }
  const values = new Map<string, number>();
  for (const month of months) values.set(month.toISOString().slice(0, 7), 0);
  for (const payment of payments) {
    const key = payment.dateReceived.toISOString().slice(0, 7);
    if (values.has(key)) values.set(key, (values.get(key) ?? 0) + money(payment.amount));
  }
  return months.map((month) => ({ key: month.toISOString().slice(0, 7), label: monthLabel(month), value: values.get(month.toISOString().slice(0, 7)) ?? 0 }));
}

function buildYearSeries(payments: any[], startYear: number, endYear: number) {
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year += 1) years.push(year);
  const values = new Map<number, number>(years.map((year) => [year, 0]));
  for (const payment of payments) {
    const year = payment.dateReceived.getFullYear();
    if (values.has(year)) values.set(year, (values.get(year) ?? 0) + money(payment.amount));
  }
  return years.map((year) => ({ key: String(year), label: String(year), value: values.get(year) ?? 0 }));
}

function buildQuarterSeries(payments: any[], start: Date, end: Date) {
  const series: Array<{ key: string; label: string; value: number }> = [];
  let cursor = startOfQuarter(start);
  const stop = startOfQuarter(end);
  while (cursor <= stop) {
    const key = `${cursor.getFullYear()}-Q${Math.floor(cursor.getMonth() / 3) + 1}`;
    series.push({ key, label: quarterLabel(cursor), value: 0 });
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 3);
    cursor = next;
  }
  const values = new Map(series.map((item) => [item.key, 0]));
  for (const payment of payments) {
    const quarterStart = startOfQuarter(payment.dateReceived);
    const key = `${quarterStart.getFullYear()}-Q${Math.floor(quarterStart.getMonth() / 3) + 1}`;
    if (values.has(key)) values.set(key, (values.get(key) ?? 0) + money(payment.amount));
  }
  return series.map((item) => ({ ...item, value: values.get(item.key) ?? 0 }));
}

function currentPeriodMetrics(range: { start: Date; end: Date }, history: Awaited<ReturnType<typeof loadBusinessHistory>>) {
  const payments = history.payments.filter((item: any) => isInRange(item.dateReceived, range.start, range.end));
  const expenses = history.expenses.filter((item: any) => isInRange(item.expenseDate, range.start, range.end));
  const proposals = history.proposals.filter((item: any) => isInRange(item.createdAt, range.start, range.end) || isInRange(item.sentAt, range.start, range.end) || isInRange(item.updatedAt, range.start, range.end));
  const opportunities = history.opportunities.filter((item: any) => isInRange(item.createdAt, range.start, range.end));
  const jobs = history.jobs.filter((item: any) => isInRange(item.createdAt, range.start, range.end) || isInRange(item.startDate, range.start, range.end) || isInRange(item.endDate, range.start, range.end));
  const timeEntries = history.timeEntries.filter((item: any) => isInRange(item.clockIn, range.start, range.end));

  const revenue = payments.reduce((sum: number, payment: any) => sum + money(payment.amount), 0);
  const ytdRevenue = history.payments.filter((item: any) => isInRange(item.dateReceived, startOfYear(range.start), range.end)).reduce((sum: number, payment: any) => sum + money(payment.amount), 0);
  const expensesTotal = expenses.reduce((sum: number, expense: any) => sum + money(expense.amount), 0);
  const payroll = payrollForEntries(timeEntries);
  const employeeHours = timeEntries.reduce((sum: number, entry: any) => sum + totalHours(entry), 0);
  const directExpenses = expenses.filter((expense: any) => DIRECT_EXPENSE_CATEGORIES.has(String(expense.category))).reduce((sum: number, expense: any) => sum + money(expense.amount), 0);
  const overheadExpenses = expensesTotal - directExpenses;
  const grossProfit = revenue - directExpenses - payroll;
  const netProfit = grossProfit - overheadExpenses;
  const profitMargin = revenue > 0 ? netProfit / revenue : null;

  const openProposals = history.proposals.filter((proposal: any) => !["approved", "declined", "converted"].includes(proposal.status)).length;
  const openProposalValue = history.proposals.filter((proposal: any) => !["approved", "declined", "converted"].includes(proposal.status)).reduce((sum: number, proposal: any) => sum + money(proposal.totalAmount), 0);
  const wonProposals = history.proposals.filter((proposal: any) => ["approved", "converted"].includes(proposal.status));
  const lostProposals = history.proposals.filter((proposal: any) => proposal.status === "declined");
  const proposalsSent = proposals.filter((proposal: any) => isInRange(proposal.sentAt, range.start, range.end)).length;
  const conversionRate = safeCloseRate(wonProposals.filter((proposal: any) => isInRange(proposal.approvedAt ?? proposal.updatedAt, range.start, range.end)).length, proposalsSent || history.proposals.filter((proposal: any) => isInRange(proposal.sentAt, range.start, range.end)).length);
  const expectedRevenue = openProposalValue * (conversionRate ?? CLOSE_RATE_BASELINE);

  const moneyCollected = revenue;
  const outstandingInvoices = history.invoices.filter((invoice: any) => ["sent", "partial"].includes(invoice.status) && money(invoice.amountRemaining) > 0).reduce((sum: number, invoice: any) => sum + money(invoice.amountRemaining), 0);
  const overdueInvoices = history.invoices.filter((invoice: any) => money(invoice.amountRemaining) > 0 && ((invoice.status === "overdue") || (invoice.dueDate ? invoice.dueDate.getTime() < range.end.getTime() : false)));
  const cashExpected = moneyCollected + outstandingInvoices;

  const activeJobs = history.jobs.filter((job: any) => ["approved", "active"].includes(job.status)).length;
  const completedJobs = jobs.filter((job: any) => job.status === "completed").length;
  const openJobs = jobs.filter((job: any) => ["estimate", "sent", "approved", "active"].includes(job.status)).length;
  const weekStart = new Date(range.end);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const jobsStartingThisWeek = history.jobs.filter((job: any) => job.startDate && isInRange(job.startDate, weekStart, weekEnd)).length;
  const jobsEndingThisWeek = history.jobs.filter((job: any) => job.endDate && isInRange(job.endDate, weekStart, weekEnd)).length;
  const employeesWorkingToday = new Set(timeEntries.filter((entry: any) => entry.clockIn.toDateString() === range.end.toDateString()).map((entry: any) => entry.userId)).size;

  return {
    revenue,
    ytdRevenue,
    monthlyGoal: MONTHLY_GOAL,
    progressPercent: revenue > 0 ? Math.min(100, (revenue / MONTHLY_GOAL) * 100) : 0,
    pipeline: { openProposals, openProposalValue, expectedRevenue, conversionRate },
    cashFlow: { moneyCollected, outstandingInvoices, overdueInvoices: overdueInvoices.length, cashExpected },
    profit: { revenue, expenses: expensesTotal, payroll, estimatedNetProfit: netProfit, profitMargin },
    operations: { activeJobs, completedJobs, openJobs, jobsStartingThisWeek, jobsEndingThisWeek, employeesWorkingToday, employeeHours },
    proposalPerformance: {
      leadsReceived: opportunities.length,
      estimatesCreated: proposals.filter((proposal: any) => isInRange(proposal.createdAt, range.start, range.end)).length,
      proposalsSent,
      proposalsWon: wonProposals.length,
      proposalsLost: lostProposals.length,
      closeRate: conversionRate,
      averageProposalAmount: average(proposals.reduce((sum: number, proposal: any) => sum + money(proposal.totalAmount), 0), proposals.length),
      averageJobAmount: average(jobs.reduce((sum: number, job: any) => sum + jobValue(job), 0), jobs.length),
      revenueWon: wonProposals.reduce((sum: number, proposal: any) => sum + money(proposal.totalAmount), 0),
      revenueLost: lostProposals.reduce((sum: number, proposal: any) => sum + money(proposal.totalAmount), 0),
    },
  };
}

function buildLeadSourceRows(range: { start: Date; end: Date }, history: Awaited<ReturnType<typeof loadBusinessHistory>>) {
  const sourceMap = new Map<string, { leads: number; estimates: number; proposals: number; won: number; proposalValue: number; revenue: number; jobValue: number; }>();
  for (const source of SOURCE_BUCKETS) sourceMap.set(source, { leads: 0, estimates: 0, proposals: 0, won: 0, proposalValue: 0, revenue: 0, jobValue: 0 });

  const ensure = (source: string) => {
    if (!sourceMap.has(source)) sourceMap.set(source, { leads: 0, estimates: 0, proposals: 0, won: 0, proposalValue: 0, revenue: 0, jobValue: 0 });
    return sourceMap.get(source)!;
  };

  for (const opportunity of history.opportunities) {
    if (!isInRange(opportunity.createdAt, range.start, range.end)) continue;
    const bucket = ensure(normalizeSource(opportunity.source ?? opportunity.customer?.source));
    bucket.leads += 1;
    if (opportunity.stage === "estimate_sent") bucket.estimates += 1;
  }

  for (const proposal of history.proposals) {
    if (!isInRange(proposal.sentAt, range.start, range.end) && !isInRange(proposal.createdAt, range.start, range.end) && !isInRange(proposal.updatedAt, range.start, range.end)) continue;
    const bucket = ensure(normalizeSource(proposal.customer?.source));
    bucket.proposals += 1;
    bucket.proposalValue += money(proposal.totalAmount);
    if (["approved", "converted"].includes(proposal.status)) bucket.won += 1;
  }

  const jobRevenueByCustomer = new Map<number, number>();
  for (const payment of history.payments) {
    const customerId = payment.job?.customer?.id;
    if (!customerId) continue;
    jobRevenueByCustomer.set(customerId, (jobRevenueByCustomer.get(customerId) ?? 0) + money(payment.amount));
  }

  for (const payment of history.payments) {
    if (!isInRange(payment.dateReceived, range.start, range.end)) continue;
    const bucket = ensure(normalizeSource(payment.job?.customer?.source));
    bucket.revenue += money(payment.amount);
  }

  for (const job of history.jobs) {
    const bucket = ensure(normalizeSource(job.customer?.source));
    bucket.jobValue += jobValue(job);
  }

  const rows = Array.from(sourceMap.entries()).map(([source, bucket]) => ({
    source,
    leads: bucket.leads,
    estimates: bucket.estimates,
    proposals: bucket.proposals,
    won: bucket.won,
    closeRate: bucket.proposals > 0 ? bucket.won / bucket.proposals : null,
    revenueGenerated: bucket.revenue,
    averageJobSize: bucket.won > 0 ? bucket.revenue / bucket.won : null,
    roi: bucket.proposalValue > 0 ? bucket.revenue / bucket.proposalValue : null,
  }));

  return rows.sort((a: any, b: any) => b.revenueGenerated - a.revenueGenerated);
}

function buildCustomerAnalytics(range: { start: Date; end: Date }, history: Awaited<ReturnType<typeof loadBusinessHistory>>) {
  const revenueByCustomer = new Map<number, { name: string; revenue: number; jobs: number; source: string | null }>();
  const jobProfitRows: Array<{ name: string; customer: string; revenue: number; expenses: number; payroll: number; profit: number }> = [];
  const expenseByJob = new Map<number, number>();
  const revenueByJob = new Map<number, number>();
  const payrollByJob = new Map<number, number>();
  const hoursByJob = new Map<number, number>();

  for (const expense of history.expenses) {
    if (!expense.jobId || !isInRange(expense.expenseDate, range.start, range.end)) continue;
    expenseByJob.set(expense.jobId, (expenseByJob.get(expense.jobId) ?? 0) + money(expense.amount));
  }
  for (const payment of history.payments) {
    if (!payment.jobId || !isInRange(payment.dateReceived, range.start, range.end)) continue;
    revenueByJob.set(payment.jobId, (revenueByJob.get(payment.jobId) ?? 0) + money(payment.amount));
  }
  for (const entry of history.timeEntries) {
    if (!entry.jobId || !isInRange(entry.clockIn, range.start, range.end)) continue;
    const hours = totalHours(entry);
    hoursByJob.set(entry.jobId, (hoursByJob.get(entry.jobId) ?? 0) + hours);
  }
  for (const entry of history.timeEntries) {
    if (!entry.jobId || !isInRange(entry.clockIn, range.start, range.end)) continue;
    const hours = totalHours(entry);
    const jobTotalHours = hoursByJob.get(entry.jobId) ?? 0;
    const jobRevenue = revenueByJob.get(entry.jobId) ?? 0;
    const allocatedRevenue = jobTotalHours > 0 ? jobRevenue * (hours / jobTotalHours) : 0;
    payrollByJob.set(entry.jobId, (payrollByJob.get(entry.jobId) ?? 0) + (money(entry.user.hourlyRate) * hours));
    const customerId = entry.job?.customer?.id;
    if (!customerId) continue;
    const existing = revenueByCustomer.get(customerId) ?? { name: entry.job.customer.name, revenue: 0, jobs: 0, source: entry.job.customer.source ?? null };
    existing.revenue += allocatedRevenue;
    existing.jobs += 1;
    revenueByCustomer.set(customerId, existing);
  }

  for (const job of history.jobs) {
    if (!isInRange(job.createdAt, range.start, range.end) && !isInRange(job.startDate, range.start, range.end) && !isInRange(job.endDate, range.start, range.end)) continue;
    const revenue = revenueByJob.get(job.id) ?? 0;
    const expenses = expenseByJob.get(job.id) ?? 0;
    const payroll = payrollByJob.get(job.id) ?? 0;
    jobProfitRows.push({
      name: job.name,
      customer: job.customer.name,
      revenue,
      expenses,
      payroll,
      profit: revenue - expenses - payroll,
    });
  }

  const topCustomers = Array.from(revenueByCustomer.entries())
    .map(([id, row]) => ({ id, ...row }))
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 10);

  const repeatCustomers = topCustomers.filter((customer) => customer.jobs > 1).length;
  const largestJobs = history.jobs
    .filter((job: any) => isInRange(job.createdAt, range.start, range.end) || isInRange(job.startDate, range.start, range.end) || isInRange(job.endDate, range.start, range.end))
    .map((job: any) => ({ name: job.name, customer: job.customer.name, value: jobValue(job) }))
    .sort((a: any, b: any) => b.value - a.value)
    .slice(0, 10);
  const mostProfitableJobs = jobProfitRows.sort((a: any, b: any) => b.profit - a.profit).slice(0, 10);

  return { topCustomers, repeatCustomers, largestJobs, mostProfitableJobs };
}

function buildEmployeeAnalytics(range: { start: Date; end: Date }, history: Awaited<ReturnType<typeof loadBusinessHistory>>) {
  const employeeMap = new Map<number, { name: string; hours: number; payroll: number; revenue: number }>();
  const hoursByJob = new Map<number, number>();
  const revenueByJob = new Map<number, number>();

  for (const entry of history.timeEntries) {
    if (!entry.jobId || !isInRange(entry.clockIn, range.start, range.end)) continue;
    const hours = totalHours(entry);
    hoursByJob.set(entry.jobId, (hoursByJob.get(entry.jobId) ?? 0) + hours);
  }
  for (const payment of history.payments) {
    if (!payment.jobId || !isInRange(payment.dateReceived, range.start, range.end)) continue;
    revenueByJob.set(payment.jobId, (revenueByJob.get(payment.jobId) ?? 0) + money(payment.amount));
  }
  for (const entry of history.timeEntries) {
    if (!entry.jobId || !isInRange(entry.clockIn, range.start, range.end)) continue;
    const hours = totalHours(entry);
    const jobHours = hoursByJob.get(entry.jobId) ?? 0;
    const jobRevenue = revenueByJob.get(entry.jobId) ?? 0;
    const revenueShare = jobHours > 0 ? jobRevenue * (hours / jobHours) : 0;
    const payrollShare = money(entry.user.hourlyRate) * hours;
    const existing = employeeMap.get(entry.userId) ?? { name: entry.user.name, hours: 0, payroll: 0, revenue: 0 };
    existing.hours += hours;
    existing.payroll += payrollShare;
    existing.revenue += revenueShare;
    employeeMap.set(entry.userId, existing);
  }

  return Array.from(employeeMap.values())
    .map((row) => ({
      ...row,
      revenuePerEmployee: row.hours > 0 ? row.revenue / row.hours : null,
      laborEfficiency: row.payroll > 0 ? row.revenue / row.payroll : null,
    }))
    .sort((a: any, b: any) => b.revenue - a.revenue);
}

function buildSeasonality(monthlyRevenue: Array<{ key: string; label: string; value: number }>, yearlyRevenue: Array<{ key: string; label: string; value: number }>) {
  const bestMonth = monthlyRevenue.reduce((best: any, current: any) => (current.value > best.value ? current : best), monthlyRevenue[0] ?? { label: "—", value: 0 });
  const worstMonth = monthlyRevenue.reduce((worst: any, current: any) => (current.value < worst.value ? current : worst), monthlyRevenue[0] ?? { label: "—", value: 0 });
  const quarterBuckets = new Map<string, number>();
  for (const month of monthlyRevenue) {
    const [year, monthIndex] = month.key.split("-").map(Number);
    const quarter = `Q${Math.floor((monthIndex - 1) / 3) + 1} ${year}`;
    quarterBuckets.set(quarter, (quarterBuckets.get(quarter) ?? 0) + month.value);
  }
  const quarterRows = Array.from(quarterBuckets.entries()).map(([label, value]) => ({ label, value }));
  const bestQuarter = quarterRows.reduce((best: any, current: any) => (current.value > best.value ? current : best), quarterRows[0] ?? { label: "—", value: 0 });
  const slowestQuarter = quarterRows.reduce((worst: any, current: any) => (current.value < worst.value ? current : worst), quarterRows[0] ?? { label: "—", value: 0 });
  const latestYear = yearlyRevenue[yearlyRevenue.length - 1];
  const previousYear = yearlyRevenue[yearlyRevenue.length - 2];
  const yearOverYearGrowth = latestYear && previousYear && previousYear.value > 0 ? (latestYear.value - previousYear.value) / previousYear.value : null;
  return { bestMonth, worstMonth, bestQuarter, slowestQuarter, yearOverYearGrowth };
}

function comparisonLabel(range: { start: Date; end: Date }, compare: { start: Date; end: Date } | null) {
  if (!compare) return null;
  return { start: compare.start, end: compare.end };
}

function compareMetrics(current: any, compare: any) {
  if (!compare) return null;
  return {
    revenueDifference: current.revenue - compare.revenue,
    profitDifference: current.profit.estimatedNetProfit - compare.profit.estimatedNetProfit,
    closeRateDifference: (current.proposalPerformance.closeRate ?? 0) - (compare.proposalPerformance.closeRate ?? 0),
    proposalValueDifference: current.pipeline.openProposalValue - compare.pipeline.openProposalValue,
  };
}

function buildComparisonRange(range: { start: Date; end: Date }, periodType: string, comparePreviousMonth: boolean, compareSameMonthLastYear: boolean, comparePreviousYear: boolean, compareCustomPeriods: boolean) {
  const durationMonths = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  if (compareCustomPeriods && periodType === "custom") {
    const shift = Math.max(1, durationMonths);
    return { start: subMonths(range.start, shift), end: subMonths(range.end, shift) };
  }
  if (comparePreviousYear) return shiftRangeYears(range.start, range.end, 1);
  if (compareSameMonthLastYear) return shiftRangeYears(range.start, range.end, 1);
  if (comparePreviousMonth) return shiftRange(range.start, range.end, Math.max(1, durationMonths));
  return null;
}

export const businessRouter = router({
  analytics: adminProcedure.input(analyticsInput).query(async ({ ctx, input }) => {
    const now = new Date();
    const range = calcRange(input.periodType, input, now);
    const historyStart = startOfYear(subYears(now, 5));
    const history = await loadBusinessHistory(ctx.prisma, historyStart, now);

    const currentYearStart = startOfYear(range.start);
    const monthlyRevenue = buildMonthSeries(history.payments, subMonths(now, 11), now);
    const yearlyRevenue = buildYearSeries(history.payments, historyStart.getFullYear(), now.getFullYear());
    const quarterlyRevenue = buildQuarterSeries(history.payments, historyStart, now);
    const yearlyRevenueMap = yearlyRevenue.map((entry) => entry.value);
    const averageMonthlyRevenue = monthlyRevenue.length > 0 ? monthlyRevenue.reduce((sum: number, entry: any) => sum + entry.value, 0) / monthlyRevenue.length : null;
    const revenueGrowthPercent = yearlyRevenue.length > 1 && yearlyRevenue[yearlyRevenue.length - 2].value > 0 ? (yearlyRevenue[yearlyRevenue.length - 1].value - yearlyRevenue[yearlyRevenue.length - 2].value) / yearlyRevenue[yearlyRevenue.length - 2].value : null;

    const current = currentPeriodMetrics(range, history);
    const compareRange = buildComparisonRange(range, input.periodType, input.comparePreviousMonth ?? true, input.compareSameMonthLastYear ?? true, input.comparePreviousYear ?? true, input.compareCustomPeriods ?? true);
    const compare = compareRange ? currentPeriodMetrics(compareRange, history) : null;
    const comparisons = compareMetrics(current, compare);

    const proposalSeries = monthlyRevenue.map((point) => {
      const monthDate = new Date(point.key + "-01T00:00:00");
      const monthProposals = history.proposals.filter((proposal: any) => isInRange(proposal.createdAt, startOfMonth(monthDate), endOfMonth(monthDate)));
      return {
        key: point.key,
        label: point.label,
        leadsReceived: history.opportunities.filter((opportunity: any) => isInRange(opportunity.createdAt, startOfMonth(monthDate), endOfMonth(monthDate))).length,
        estimatesCreated: monthProposals.filter((proposal: any) => isInRange(proposal.createdAt, startOfMonth(monthDate), endOfMonth(monthDate))).length,
        proposalsSent: monthProposals.filter((proposal: any) => isInRange(proposal.sentAt, startOfMonth(monthDate), endOfMonth(monthDate))).length,
        proposalsWon: monthProposals.filter((proposal: any) => ["approved", "converted"].includes(proposal.status) && isInRange(proposal.approvedAt ?? proposal.updatedAt, startOfMonth(monthDate), endOfMonth(monthDate))).length,
        proposalsLost: monthProposals.filter((proposal: any) => proposal.status === "declined").length,
        revenueWon: monthProposals.filter((proposal: any) => ["approved", "converted"].includes(proposal.status)).reduce((sum: number, proposal: any) => sum + money(proposal.totalAmount), 0),
      };
    });

    const leadSourceAnalytics = buildLeadSourceRows(range, history);
    const customerAnalytics = buildCustomerAnalytics(range, history);
    const employeeAnalytics = buildEmployeeAnalytics(range, history);
    const seasonalTrends = buildSeasonality(monthlyRevenue, yearlyRevenue);
    const aiReview = buildAIReview(current, leadSourceAnalytics, seasonalTrends);

    return {
      period: range,
      comparisons,
      revenue: {
        revenueByMonth: monthlyRevenue,
        revenueByYear: yearlyRevenue,
        averageMonthlyRevenue,
        revenueGrowthPercent,
        revenueByQuarter: quarterlyRevenue,
      },
      profit: {
        revenue: current.revenue,
        grossProfit: current.profit.revenue - current.profit.payroll,
        netProfit: current.profit.estimatedNetProfit,
        expenses: current.profit.expenses,
        payroll: current.profit.payroll,
        profitMargin: current.profit.profitMargin,
        profitByMonth: monthlyRevenue.map((entry) => ({ ...entry, value: entry.value - current.profit.expenses / Math.max(1, monthlyRevenue.length) - current.profit.payroll / Math.max(1, monthlyRevenue.length) })),
      },
      proposals: {
        leadsReceived: current.proposalPerformance.leadsReceived,
        estimatesCreated: current.proposalPerformance.estimatesCreated,
        proposalsSent: current.proposalPerformance.proposalsSent,
        proposalsWon: current.proposalPerformance.proposalsWon,
        proposalsLost: current.proposalPerformance.proposalsLost,
        closeRate: current.proposalPerformance.closeRate,
        averageProposalAmount: current.proposalPerformance.averageProposalAmount,
        averageJobAmount: current.proposalPerformance.averageJobAmount,
        revenueWon: current.proposalPerformance.revenueWon,
        revenueLost: current.proposalPerformance.revenueLost,
        series: proposalSeries,
      },
      leadSources: leadSourceAnalytics,
      customers: customerAnalytics,
      employees: employeeAnalytics,
      seasonal: seasonalTrends,
      dashboard: current,
      aiReview,
    };
  }),
});
