"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { opportunityStageLabel } from "@/lib/pipeline-sync";
import { PIPELINE_STAGE_OPTIONS, TERMINAL_PIPELINE_STAGES } from "@/lib/pipeline-stages";
import { LEAD_SOURCE_OPTIONS, isReferralSource, leadSourceOptionsWithLegacy } from "@/lib/lead-source";
import { startOfBusinessDayInMassachusetts, todayDateInputValueInMassachusetts } from "@/lib/employee-rate-resolver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const SALES_STAGES = [
  "new_lead", "onboarding", "not_answered", "follow_up",
  "estimate_sent", "approval", "service_delivery", "review",
] as const;

export default function OpportunitiesPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.opportunities.list.useQuery();
  const setStage = api.opportunities.setStage.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.opportunities.list.invalidate(),
        utils.proposals.list.invalidate(),
        utils.jobs.list.invalidate(),
        utils.customers.list.invalidate(),
        utils.business.analytics.invalidate(),
        utils.reports.dashboard.invalidate(),
      ]);
      toast.success("Stage updated");
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; customerName: string } | null>(null);
  const emptyForm = () => ({
    customerId: 0,
    name: "",
    stage: "new_lead" as string,
    leadValue: "",
    leadSource: "",
    referralSource: "",
    notes: "",
    leadReceivedAt: todayDateInputValueInMassachusetts(),
  });
  const [form, setForm] = useState(emptyForm);
  const customers = api.customers.list.useQuery(
    { search: customerSearch.trim() || undefined },
    { enabled: createOpen }
  );

  const create = api.opportunities.create.useMutation({
    onSuccess: () => {
      toast.success("Opportunity created");
      utils.opportunities.list.invalidate();
      utils.customers.list.invalidate();
      utils.business.analytics.invalidate();
      utils.reports.dashboard.invalidate();
      setCreateOpen(false);
      setForm(emptyForm());
      setCustomerSearch("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeOpportunity = api.opportunities.remove.useMutation({
    onSuccess: () => {
      toast.success("Opportunity deleted");
      utils.opportunities.list.invalidate();
      utils.customers.list.invalidate();
      utils.business.analytics.invalidate();
      utils.reports.dashboard.invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function submitCreate() {
    if (!form.customerId) return toast.error("Select a customer first.");
    if (!form.name.trim()) return toast.error("Enter an opportunity name.");
    create.mutate({
      customerId: form.customerId,
      name: form.name.trim(),
      stage: form.stage as never,
      leadValue: form.leadValue ? Number(form.leadValue) : undefined,
      source: form.leadSource || undefined,
      referralSource: isReferralSource(form.leadSource) ? form.referralSource.trim() || undefined : undefined,
      notes: form.notes.trim() || undefined,
      leadReceivedAt: form.leadReceivedAt ? startOfBusinessDayInMassachusetts(form.leadReceivedAt) : undefined,
    });
  }

  const grouped = SALES_STAGES.map((stage) => ({
    stage,
    items: (data ?? []).filter((o) => o.pipeline === "sales" && o.stage === stage),
  }));
  const terminalGrouped = TERMINAL_PIPELINE_STAGES.map((stage) => ({
    stage,
    items: (data ?? []).filter((o) => o.pipeline === "sales" && o.stage === stage),
  }));

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Sales pipeline"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Opportunity
          </button>
        }
      />
      {isLoading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {grouped.map((col) => (
              <StageColumn key={col.stage} stage={col.stage} items={col.items} onStage={(id, stage, pipeline) => setStage.mutate({ id, pipeline, stage: stage as any })} onDelete={(o) => setDeleteTarget({ id: o.id, name: o.name, customerName: o.customer?.name ?? "" })} />
            ))}
          </div>
          <h2 className="mt-6 text-sm font-semibold text-slate-700">Closed / Terminal</h2>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
            {terminalGrouped.map((col) => (
              <StageColumn key={col.stage} stage={col.stage} items={col.items} onStage={(id, stage, pipeline) => setStage.mutate({ id, pipeline, stage: stage as any })} onDelete={(o) => setDeleteTarget({ id: o.id, name: o.name, customerName: o.customer?.name ?? "" })} />
            ))}
          </div>
        </>
      )}

      {createOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-6 pb-3 border-b border-slate-200">
              <div className="text-lg font-semibold">New Opportunity</div>
            </div>
            <div className="grid grid-cols-2 gap-3 overflow-y-auto px-6 py-4 flex-1">
              <div className="col-span-2 relative">
                <label className="label">Customer</label>
                <input
                  className="input"
                  value={customerSearch}
                  onFocus={() => setShowCustomerResults(true)}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerResults(true);
                    setForm((f) => ({ ...f, customerId: 0 }));
                  }}
                  placeholder="Search customer by name"
                />
                {showCustomerResults && customerSearch.trim().length > 0 && (
                  <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                    {(customers.data ?? []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        onClick={() => {
                          setForm((f) => ({ ...f, customerId: c.id }));
                          setCustomerSearch(c.name);
                          setShowCustomerResults(false);
                        }}
                      >
                        <div className="text-sm font-medium text-slate-900">{c.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <label className="label">Opportunity / Project Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Lead Received Date</label>
                <input type="date" className="input" value={form.leadReceivedAt} onChange={(e) => setForm((f) => ({ ...f, leadReceivedAt: e.target.value }))} />
              </div>
              <div>
                <label className="label">Lead Source</label>
                <select className="input" value={form.leadSource} onChange={(e) => setForm((f) => ({ ...f, leadSource: e.target.value }))}>
                  <option value="">Select a source</option>
                  {leadSourceOptionsWithLegacy(form.leadSource).map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {isReferralSource(form.leadSource) && (
                <div className="col-span-2">
                  <label className="label">Referral Name</label>
                  <input className="input" value={form.referralSource} onChange={(e) => setForm((f) => ({ ...f, referralSource: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="label">Initial Pipeline Stage</label>
                <select className="input" value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}>
                  {PIPELINE_STAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Estimated Value</label>
                <input type="number" min="0" step="0.01" className="input" value={form.leadValue} onChange={(e) => setForm((f) => ({ ...f, leadValue: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <textarea className="input min-h-20" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={create.isPending || !form.customerId || !form.name.trim()} onClick={submitCreate}>
                {create.isPending ? "Creating…" : "Create Opportunity"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Opportunity"
        destructive
        confirmLabel="Delete Opportunity"
        isPending={removeOpportunity.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && removeOpportunity.mutate({ id: deleteTarget.id })}
        message={deleteTarget ? `Delete opportunity "${deleteTarget.name}" for ${deleteTarget.customerName}? Only empty opportunities without linked proposals, jobs, or automation history can be deleted.` : ""}
      />
    </>
  );
}

function StageColumn({
  stage,
  items,
  onStage,
  onDelete,
}: {
  stage: string;
  items: any[];
  onStage: (id: number, stage: string, pipeline: "sales" | "not_interested") => void;
  onDelete: (opportunity: any) => void;
}) {
  return (
    <div className="bg-slate-100 rounded-lg p-3 min-h-[200px]">
      <div className="text-xs uppercase font-semibold text-slate-600 mb-2">
        {opportunityStageLabel(stage)}
      </div>
      {items.map((o) => (
        <div key={o.id} className="card p-3 mb-2 text-sm">
          <div className="font-medium">{o.name}</div>
          <div className="text-xs text-slate-500">
            <Link href={`/customers/${o.customerId}`} className="text-brand-700 hover:underline">{o.customer.name}</Link>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {o.leadValue ? formatCurrency(Number(o.leadValue)) : ""} · {formatDate(o.createdAt)}
          </div>
          {o.proposals?.[0] ? (
            <div className="text-xs text-slate-500 mt-1">
              Proposal <Link href={`/proposals/${o.proposals[0].id}`} className="text-brand-700 hover:underline">{o.proposals[0].proposalNumber}</Link> · {o.proposals[0].status}
            </div>
          ) : null}
          {o.job ? (
            <div className="text-xs text-slate-500 mt-1">
              Job: <Link href={`/jobs/${o.job.id}`} className="text-brand-700 hover:underline">{o.job.name}</Link>
            </div>
          ) : null}
          <select
            className="input mt-2 text-xs"
            value={o.stage}
            onChange={(e) => onStage(o.id, e.target.value, o.pipeline)}
          >
            {PIPELINE_STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="mt-1 text-xs text-rose-600 hover:underline"
            onClick={() => onDelete(o)}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
