import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateJobTracking } from "@/lib/job-tracking";
import { jobCanonicalTotal } from "@/lib/job-total";
import { normalizeLeadSourceForReport } from "@/lib/lead-source";
import { businessRangeInMassachusetts } from "@/lib/employee-rate-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function businessDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatVariance(value: number) {
  const direction = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${direction}${formatMoney(Math.abs(value))}`;
}

async function createJobProfitabilityNotifications(now: Date) {
  const lastReport = await prisma.appNotification.findFirst({
    where: { kind: "job_profitability" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastReport && now.getTime() - lastReport.createdAt.getTime() < TWO_DAYS_MS - 60_000) {
    return { created: false, reason: "waiting_for_48_hours" };
  }

  const completedSince = new Date(now.getTime() - TWO_DAYS_MS);
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
      OR: [
        { status: "active" },
        { status: "completed", completedAt: { gte: completedSince } },
      ],
    },
    include: {
      expenses: { where: { status: { not: "rejected" } } },
      timeEntries: { include: { user: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  const rows = jobs.map((job) => {
    const contract = jobCanonicalTotal(job);
    const tracking = calculateJobTracking(job.timeEntries, job.id);
    const materialAndExpenseCost = job.expenses
      .filter((expense) => expense.category !== "labor" && expense.category !== "subcontractor")
      .reduce((sum, expense) => sum + money(expense.amount), 0);
    const subcontractorCost = job.expenses
      .filter((expense) => expense.category === "subcontractor")
      .reduce((sum, expense) => sum + money(expense.amount), 0);
    const actualCost = tracking.totalLaborCost + materialAndExpenseCost + subcontractorCost;
    const estimatedCost = money(job.laborBudget) + money(job.materialsBudget) + money(job.subcontractorBudget);

    return {
      jobId: job.id,
      name: job.name,
      status: job.status,
      completedAt: job.completedAt?.toISOString() ?? null,
      contract,
      estimated: {
        labor: money(job.laborBudget),
        materials: money(job.materialsBudget),
        subcontractors: money(job.subcontractorBudget),
        profit: contract - estimatedCost,
      },
      tracking: {
        labor: tracking.totalLaborCost,
        laborHours: tracking.totalHours,
        materialsAndExpenses: materialAndExpenseCost,
        subcontractors: subcontractorCost,
        totalCost: actualCost,
        profit: contract - actualCost,
        marginPercent: contract > 0 ? ((contract - actualCost) / contract) * 100 : null,
        laborCostPending: tracking.isLaborCostPending,
        hasTrackedExpenses: job.expenses.length > 0,
      },
    };
  });

  const totals = rows.reduce(
    (sum, row) => ({
      contracts: sum.contracts + row.contract,
      labor: sum.labor + row.tracking.labor,
      materialsAndExpenses: sum.materialsAndExpenses + row.tracking.materialsAndExpenses,
      subcontractors: sum.subcontractors + row.tracking.subcontractors,
      profit: sum.profit + row.tracking.profit,
    }),
    { contracts: 0, labor: 0, materialsAndExpenses: 0, subcontractors: 0, profit: 0 },
  );

  const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } });
  if (!admins.length) return { created: false, reason: "no_active_admins" };

  const dateKey = businessDateParts(now);
  const keyDate = `${dateKey.year}-${String(dateKey.month).padStart(2, "0")}-${String(dateKey.day).padStart(2, "0")}`;
  const body = rows.length
    ? [
        `${rows.length} active or recently completed job${rows.length === 1 ? "" : "s"}.`,
        `Totals — Contract: ${formatMoney(totals.contracts)} · Labor: ${formatMoney(totals.labor)} · Materials & expenses: ${formatMoney(totals.materialsAndExpenses)} · Subcontractors: ${formatMoney(totals.subcontractors)} · Tracking profit: ${formatMoney(totals.profit)}.`,
        ...rows.map((row) => `${row.name} (${row.status}) — Contract ${formatMoney(row.contract)}. Budget: labor ${formatMoney(row.estimated.labor)}, materials ${formatMoney(row.estimated.materials)}. Tracking: labor ${formatMoney(row.tracking.labor)} (${formatVariance(row.tracking.labor - row.estimated.labor)} vs budget)${row.tracking.laborCostPending ? " [rate pending]" : ""}, materials & expenses ${formatMoney(row.tracking.materialsAndExpenses)} (${formatVariance(row.tracking.materialsAndExpenses - row.estimated.materials)} vs budget), subcontractors ${formatMoney(row.tracking.subcontractors)}. Profit vs contract: ${formatMoney(row.tracking.profit)}.`),
      ].join("\n")
    : "No active jobs or jobs completed in the last two days. The report is saved here for this review period.";

  const createResult = await prisma.appNotification.createMany({
    data: admins.map(({ id }) => ({
      userId: id,
      kind: "job_profitability",
      title: "Job profitability report",
      body,
      href: "/reports",
      dedupeKey: `job-profitability:${keyDate}:${id}`,
      payload: { generatedAt: now.toISOString(), completedWithinDays: 2, totals, jobs: rows },
    })),
    skipDuplicates: true,
  });
  return { created: createResult.count > 0, count: createResult.count, jobs: rows.length };
}

async function createMonthlyLeadNotifications(now: Date) {
  const today = businessDateParts(now);
  if (today.day !== 1) return { created: false, reason: "not_month_start" };

  const previousMonth = today.month === 1
    ? { year: today.year - 1, month: 12 }
    : { year: today.year, month: today.month - 1 };
  const monthStart = new Date(Date.UTC(previousMonth.year, previousMonth.month - 1, 1, 12));
  const monthEndInclusive = new Date(Date.UTC(previousMonth.year, previousMonth.month, 0, 12));
  const range = businessRangeInMassachusetts(monthStart, monthEndInclusive);
  const leads = await prisma.opportunity.findMany({
    where: {
      OR: [
        { leadReceivedAt: { gte: range.start, lt: range.end } },
        { leadReceivedAt: null, createdAt: { gte: range.start, lt: range.end } },
      ],
    },
    select: { source: true, status: true },
  });

  const bySource = new Map<string, { source: string; leads: number; converted: number }>();
  for (const lead of leads) {
    const source = normalizeLeadSourceForReport(lead.source);
    const row = bySource.get(source) ?? { source, leads: 0, converted: 0 };
    row.leads += 1;
    if (lead.status === "won") row.converted += 1;
    bySource.set(source, row);
  }
  const rows = [...bySource.values()].sort((a, b) => b.leads - a.leads);
  const converted = rows.reduce((sum, row) => sum + row.converted, 0);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" }).format(monthStart);
  const body = rows.length
    ? [
        `${monthLabel}: ${leads.length} leads received and ${converted} converted (${leads.length ? ((converted / leads.length) * 100).toFixed(1) : "0.0"}% conversion).`,
        ...rows.map((row) => `${row.source}: ${row.leads} leads · ${row.converted} converted · ${row.leads ? ((row.converted / row.leads) * 100).toFixed(1) : "0.0"}% conversion.`),
      ].join("\n")
    : `${monthLabel}: no leads were recorded in the CRM during this month.`;

  const admins = await prisma.user.findMany({ where: { role: "admin", isActive: true }, select: { id: true } });
  if (!admins.length) return { created: false, reason: "no_active_admins" };
  const monthKey = `${previousMonth.year}-${String(previousMonth.month).padStart(2, "0")}`;
  const createResult = await prisma.appNotification.createMany({
    data: admins.map(({ id }) => ({
      userId: id,
      kind: "monthly_leads",
      title: `Monthly lead report · ${monthLabel}`,
      body,
      href: "/reports",
      dedupeKey: `monthly-leads:${monthKey}:${id}`,
      payload: { generatedAt: now.toISOString(), period: monthLabel, totalLeads: leads.length, converted, rows },
    })),
    skipDuplicates: true,
  });
  return { created: createResult.count > 0, count: createResult.count, leads: leads.length, converted };
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  try {
    const [jobReport, monthlyLeads] = await Promise.all([
      createJobProfitabilityNotifications(now),
      createMonthlyLeadNotifications(now),
    ]);
    return NextResponse.json({ ok: true, jobReport, monthlyLeads, generatedAt: now.toISOString() });
  } catch (error) {
    console.error("[cron/report-notifications] Failed to generate scheduled reports", error);
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
