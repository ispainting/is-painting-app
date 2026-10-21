"use client";

import { useState } from "react";
import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/trpc/react";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/pipeline-stages";
import { isReferralSource, leadSourceOptionsWithLegacy, serviceTypeOptionsWithLegacy } from "@/lib/lead-source";
import { formatOpportunityDate, opportunityDateInput, shouldRecordOpportunityStageHistory } from "@/lib/opportunity-values";
import { startOfBusinessDayInMassachusetts, todayDateInputValueInMassachusetts } from "@/lib/employee-rate-resolver";
import { isTerminalStage, opportunityStageLabel } from "@/lib/pipeline-sync";
import { toast } from "sonner";

export type OpportunityCardData = inferRouterOutputs<AppRouter>["opportunities"]["list"][number];

export function OpportunityEditor({ opportunity, onClose, onSaved }: {
  opportunity?: OpportunityCardData;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    customerId: opportunity?.customerId ?? 0,
    name: opportunity?.name ?? "",
    stage: opportunity?.stage ?? "new_lead",
    leadValue: opportunity?.leadValue?.toString() ?? "",
    source: opportunity?.source ?? "",
    serviceType: opportunity?.serviceType ?? "",
    referralSource: opportunity?.referralSource ?? opportunity?.customer.referralSource ?? "",
    leadReceivedAt: opportunityDateInput(opportunity?.leadReceivedAt ?? opportunity?.createdAt) || todayDateInputValueInMassachusetts(),
    effectiveAt: opportunityDateInput(opportunity?.lastStageChangedAt) || todayDateInputValueInMassachusetts(),
    followUpAt: opportunityDateInput(opportunity?.followUpAt),
    outcomeReason: opportunity?.outcomeReason ?? "",
    notes: opportunity?.notes ?? "",
    historyNote: "",
    proposalIds: opportunity?.proposals.map((p) => p.id) ?? [],
    jobId: opportunity?.job?.id ?? null as number | null,
  });
  const [customerSearch, setCustomerSearch] = useState(opportunity?.customer.name ?? "");
  const [customerResultsOpen, setCustomerResultsOpen] = useState(false);
  const [tab, setTab] = useState<"details" | "pipeline" | "links" | "history">("details");
  const customers = api.customers.list.useQuery({ search: customerSearch || undefined });
  const candidates = api.opportunities.linkCandidates.useQuery({ customerId: form.customerId }, { enabled: form.customerId > 0 });
  const history = api.opportunities.byId.useQuery({ id: opportunity?.id ?? 0 }, { enabled: !!opportunity });
  const saved = async () => { await onSaved(); toast.success(opportunity ? "Opportunity updated" : "Opportunity created"); onClose(); };
  const update = api.opportunities.update.useMutation({ onSuccess: saved, onError: (e) => toast.error(e.message) });
  const create = api.opportunities.create.useMutation({ onSuccess: saved, onError: (e) => toast.error(e.message) });
  const date = (value: string) => value ? startOfBusinessDayInMassachusetts(value) : null;
  const patch = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  function submit() {
    if (!form.customerId || !form.name.trim()) return toast.error("Select a customer and enter a project name.");
    if (!form.leadReceivedAt || !form.effectiveAt) return toast.error("Lead Received and stage effective dates are required.");
    const fields = {
      customerId: form.customerId, name: form.name.trim(), stage: form.stage,
      source: form.source || null, serviceType: form.serviceType || null,
      referralSource: isReferralSource(form.source) ? form.referralSource.trim() || null : null,
      leadValue: form.leadValue === "" ? null : Number(form.leadValue),
      leadReceivedAt: date(form.leadReceivedAt), followUpAt: date(form.followUpAt),
      notes: form.notes || null,
    };
    if (opportunity) {
      const changed = shouldRecordOpportunityStageHistory({
        previousStage: opportunity.stage,
        nextStage: form.stage,
        previousReason: opportunity.outcomeReason ?? "",
        nextReason: form.outcomeReason,
        historyNote: form.historyNote,
      });
      update.mutate({ id: opportunity.id, data: {
        ...fields, proposalIds: form.proposalIds, jobId: form.jobId,
        ...(changed ? { effectiveAt: date(form.effectiveAt)!, outcomeReason: form.outcomeReason || null, historyNote: form.historyNote || undefined } : {}),
      } });
    } else {
      create.mutate({
        ...fields, source: fields.source ?? undefined, serviceType: fields.serviceType ?? undefined,
        referralSource: fields.referralSource ?? undefined, leadValue: fields.leadValue ?? undefined,
        notes: fields.notes ?? undefined, leadReceivedAt: fields.leadReceivedAt!,
        effectiveAt: date(form.effectiveAt)!, outcomeReason: form.outcomeReason || undefined,
      });
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={opportunity ? "Edit Opportunity" : "New Opportunity"}>
    <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col">
      <h2 className="border-b p-5 text-lg font-semibold">{opportunity ? "Edit Opportunity" : "New Opportunity"}</h2>
      <div className="grid grid-cols-2 gap-4 overflow-y-auto p-5">
        <nav className="col-span-2 flex gap-2 border-b pb-3" aria-label="Opportunity editor sections">
          {([
            ["details", "Details"],
            ["pipeline", "Pipeline & Dates"],
            ...(opportunity ? [["links", "Links"], ["history", "History"]] as const : []),
          ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} className={`rounded px-3 py-2 text-sm ${tab === value ? "bg-brand-700 text-white" : "bg-slate-100"}`} onClick={() => setTab(value)}>{label}</button>)}
        </nav>
        {tab === "details" && <>
        <div className="col-span-2 relative">
          <label className="label" htmlFor="opportunity-customer">Customer</label>
          <input id="opportunity-customer" role="combobox" aria-autocomplete="list" aria-expanded={customerResultsOpen} aria-controls="opportunity-customer-results" className="input" value={customerSearch}
            onFocus={() => setCustomerResultsOpen(true)}
            onChange={(e) => { setCustomerSearch(e.target.value); setCustomerResultsOpen(true); setForm((f) => ({ ...f, customerId: 0 })); }}
            placeholder="Search by customer name" />
          {customerResultsOpen && customerSearch.trim() && <div id="opportunity-customer-results" role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border bg-white shadow">
            {customers.isLoading ? <p className="p-3 text-sm text-slate-500">Searching customers...</p> :
              customers.error ? <p role="alert" className="p-3 text-sm text-red-600">{customers.error.message}</p> :
                (customers.data ?? []).length ? (customers.data ?? []).map((customer) => <button key={customer.id} type="button" role="option" aria-selected={form.customerId === customer.id} className="block w-full border-b p-3 text-left text-sm hover:bg-slate-50"
                  onClick={() => { setForm((f) => ({ ...f, customerId: customer.id })); setCustomerSearch(customer.name); setCustomerResultsOpen(false); }}>
                  <span className="font-medium">{customer.name}</span>{customer.email && <span className="ml-2 text-slate-500">{customer.email}</span>}
                </button>) : <p className="p-3 text-sm text-slate-500">No customers found. Create the customer first, then select them here.</p>}
          </div>}
          {form.customerId > 0 && <p className="mt-1 text-xs text-emerald-700">Customer selected</p>}
        </div>
        <label className="col-span-2">Opportunity / Project Name<input className="input" value={form.name} onChange={(e) => patch("name", e.target.value)} /></label>
        <label>Service Type<select className="input" value={form.serviceType} onChange={(e) => patch("serviceType", e.target.value)}>
          <option value="">Select service</option>{serviceTypeOptionsWithLegacy(form.serviceType).map((s) => <option key={s}>{s}</option>)}
        </select></label>
        <label>Lead Source<select className="input" value={form.source} onChange={(e) => patch("source", e.target.value)}>
          <option value="">Unknown</option>{leadSourceOptionsWithLegacy(form.source).map((s) => <option key={s}>{s}</option>)}
        </select></label>
        {isReferralSource(form.source) && <label className="col-span-2">Referral Source / Name<input className="input" value={form.referralSource} onChange={(e) => patch("referralSource", e.target.value)} /></label>}
        <label>Lead Received Date<input type="date" className="input" value={form.leadReceivedAt} onChange={(e) => patch("leadReceivedAt", e.target.value)} /></label>
        <label>Initial Estimated Value<input type="number" min="0" step="0.01" className="input" value={form.leadValue} onChange={(e) => patch("leadValue", e.target.value)} /></label>
        </>}
        {tab === "pipeline" && <>
        <label>Current Pipeline Stage<select className="input" value={form.stage} onChange={(e) => {
          const stage = PIPELINE_STAGE_OPTIONS.find((s) => s.value === e.target.value)?.value;
          if (stage) setForm((f) => ({ ...f, stage, effectiveAt: todayDateInputValueInMassachusetts() }));
        }}>{form.stage === "no_reply" && <option value="no_reply">No Reply (legacy)</option>}{PIPELINE_STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <label>Stage / Outcome Effective Date<input type="date" className="input" value={form.effectiveAt} onChange={(e) => patch("effectiveAt", e.target.value)} /></label>
        {isTerminalStage(form.stage) && <label>Outcome Reason<input className="input" list="opportunity-reasons" value={form.outcomeReason} onChange={(e) => patch("outcomeReason", e.target.value)} />
          <datalist id="opportunity-reasons">{["Price", "Hired competitor", "Postponed indefinitely", "No response", "Outside service area", "Scheduling", "Other"].map((r) => <option key={r}>{r}</option>)}</datalist>
        </label>}
        {(form.stage === "follow_up" || form.stage === "on_hold" || !!form.followUpAt) && <label>Follow-up Date<input type="date" className="input" value={form.followUpAt} onChange={(e) => patch("followUpAt", e.target.value)} /></label>}
        <label className="col-span-2">Notes<textarea className="input" value={form.notes} onChange={(e) => patch("notes", e.target.value)} /></label>
        </>}
        {opportunity && tab === "links" && <>
          <div className="col-span-2 rounded bg-slate-50 p-3 text-sm">
            Select only records for the selected customer. Multiple Proposal revisions are supported; linked records are never deleted when unlinked.
          </div>
          <fieldset className="col-span-2 rounded border p-3"><legend>Linked Proposals / Revisions</legend>
            {candidates.error && <p className="text-red-600">{candidates.error.message}</p>}
            {candidates.isLoading && <p className="py-2 text-slate-500">Loading customer Proposals...</p>}
            {!candidates.isLoading && !candidates.error && !candidates.data?.proposals.length && <p className="py-2 text-slate-500">No Proposals exist for this customer. Create one from the Proposals page.</p>}
            {Array.from(new Map([...(opportunity.proposals ?? []), ...(candidates.data?.proposals ?? [])].map((p) => [p.id, p])).values()).map((p, index, items) =>
              <label key={p.id} className="flex items-center gap-2 py-1">
                <input type="checkbox" disabled={!!p.opportunityId && p.opportunityId !== opportunity.id} checked={form.proposalIds.includes(p.id)} onChange={(e) => setForm((f) => ({ ...f, proposalIds: e.target.checked ? [...f.proposalIds, p.id] : f.proposalIds.filter((id) => id !== p.id) }))} />
                {p.proposalNumber} - {p.projectName} ({p.status}) {index === 0 && <span className="text-xs font-semibold text-emerald-700">Latest revision</span>}
                {p.opportunityId && p.opportunityId !== opportunity.id && <span className="text-xs text-slate-500">Linked to another Opportunity</span>}
                <Link href={`/proposals/${p.id}`} className="ml-auto text-brand-700">Open</Link>
              </label>)}
          </fieldset>
          <label className="col-span-2">Linked Job (one per Opportunity)
            <select className="input" value={form.jobId ?? ""} onChange={(e) => setForm((f) => ({ ...f, jobId: Number(e.target.value) || null }))}>
              <option value="">No linked Job / Unlink</option>
              {Array.from(new Map([...(opportunity.job ? [opportunity.job] : []), ...(candidates.data?.jobs ?? [])].map((j) => [j.id, j])).values()).map((j) => <option key={j.id} value={j.id} disabled={!!j.opportunityId && j.opportunityId !== opportunity.id}>{j.estimateNumber} - {j.name}</option>)}
            </select>
            {!candidates.isLoading && !candidates.error && !candidates.data?.jobs.length && !opportunity.job && <p className="mt-1 text-sm text-slate-500">No Jobs exist for this customer.</p>}
            {form.jobId && <Link href={`/jobs/${form.jobId}`} className="mt-2 inline-block text-brand-700">Open linked Job</Link>}
          </label>
        </>}
        {opportunity && tab === "history" && <>
          <label className="col-span-2">History Note for next stage or outcome change<textarea className="input" value={form.historyNote} onChange={(e) => patch("historyNote", e.target.value)} /></label>
          <section className="col-span-2"><h3 className="font-semibold">Stage History (never replaced)</h3>
            {history.error && <p className="text-red-600">{history.error.message}</p>}
            {history.isLoading && <p className="py-2 text-slate-500">Loading history...</p>}
            {!history.isLoading && !history.error && !history.data?.stageHistory.length && <p className="py-2 text-slate-500">No stage history recorded yet.</p>}
            {history.data?.stageHistory.map((h) => <div key={h.id} className="border-b py-2 text-sm">
              {h.previousStage ? opportunityStageLabel(h.previousStage) : "Created"} → {opportunityStageLabel(h.newStage)} · Effective {formatOpportunityDate(h.effectiveAt)}
              <div className="text-slate-500">Recorded {formatOpportunityDate(h.recordedAt)} by {h.changedBy?.name ?? "Workflow"} · {h.reason} {h.note}</div>
            </div>)}
          </section>
        </>}
      </div>
      <div className="flex justify-end gap-2 border-t p-4"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={create.isPending || update.isPending} onClick={submit}>Save Opportunity</button></div>
    </div>
  </div>;
}
