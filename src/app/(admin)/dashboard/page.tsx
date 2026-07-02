"use client";

import type { ReactNode } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import {
  AlertTriangle,
  CircleAlert,
  DollarSign,
  FileText,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";

export default function DashboardPage() {
  const { data, isLoading } = api.reports.dashboard.useQuery();
  const report = data as any;

  const survival = report?.survival ?? {};
  const production = report?.production ?? {};
  const pipeline = report?.pipeline ?? {};
  const cash = report?.cash ?? {};
  const expenses = report?.expenses ?? {};
  const alerts = report?.alerts ?? [];

  const overallStatus = survival.status || "Behind";
  const overallStatusClass =
    overallStatus === "Safe"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : overallStatus === "At Risk"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-rose-100 text-rose-800 border-rose-200";

  const survivalProgress = Math.min(100, Number(survival.progressPercent ?? 0));
  const productionProgress = Math.min(100, Number(production.progressPercent ?? 0));

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
        </div>
      )}
    </>
  );
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
