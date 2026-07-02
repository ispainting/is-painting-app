"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";

export default function ReportsPage() {
  const { data } = api.reports.dashboard.useQuery();
  return (
    <>
      <PageHeader title="Reports" description="Business KPIs at a glance" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard
          title="Survival"
          rows={[
            ["Completed revenue this month", formatCurrency(data?.survival.completedRevenueThisMonth ?? 0)],
            ["Target", formatCurrency(data?.survival.target ?? 0)],
            ["Status", data?.survival.status ?? "Behind"],
          ]}
        />
        <SummaryCard
          title="Production"
          rows={[
            ["Completed revenue", formatCurrency(data?.production.completedRevenueThisMonth ?? 0)],
            ["Scheduled revenue", formatCurrency(data?.production.scheduledRevenueThisMonth ?? 0)],
            ["Projected production", formatCurrency(data?.production.totalProjectedProduction ?? 0)],
          ]}
        />
        <SummaryCard
          title="Pipeline"
          rows={[
            ["Proposals sent this month", String(data?.pipeline.proposalsSentThisMonth ?? 0)],
            ["Total proposal value", formatCurrency(data?.pipeline.totalProposalValue ?? 0)],
            ["Expected sold at 35%", formatCurrency(data?.pipeline.expectedSoldAt35 ?? 0)],
          ]}
        />
        <SummaryCard
          title="Collections"
          rows={[
            ["Paid invoices this month", String(data?.cash.paidInvoicesThisMonth ?? 0)],
            ["Open invoices", String(data?.cash.openInvoices ?? 0)],
            ["Amount collected", formatCurrency(data?.cash.amountCollectedThisMonth ?? 0)],
          ]}
        />
      </div>
    </>
  );
}

function SummaryCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="card p-5">
      <div className="text-sm font-semibold mb-3">{title}</div>
      <ul className="text-sm space-y-1">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <span className="text-slate-500">{label}</span>
            <strong className="text-slate-900">{value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
