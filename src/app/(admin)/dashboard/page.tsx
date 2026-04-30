"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import { Briefcase, FileText, Receipt, Users, DollarSign, Workflow } from "lucide-react";

export default function DashboardPage() {
  const { data, isLoading } = api.reports.dashboard.useQuery();
  return (
    <>
      <PageHeader title="Dashboard" description="Snapshot of the business" />
      {isLoading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat icon={Briefcase} label="Active jobs" value={data?.activeJobs ?? 0} />
          <Stat icon={Workflow} label="Open opportunities" value={data?.openOpps ?? 0} />
          <Stat icon={FileText} label="Open invoices" value={data?.openInvoices ?? 0} />
          <Stat icon={Receipt} label="Pending expenses" value={data?.pendingExpenses ?? 0} />
          <Stat icon={Users} label="Team members" value={data?.employees ?? 0} />
          <Stat
            icon={DollarSign}
            label="Total revenue"
            value={formatCurrency(data?.totalRevenue ?? 0)}
          />
        </div>
      )}
    </>
  );
}

function Stat({
  icon: Icon, label, value,
}: { icon: any; label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <Icon className="w-8 h-8 text-brand-500" />
      </div>
    </div>
  );
}
