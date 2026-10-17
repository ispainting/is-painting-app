import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkOrionAuth } from "@/lib/orion-auth";

// Read-only business summary for ORION, the marketing platform (ispainting-platform). It lets
// marketing decisions see real leads, proposals, jobs and money without ORION ever touching this
// database. Only totals, stages, sources, cities and amounts leave this app — never a customer's
// name, phone, email, address or a project name, because ORION forwards what it reads to AI models.
//
// Auth: `Authorization: Bearer <ORION_API_SECRET>`. Fails closed when the secret isn't set.
// The path is listed as public in src/middleware.ts because ORION has no session cookie.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same goals and close-rate the admin dashboard uses (src/server/api/routers/reports.ts).
// Keep these in sync if the goals change there.
const SURVIVAL_TARGET = 40_000;
const PRODUCTION_GOAL = 65_000;

const DAY_MS = 86_400_000;
const SOURCE_WINDOW_DAYS = 90;

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function jobValue(job: { contractAmount: unknown; totalEstimate: unknown }) {
  const contract = money(job.contractAmount);
  return contract > 0 ? contract : money(job.totalEstimate);
}

// Mirrors normalizeSource in reports.ts so both apps group sources the same way.
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

export async function GET(req: Request) {
  const auth = checkOrionAuth(req);
  if (auth === "unconfigured") {
    console.error("[api/orion/summary] ORION_API_SECRET is not set — refusing to serve business data");
    return NextResponse.json({ error: "ORION access is not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const month = { gte: monthStart, lt: monthEnd };
  const sourceWindowStart = new Date(now.getTime() - SOURCE_WINDOW_DAYS * DAY_MS);

  const [
    leadsThisMonth,
    proposalsSent,
    proposalsApproved,
    jobsWon,
    jobsTouchedThisMonth,
    payments,
    expenses,
    openByStage,
    openProposals,
    activeJobs,
    invoices,
    recentOpportunities,
    recentProposals,
    recentJobs,
    recentPayments,
  ] = await Promise.all([
    prisma.opportunity.count({ where: { createdAt: month } }),
    prisma.proposal.findMany({ where: { sentAt: month, deletedAt: null }, select: { totalAmount: true } }),
    prisma.proposal.findMany({ where: { approvedAt: month, deletedAt: null }, select: { totalAmount: true } }),
    prisma.job.findMany({ where: { approvedAt: month, deletedAt: null }, select: { contractAmount: true, totalEstimate: true } }),
    // Same selection the admin dashboard uses for completed vs. scheduled production this month.
    prisma.job.findMany({
      where: {
        deletedAt: null,
        status: { in: ["approved", "active", "completed"] },
        OR: [{ updatedAt: month }, { startDate: month }, { endDate: month }],
      },
      select: { status: true, contractAmount: true, totalEstimate: true },
    }),
    prisma.payment.aggregate({ where: { dateReceived: month }, _sum: { amount: true }, _count: true }),
    prisma.expense.aggregate({ where: { expenseDate: month }, _sum: { amount: true } }),
    prisma.opportunity.groupBy({ by: ["stage"], where: { status: "open", pipeline: "sales" }, _count: true }),
    prisma.proposal.findMany({ where: { status: { in: ["sent", "viewed", "follow_up"] }, deletedAt: null }, select: { totalAmount: true } }),
    prisma.job.findMany({ where: { status: { in: ["approved", "active"] }, deletedAt: null }, select: { contractAmount: true, totalEstimate: true } }),
    prisma.invoice.findMany({ where: { status: { not: "cancelled" } }, select: { status: true, amountRemaining: true, dueDate: true } }),
    prisma.opportunity.findMany({
      where: { createdAt: { gte: sourceWindowStart } },
      select: {
        createdAt: true,
        stage: true,
        status: true,
        source: true,
        customer: { select: { leadSource: true, city: true } },
        job: { select: { contractAmount: true, totalEstimate: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.proposal.findMany({
      where: { deletedAt: null, sentAt: { not: null } },
      select: { status: true, sentAt: true, approvedAt: true, totalAmount: true, city: true },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
    prisma.job.findMany({
      where: { deletedAt: null, approvedAt: { not: null } },
      select: { status: true, approvedAt: true, contractAmount: true, totalEstimate: true, city: true },
      orderBy: { approvedAt: "desc" },
      take: 5,
    }),
    prisma.payment.findMany({
      select: { dateReceived: true, amount: true, job: { select: { city: true } } },
      orderBy: { dateReceived: "desc" },
      take: 5,
    }),
  ]);

  const sum = (rows: { totalAmount: unknown }[]) => rows.reduce((total, row) => total + money(row.totalAmount), 0);

  const completedRevenue = jobsTouchedThisMonth.filter((j) => j.status === "completed").reduce((t, j) => t + jobValue(j), 0);
  const scheduledRevenue = jobsTouchedThisMonth.filter((j) => j.status !== "completed").reduce((t, j) => t + jobValue(j), 0);

  const openInvoices = invoices.filter((i) => ["sent", "partial", "overdue"].includes(i.status) && money(i.amountRemaining) > 0);
  const overdueInvoices = openInvoices.filter((i) => i.status === "overdue" || (i.dueDate ? i.dueDate.getTime() < now.getTime() : false));

  const bySource = new Map<string, { source: string; leads: number; won: number; wonValue: number; lost: number }>();
  for (const opp of recentOpportunities) {
    const source = normalizeSource(opp.source ?? opp.customer.leadSource);
    const row = bySource.get(source) ?? { source, leads: 0, won: 0, wonValue: 0, lost: 0 };
    row.leads += 1;
    if (opp.status === "won") {
      row.won += 1;
      row.wonValue += opp.job ? jobValue(opp.job) : 0;
    }
    if (opp.status === "lost") row.lost += 1;
    bySource.set(source, row);
  }

  const recent = [
    ...recentOpportunities.slice(0, 5).map((o) => ({
      kind: "lead" as const,
      status: o.stage,
      amount: null,
      city: o.customer.city ?? null,
      source: normalizeSource(o.source ?? o.customer.leadSource),
      at: o.createdAt,
    })),
    ...recentProposals.map((p) => ({
      kind: p.approvedAt ? ("proposal_approved" as const) : ("proposal_sent" as const),
      status: p.status,
      amount: money(p.totalAmount),
      city: p.city ?? null,
      source: null,
      at: p.approvedAt ?? p.sentAt!,
    })),
    ...recentJobs.map((j) => ({ kind: "job_won" as const, status: j.status, amount: jobValue(j), city: j.city ?? null, source: null, at: j.approvedAt! })),
    ...recentPayments.map((p) => ({ kind: "payment" as const, status: null, amount: money(p.amount), city: p.job.city ?? null, source: null, at: p.dateReceived })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)
    .map((e) => ({ ...e, at: e.at.toISOString() }));

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      currency: "USD",
      goals: { survivalMonthly: SURVIVAL_TARGET, productionMonthly: PRODUCTION_GOAL },
      month: {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString(),
        leads: leadsThisMonth,
        proposalsSent: { count: proposalsSent.length, amount: sum(proposalsSent) },
        proposalsApproved: { count: proposalsApproved.length, amount: sum(proposalsApproved) },
        jobsWon: { count: jobsWon.length, amount: jobsWon.reduce((t, j) => t + jobValue(j), 0) },
        completedRevenue,
        scheduledRevenue,
        collected: { count: payments._count, amount: money(payments._sum.amount) },
        expenses: money(expenses._sum.amount),
      },
      pipeline: {
        openLeadsByStage: Object.fromEntries(openByStage.map((row) => [row.stage, row._count])),
        openProposals: { count: openProposals.length, amount: sum(openProposals) },
        activeJobs: { count: activeJobs.length, amount: activeJobs.reduce((t, j) => t + jobValue(j), 0) },
        openInvoices: { count: openInvoices.length, amount: openInvoices.reduce((t, i) => t + money(i.amountRemaining), 0) },
        overdueInvoices: { count: overdueInvoices.length, amount: overdueInvoices.reduce((t, i) => t + money(i.amountRemaining), 0) },
      },
      sources: { windowDays: SOURCE_WINDOW_DAYS, rows: [...bySource.values()].sort((a, b) => b.leads - a.leads) },
      recent,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
