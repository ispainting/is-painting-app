"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle,
  Briefcase,
  CircleAlert,
  DollarSign,
  FileText,
  Landmark,
  Wallet,
} from "lucide-react";

export default function DashboardPage() {
  const now = new Date();
  const { data, isLoading } = api.business.analytics.useQuery({
    periodType: "month",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    comparePreviousMonth: false,
    compareSameMonthLastYear: false,
    comparePreviousYear: false,
    compareCustomPeriods: false,
  });

  const dashboard = data?.dashboard;
  const currentRevenue = Number(dashboard?.revenue ?? 0);
  const ytdRevenue = Number(dashboard?.ytdRevenue ?? 0);
  const monthlyGoal = Number(dashboard?.monthlyGoal ?? 65_000);
  const progressPercent = Number(dashboard?.progressPercent ?? 0);
  const estimatedNetProfit = Number(dashboard?.profit?.estimatedNetProfit ?? 0);
  const healthStatus =
    estimatedNetProfit >= 0 && progressPercent >= 75
      ? "Healthy"
      : estimatedNetProfit >= 0 || progressPercent >= 50
        ? "Watch"
        : "At Risk";

  const alerts = buildActionableAlerts(data);

  return (
    <>
      <PageHeader title="Dashboard" description="Immediate executive overview of business health." />

      {isLoading || !dashboard ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Business health</div>
                <h2 className="mt-2 text-2xl font-semibold">{healthStatus}</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Revenue collected this month, pipeline strength, cash pressure, and profit snapshot in one view.
                </p>
              </div>
              <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${healthBadgeClass(healthStatus)}`}>
                {healthStatus}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Revenue" icon={DollarSign} subtitle="How much cash came in and how close the month is to plan.">
              <MetricGrid
                metrics={[
                  ["Revenue collected this month", formatCurrency(currentRevenue)],
                  ["Revenue YTD", formatCurrency(ytdRevenue)],
                  ["Monthly goal", formatCurrency(monthlyGoal)],
                  ["Progress", `${progressPercent.toFixed(0)}%`],
                ]}
              />
              <ProgressBar value={progressPercent} />
            </SectionCard>

            <SectionCard title="Pipeline" icon={FileText} subtitle="Open opportunities and likely revenue from active proposals.">
              <MetricGrid
                metrics={[
                  ["Open proposals", formatCount(dashboard.pipeline.openProposals)],
                  ["Open proposal value", formatCurrency(dashboard.pipeline.openProposalValue)],
                  ["Expected revenue", formatCurrency(dashboard.pipeline.expectedRevenue)],
                  ["Proposal conversion %", formatPercent(dashboard.pipeline.conversionRate)],
                ]}
              />
            </SectionCard>

            <SectionCard title="Cash Flow" icon={Wallet} subtitle="What has been collected and what is still coming in.">
              <MetricGrid
                metrics={[
                  ["Money collected", formatCurrency(dashboard.cashFlow.moneyCollected)],
                  ["Outstanding invoices", formatCurrency(dashboard.cashFlow.outstandingInvoices)],
                  ["Overdue invoices", formatCount(dashboard.cashFlow.overdueInvoices)],
                  ["Cash expected", formatCurrency(dashboard.cashFlow.cashExpected)],
                ]}
              />
            </SectionCard>

            <SectionCard title="Profit Snapshot" icon={Landmark} subtitle="A quick read on profit and margin before overhead drags the month down.">
              <MetricGrid
                metrics={[
                  ["Revenue", formatCurrency(dashboard.profit.revenue)],
                  ["Expenses", formatCurrency(dashboard.profit.expenses)],
                  ["Payroll", formatCurrency(dashboard.profit.payroll)],
                  ["Estimated net profit", formatCurrency(dashboard.profit.estimatedNetProfit)],
                  ["Profit margin %", formatPercent(dashboard.profit.profitMargin)],
                ]}
              />
            </SectionCard>

            <SectionCard title="Operations" icon={Briefcase} subtitle="Current work in flight and the crew on the board today.">
              <MetricGrid
                metrics={[
                  ["Active jobs", formatCount(dashboard.operations.activeJobs)],
                  ["Jobs starting this week", formatCount(dashboard.operations.jobsStartingThisWeek)],
                  ["Jobs ending this week", formatCount(dashboard.operations.jobsEndingThisWeek)],
                  ["Employees working today", formatCount(dashboard.operations.employeesWorkingToday)],
                ]}
              />
            </SectionCard>

            <SectionCard title="Alerts" icon={CircleAlert} subtitle="Only actionable issues that need attention now.">
              {alerts.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  No immediate action items. Collections, pipeline, and payroll are within tolerance.
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <AlertRow key={alert.title} alert={alert} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </>
  );
}

function buildActionableAlerts(data: any) {
  if (!data?.dashboard) return [];
  const alerts: Array<{ level: "info" | "warning" | "danger"; title: string; detail: string }> = [];
  const dashboard = data.dashboard;
  if (dashboard.cashFlow.overdueInvoices > 0) {
    alerts.push({
      level: "danger",
      title: "Overdue invoices",
      detail: `${formatCount(dashboard.cashFlow.overdueInvoices)} overdue invoice${dashboard.cashFlow.overdueInvoices === 1 ? "" : "s"} still need collection.`,
    });
  }
  if (dashboard.pipeline.openProposalValue < dashboard.monthlyGoal) {
    alerts.push({
      level: "warning",
      title: "Low proposal pipeline",
      detail: `Open proposal value is ${formatCurrency(dashboard.pipeline.openProposalValue)}, below the ${formatCurrency(dashboard.monthlyGoal)} monthly goal.`,
    });
  }
  if (dashboard.proposalPerformance.estimatesCreated < dashboard.proposalPerformance.leadsReceived) {
    alerts.push({
      level: "warning",
      title: "Missing estimates",
      detail: `Only ${formatCount(dashboard.proposalPerformance.estimatesCreated)} estimate${dashboard.proposalPerformance.estimatesCreated === 1 ? "" : "s"} were created for ${formatCount(dashboard.proposalPerformance.leadsReceived)} lead${dashboard.proposalPerformance.leadsReceived === 1 ? "" : "s"}.`,
    });
  }
  if (dashboard.profit.estimatedNetProfit < 0) {
    alerts.push({
      level: "danger",
      title: "Payroll exceeds projected income",
      detail: `Estimated net profit is negative at ${formatCurrency(dashboard.profit.estimatedNetProfit)}.`,
    });
  }
  if (dashboard.profit.expenses > dashboard.revenue * 0.5) {
    alerts.push({
      level: "warning",
      title: "Materials over budget",
      detail: "Expenses are consuming a large share of revenue. Check materials, subcontractor, and labor costs.",
    });
  }
  if (dashboard.operations.jobsEndingThisWeek > dashboard.operations.jobsStartingThisWeek + 2) {
    alerts.push({
      level: "info",
      title: "Jobs behind schedule",
      detail: "More jobs are ending than starting this week. Review production pacing and staffing.",
    });
  }
  return alerts;
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Icon className="h-8 w-8 text-brand-500" />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {metrics.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Progress</span>
        <span>{normalized.toFixed(0)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full bg-brand-500" style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: { level: "info" | "warning" | "danger"; title: string; detail: string } }) {
  const styles =
    alert.level === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : alert.level === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-900";

  return (
    <div className={`rounded-xl border p-4 ${styles}`}>
      <div className="text-sm font-semibold">{alert.title}</div>
      <div className="mt-1 text-sm leading-6">{alert.detail}</div>
    </div>
  );
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US");
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function healthBadgeClass(status: string) {
  if (status === "Healthy") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "Watch") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-rose-100 text-rose-800 border-rose-200";
}

function SkeletonCard() {
  return <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />;
}
