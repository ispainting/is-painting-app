"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";

export default function ReportsPage() {
  const { data } = api.reports.dashboard.useQuery();
  return (
    <>
      <PageHeader title="Reports" description="Business KPIs at a glance" />
      <div className="card p-5">
        <div className="text-sm font-medium mb-3">Snapshot</div>
        <ul className="text-sm space-y-1">
          <li>Active jobs: <strong>{data?.activeJobs ?? 0}</strong></li>
          <li>Open invoices: <strong>{data?.openInvoices ?? 0}</strong></li>
          <li>Pending expenses: <strong>{data?.pendingExpenses ?? 0}</strong></li>
          <li>Open opportunities: <strong>{data?.openOpps ?? 0}</strong></li>
          <li>Active employees: <strong>{data?.employees ?? 0}</strong></li>
          <li>Total revenue: <strong>{formatCurrency(data?.totalRevenue ?? 0)}</strong></li>
        </ul>
      </div>
    </>
  );
}
