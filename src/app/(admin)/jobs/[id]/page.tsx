"use client";

import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

const STATUSES = ["estimate", "sent", "approved", "active", "completed", "on_hold", "cancelled"] as const;

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const utils = api.useUtils();
  const { data: job, isLoading } = api.jobs.byId.useQuery({ id });
  const setStatus = api.jobs.setStatus.useMutation({
    onSuccess: () => {
      utils.jobs.byId.invalidate({ id });
      toast.success("Status updated");
    },
  });

  if (isLoading || !job) return <div className="text-slate-500">Loading…</div>;

  return (
    <>
      <PageHeader
        title={job.name}
        description={`${job.estimateNumber} · ${job.customer.name}`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" type="button" disabled>
              Edit Job
            </button>
            <select
              className="input w-auto"
              value={job.status}
              onChange={(e) => setStatus.mutate({ id, status: e.target.value as any })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <h2 className="text-base font-semibold">Overview</h2>
          <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
            <Stat label="Materials budget" value={formatCurrency(Number(job.materialsBudget))} />
            <Stat label="Labor budget" value={formatCurrency(Number(job.laborBudget))} />
            <Stat label="Subtotal (after burden)" value={formatCurrency(Number(job.subtotalBeforeMarkup))} />
            <Stat label="Total estimate" value={formatCurrency(Number(job.totalEstimate))} />
            <Stat label="Contract" value={formatCurrency(Number(job.contractAmount))} />
            <Stat label="Approved" value={job.approvedAt ? formatDateTime(job.approvedAt) : "—"} />
          </div>

          <h2 className="text-base font-semibold mt-8 mb-2">Scope of Work</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.scopeOfWork || "—"}</p>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold mb-2">Assigned Crew</h2>
          {job.assignments.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody assigned yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {job.assignments.map((a) => (
                <li key={a.id}>{a.user.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Recent Time Entries</h2>
          {job.timeEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No time logged.</p>
          ) : (
            <ul className="text-sm divide-y">
              {job.timeEntries.slice(0, 8).map((t) => (
                <li key={t.id} className="py-2 flex justify-between">
                  <span>{t.user.name}</span>
                  <span className="text-slate-500">
                    {t.hoursWorked ? `${Number(t.hoursWorked).toFixed(2)}h` : "in progress"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Invoices</h2>
          {job.invoices.length === 0 ? (
            <p className="text-sm text-slate-500">No invoices yet.</p>
          ) : (
            <ul className="text-sm divide-y">
              {job.invoices.map((i) => (
                <li key={i.id} className="py-2 flex justify-between">
                  <span>{i.invoiceNumber} · {i.title}</span>
                  <span>{formatCurrency(Number(i.total))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-base font-medium mt-0.5">{value}</div>
    </div>
  );
}
