"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarRange,
  CircleAlert,
  DollarSign,
  FileText,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

type TrendMetric = {
  label: string;
  value: number | null;
  type: "count" | "currency" | "percent";
};

export default function DashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [comparePreviousMonth, setComparePreviousMonth] = useState(true);
  const [compareSameMonthLastYear, setCompareSameMonthLastYear] = useState(true);

  const { data, isLoading } = api.reports.dashboard.useQuery({
    month,
    year,
    comparePreviousMonth,
    compareSameMonthLastYear,
  });
  const report = data as any;

  const survival = report?.survival ?? {};
  const production = report?.production ?? {};
  const pipeline = report?.pipeline ?? {};
  const cash = report?.cash ?? {};
  const expenses = report?.expenses ?? {};
  const alerts = report?.alerts ?? [];
  const trends = report?.trends ?? {};
  const selectedTrend = trends.selected;
  const previousTrend = trends.previousMonth;
  const lastYearTrend = trends.sameMonthLastYear;

  const overallStatus = survival.status || "Behind";
  const overallStatusClass =
    overallStatus === "Safe"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : overallStatus === "At Risk"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-rose-100 text-rose-800 border-rose-200";

  const survivalProgress = Math.min(100, Number(survival.progressPercent ?? 0));
  const productionProgress = Math.min(100, Number(production.progressPercent ?? 0));
  const comparisonRows = buildComparisonRows(selectedTrend, previousTrend);
  const yearComparisonRows = buildComparisonRows(selectedTrend, lastYearTrend);
  const yearOptions = [year, year - 1, year - 2, year - 3, year - 4].filter((option, index, values) => values.indexOf(option) === index);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Answers whether the business is on track to survive and hit the monthly goal."
      />

      {isLoading ? (
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
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Business survival dashboard</div>
                <h2 className="mt-2 text-2xl font-semibold">Are we on track?</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Minimum survival target: {formatCurrency(40_000)}. Monthly production goal: {formatCurrency(65_000)}. Typical close rate: 35% to 50%.
                </p>
              </div>
              <div className={`rounded-full border px-4 py-2 text-sm font-semibold ${overallStatusClass}`}>
                Survival status: {overallStatus}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="1. Survival Progress"
              icon={ShieldCheck}
              subtitle="Completed revenue this month versus the $40,000 minimum survival target."
            >
              <MetricGrid
                metrics={[
                  { label: "Completed revenue this month", value: formatCurrency(survival.completedRevenueThisMonth ?? 0) },
                  { label: "Progress toward survival target", value: `${survivalProgress.toFixed(0)}%` },
                  { label: "Amount still needed", value: formatCurrency(survival.remaining ?? 0) },
                  { label: "Status", value: overallStatus },
                ]}
              />
              <ProgressBar value={survivalProgress} tone={overallStatus} />
            </SectionCard>

            <SectionCard
              title="2. Monthly Production Goal"
              icon={TrendingUp}
              subtitle="Completed work plus scheduled work projected against the $65,000 monthly production goal."
            >
              <MetricGrid
                metrics={[
                  { label: "Completed revenue this month", value: formatCurrency(production.completedRevenueThisMonth ?? 0) },
                  { label: "Scheduled revenue this month", value: formatCurrency(production.scheduledRevenueThisMonth ?? 0) },
                  { label: "Total projected production", value: formatCurrency(production.totalProjectedProduction ?? 0) },
                  { label: "Progress toward goal", value: `${productionProgress.toFixed(0)}%` },
                ]}
              />
              <ProgressBar value={productionProgress} tone={productionProgress >= 100 ? "Safe" : productionProgress >= 75 ? "At Risk" : "Behind"} />
            </SectionCard>

            <SectionCard
              title="3. Proposal Pipeline"
              icon={FileText}
              subtitle="Pipeline volume required to support production goals at common close rates."
            >
              <MetricGrid
                metrics={[
                  { label: "Proposals sent this month", value: pipeline.proposalsSentThisMonth ?? 0 },
                  { label: "Total proposal value", value: formatCurrency(pipeline.totalProposalValue ?? 0) },
                  { label: "Expected sold value at 35%", value: formatCurrency(pipeline.expectedSoldAt35 ?? 0) },
                  { label: "Expected sold value at 50%", value: formatCurrency(pipeline.expectedSoldAt50 ?? 0) },
                  { label: "Required proposal value at 35%", value: formatCurrency(pipeline.requiredProposalValueAt35 ?? 0) },
                  { label: "Required proposal value at 50%", value: formatCurrency(pipeline.requiredProposalValueAt50 ?? 0) },
                ]}
              />
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                If close rate is closer to 35%, the pipeline needs to be much larger to hit the production goal.
              </div>
            </SectionCard>

            <SectionCard
              title="4. Cash / Collections"
              icon={Wallet}
              subtitle="Cash collected this month plus current receivables needing attention."
            >
              <MetricGrid
                metrics={[
                  { label: "Paid invoices this month", value: cash.paidInvoicesThisMonth ?? 0 },
                  { label: "Open invoices", value: cash.openInvoices ?? 0 },
                  { label: "Overdue invoices", value: cash.overdueInvoices ?? 0 },
                  { label: "Amount collected this month", value: formatCurrency(cash.amountCollectedThisMonth ?? 0) },
                ]}
              />
            </SectionCard>

            <SectionCard
              title="5. Expenses / Payroll"
              icon={Receipt}
              subtitle="Monthly spending and the current pay-period payroll estimate."
            >
              <MetricGrid
                metrics={[
                  { label: "Expenses this month", value: formatCurrency(expenses.expensesThisMonth ?? 0) },
                  { label: "Payroll estimate for current pay period", value: formatCurrency(expenses.payrollEstimateCurrentPayPeriod ?? 0) },
                  { label: "Projected net after expenses/payroll", value: formatCurrency(expenses.projectedNetAfterExpensesPayroll ?? 0) },
                  { label: "Active jobs", value: report?.activeJobs ?? 0 },
                ]}
              />
            </SectionCard>

            <SectionCard title="6. Alerts" icon={CircleAlert} subtitle="Practical warnings to act on now.">
              {alerts.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  No immediate warnings. The business is not showing any obvious collection, production, or payroll pressure right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert: any, index: number) => (
                    <AlertRow key={`${alert.title}-${index}`} alert={alert} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <MiniStat icon={DollarSign} label="Survival target" value={formatCurrency(40_000)} />
            <MiniStat icon={Workflow} label="Production goal" value={formatCurrency(65_000)} />
            <MiniStat icon={AlertTriangle} label="Typical close rate" value="35% - 50%" />
          </div>

          <SectionCard
            title="7. Trends / Comparison"
            icon={CalendarRange}
            subtitle="Simple month-over-month and year-over-year checks with lead quality by source."
          >
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Filters</div>
                <div className="mt-3 space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Month</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={month}
                      onChange={(event) => setMonth(Number(event.target.value))}
                    >
                      {MONTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Year</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={year}
                      onChange={(event) => setYear(Number(event.target.value))}
                    >
                      {yearOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                      checked={comparePreviousMonth}
                      onChange={(event) => setComparePreviousMonth(event.target.checked)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">Compare to previous month</span>
                      <span className="block text-xs text-slate-500">Shows month-over-month deltas for the selected period.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                      checked={compareSameMonthLastYear}
                      onChange={(event) => setCompareSameMonthLastYear(event.target.checked)}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">Compare to same month last year</span>
                      <span className="block text-xs text-slate-500">Only shown if there is data for that period.</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                <ComparisonCard
                  title={`This month vs ${previousTrend ? previousTrend.label : "last month"}`}
                  currentLabel={selectedTrend?.label ?? formatMonthLabel(year, month)}
                  compareLabel={previousTrend?.label ?? "No previous month data"}
                  rows={comparisonRows}
                  emptyMessage={comparePreviousMonth ? (previousTrend ? null : "No previous month data is available yet.") : "Previous month comparison is turned off."}
                />

                <ComparisonCard
                  title={`This month vs ${lastYearTrend ? lastYearTrend.label : "same month last year"}`}
                  currentLabel={selectedTrend?.label ?? formatMonthLabel(year, month)}
                  compareLabel={lastYearTrend?.label ?? "No data last year"}
                  rows={yearComparisonRows}
                  emptyMessage={compareSameMonthLastYear ? (lastYearTrend ? null : "No same-month-last-year data is available yet.") : "Same-month-last-year comparison is turned off."}
                />

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Lead quality by source</div>
                      <p className="mt-1 text-sm text-slate-500">
                        Source-level lead quality for {selectedTrend?.label ?? formatMonthLabel(year, month)}.
                      </p>
                    </div>
                    <FileText className="h-5 w-5 text-brand-500" />
                  </div>

                  {selectedTrend?.hasData ? (
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Source</th>
                            <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Leads</th>
                            <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Proposals</th>
                            <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Won</th>
                            <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Close rate</th>
                            <th className="border-b border-slate-200 pb-2 font-semibold">Average job value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTrend.leadQualityBySource.map((row: any) => (
                            <tr key={row.source} className="align-top">
                              <td className="border-b border-slate-100 py-3 pr-4 font-medium text-slate-900">{row.source}</td>
                              <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.leads)}</td>
                              <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.proposals)}</td>
                              <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.won)}</td>
                              <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatPercent(row.closeRate)}</td>
                              <td className="border-b border-slate-100 py-3 text-slate-700">{formatNullableCurrency(row.averageJobValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      No lead or proposal activity was recorded for this month yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </>
  );
}

function buildComparisonRows(current: any, compare: any): TrendMetric[] {
  return [
    { label: "New leads", value: current ? Number(current.newLeads ?? 0) - Number(compare?.newLeads ?? 0) : null, type: "count" },
    { label: "Estimates created", value: current ? Number(current.estimatesCreated ?? 0) - Number(compare?.estimatesCreated ?? 0) : null, type: "count" },
    { label: "Proposals sent", value: current ? Number(current.proposalsSent ?? 0) - Number(compare?.proposalsSent ?? 0) : null, type: "count" },
    { label: "Proposals won", value: current ? Number(current.proposalsWon ?? 0) - Number(compare?.proposalsWon ?? 0) : null, type: "count" },
    { label: "Proposals lost", value: current ? Number(current.proposalsLost ?? 0) - Number(compare?.proposalsLost ?? 0) : null, type: "count" },
    { label: "Total proposal value", value: current ? Number(current.totalProposalValue ?? 0) - Number(compare?.totalProposalValue ?? 0) : null, type: "currency" },
    { label: "Average proposal value", value: current ? Number(current.averageProposalValue ?? 0) - Number(compare?.averageProposalValue ?? 0) : null, type: "currency" },
    { label: "Close rate %", value: current ? Number(current.closeRate ?? 0) - Number(compare?.closeRate ?? 0) : null, type: "percent" },
  ];
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US");
}

function formatNullableCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return formatCurrency(Number(value));
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatTrendDelta(metric: TrendMetric) {
  if (metric.value === null || metric.value === undefined || !Number.isFinite(metric.value)) return "—";
  if (metric.type === "percent") {
    const points = metric.value * 100;
    return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pp`;
  }
  if (metric.type === "currency") {
    return `${metric.value >= 0 ? "+" : ""}${formatCurrency(Math.abs(metric.value))}`;
  }
  const value = metric.value.toLocaleString("en-US");
  return `${metric.value >= 0 ? "+" : ""}${value}`;
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
  children: ReactNode;
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

function ComparisonCard({
  title,
  currentLabel,
  compareLabel,
  rows,
  emptyMessage,
}: {
  title: string;
  currentLabel: string;
  compareLabel: string;
  rows: TrendMetric[];
  emptyMessage: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{currentLabel}</span> compared with <span className="font-medium text-slate-700">{compareLabel}</span>.
          </p>
        </div>
        <Workflow className="h-5 w-5 text-brand-500" />
      </div>

      {emptyMessage ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Metric</th>
                <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="border-b border-slate-100 py-3 pr-4 font-medium text-slate-900">{row.label}</td>
                  <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatTrendDelta(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: string | number }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value, tone }: { value: number; tone: string }) {
  const normalized = Math.max(0, Math.min(100, value));
  const barClass =
    tone === "Safe"
      ? "bg-emerald-500"
      : tone === "At Risk"
        ? "bg-amber-500"
        : tone === "Behind"
          ? "bg-rose-500"
          : "bg-brand-500";

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Progress</span>
        <span>{normalized.toFixed(0)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${normalized}%` }} />
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

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-brand-500" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />;
}
