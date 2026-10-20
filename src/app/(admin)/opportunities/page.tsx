"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OpportunityEditor, type OpportunityCardData } from "@/components/OpportunityEditor";
import { formatCurrency } from "@/lib/utils";
import { opportunityStageLabel, isTerminalStage } from "@/lib/pipeline-sync";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/pipeline-stages";
import { LEAD_SOURCE_OPTIONS, normalizeLeadSourceForReport } from "@/lib/lead-source";
import { formatOpportunityDate, latestOpportunityProposal, opportunityDateInput, opportunityLeadDate, opportunityValues } from "@/lib/opportunity-values";
import { todayDateInputValueInMassachusetts } from "@/lib/employee-rate-resolver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";

export default function OpportunitiesPage() {
  const utils = api.useUtils();
  const query = api.opportunities.list.useQuery();
  const [editor, setEditor] = useState<OpportunityCardData | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OpportunityCardData | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [service, setService] = useState("");
  const [stage, setStage] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [openedFromUrl, setOpenedFromUrl] = useState(false);
  useEffect(() => {
    if (!query.data || openedFromUrl) return;
    const id = Number(new URLSearchParams(window.location.search).get("open"));
    if (id) {
      const opportunity = query.data.find((o) => o.id === id);
      if (opportunity) setEditor(opportunity);
      else toast.error("Opportunity not found.");
    }
    setOpenedFromUrl(true);
  }, [query.data, openedFromUrl]);
  async function refresh() {
    await Promise.all([
      utils.opportunities.invalidate(), utils.proposals.invalidate(), utils.jobs.invalidate(),
      utils.customers.invalidate(), utils.business.invalidate(), utils.reports.invalidate(),
    ]);
  }
  const archive = api.opportunities.setArchived.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = api.opportunities.remove.useMutation({ onSuccess: async () => { await refresh(); setDeleteTarget(null); toast.success("Opportunity deleted"); }, onError: (e) => toast.error(e.message) });
  const today = todayDateInputValueInMassachusetts();
  const filtered = (query.data ?? []).filter((o) => {
    const leadDate = opportunityDateInput(opportunityLeadDate(o));
    const due = opportunityDateInput(o.followUpAt);
    return (showArchived || !o.archivedAt) &&
      (!search || `${o.name} ${o.customer.name} ${o.notes ?? ""}`.toLowerCase().includes(search.toLowerCase())) &&
      (!source || normalizeLeadSourceForReport(o.source ?? o.customer.leadSource ?? o.customer.source) === source) &&
      (!service || o.serviceType === service) && (!stage || o.stage === stage) &&
      (!from || leadDate >= from) && (!to || leadDate <= to) &&
      (!followUp || (!isTerminalStage(o.stage) && o.status === "open" && !!due && (followUp === "overdue" ? due < today : due <= today)));
  });
  const sources = Array.from(new Set([...LEAD_SOURCE_OPTIONS, ...(query.data ?? []).map((o) => normalizeLeadSourceForReport(o.source ?? o.customer.leadSource ?? o.customer.source))]));
  const services = Array.from(new Set((query.data ?? []).map((o) => o.serviceType).filter((s): s is string => !!s)));
  function card(o: OpportunityCardData) {
    const values = opportunityValues(o);
    const proposal = latestOpportunityProposal(o.proposals);
    const safeToDelete = !o.archivedAt && !o.outcomeAt && !o.job && !o.proposals.length && !o._count.stageHistory && !o._count.automationRuns;
    return <article key={o.id} className="card mb-2 p-3 text-sm">
      <div className="font-semibold">{o.name} {o.archivedAt && <span className="text-slate-500">(Archived)</span>}</div>
      <Link href={`/customers/${o.customerId}`} className="text-brand-700">{o.customer.name}</Link>
      <div className="mt-2 font-medium">Lead received: {formatOpportunityDate(opportunityLeadDate(o))}</div>
      <div className="text-xs text-slate-500">Stage changed: {formatOpportunityDate(o.lastStageChangedAt)}</div>
      {o.followUpAt && <div className="text-xs">Follow-up: {formatOpportunityDate(o.followUpAt)}</div>}
      {isTerminalStage(o.stage) && <div className="text-xs">Outcome: {formatOpportunityDate(o.outcomeAt)} {o.outcomeReason}</div>}
      <dl className="my-2 text-xs">
        <div>Initial Estimated Value: {formatCurrency(values.initial)}</div>
        <div>Latest Proposal Value: {proposal ? formatCurrency(values.quoted) : "Not linked"}</div>
        <div>Job Contract Value: {o.job ? formatCurrency(values.won) : "Not linked"}</div>
      </dl>
      {proposal && <div className="text-xs">Current Proposal: {proposal.proposalNumber} <Link className="text-brand-700" href={`/proposals/${proposal.id}`}>Open Proposal</Link> ({o.proposals.length} revision(s))</div>}
      {o.job && <div className="text-xs"><Link className="text-brand-700" href={`/jobs/${o.job.id}`}>Open Job: {o.job.name}</Link></div>}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <button className="text-brand-700" onClick={() => setEditor(o)}>Edit</button>
        <Link className="text-brand-700" href={`/opportunities?open=${o.id}`} onClick={(e) => { e.preventDefault(); setEditor(o); }}>Open</Link>
        <button disabled={archive.isPending} onClick={() => archive.mutate({ id: o.id, archived: !o.archivedAt })}>{o.archivedAt ? "Restore / Unarchive" : "Archive"}</button>
        {safeToDelete && <button className="text-red-600" onClick={() => setDeleteTarget(o)}>Delete</button>}
      </div>
    </article>;
  }
  function columns(terminal: boolean) {
    const options = [...PIPELINE_STAGE_OPTIONS, { value: "no_reply", label: "No Reply (legacy)" }].filter((s) => isTerminalStage(s.value) === terminal);
    return <div className="flex gap-3 overflow-x-auto pb-4">{options.map((s) => {
      const items = filtered.filter((o) => o.stage === s.value);
      return <section key={s.value} className="w-72 min-w-72 rounded-lg bg-slate-100 p-3">
        <h3 className="mb-2 text-sm font-semibold">{s.label} ({items.length})</h3>
        <div className="mb-2 text-xs">Expected: {formatCurrency(items.reduce((sum, o) => sum + opportunityValues(o).expected, 0))}</div>
        <div className="max-h-[65vh] min-h-32 overflow-y-auto pr-1">{items.map(card)}</div>
      </section>;
    })}</div>;
  }
  return <>
    <PageHeader title="Opportunities" description="Lead dates and historical outcomes in America/New_York" actions={<button className="btn btn-primary" onClick={() => setEditor("new")}>New Opportunity</button>} />
    <div className="card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
      <label>Search<input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Project or customer" /></label>
      <label>Lead Source<select className="input" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Service<select className="input" value={service} onChange={(e) => setService(e.target.value)}><option value="">All services</option>{services.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Stage<select className="input" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All stages</option>{PIPELINE_STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}<option value="no_reply">No Reply (legacy)</option></select></label>
      <label>Lead Received From<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>Lead Received Through<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label>Follow-up<select className="input" value={followUp} onChange={(e) => setFollowUp(e.target.value)}><option value="">All</option><option value="due">Due today or overdue</option><option value="overdue">Overdue</option></select></label>
      <div className="flex flex-col justify-center gap-2"><label><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show Archived</label><button className="btn btn-secondary" onClick={() => setView(view === "kanban" ? "table" : "kanban")}>{view === "kanban" ? "Table view" : "Kanban view"}</button></div>
    </div>
    {query.error && <p role="alert" className="text-red-600">{query.error.message}</p>}
    {query.isLoading ? <p>Loading...</p> : view === "table" ? <div className="max-h-[75vh] overflow-auto"><table className="w-full"><thead><tr><th>Opportunity</th><th>Stage</th></tr></thead><tbody>{filtered.map((o) => <tr key={o.id}><td>{card(o)}</td><td>{opportunityStageLabel(o.stage)}</td></tr>)}</tbody></table></div> : <>
      {columns(false)}
      <details className="mt-4" key={stage} open={stage && isTerminalStage(stage) ? true : undefined}><summary className="mb-3 cursor-pointer font-semibold">Closed / Terminal ({filtered.filter((o) => isTerminalStage(o.stage)).length})</summary>{columns(true)}</details>
    </>}
    {editor && <OpportunityEditor opportunity={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} onSaved={refresh} />}
    <ConfirmDialog open={!!deleteTarget} title="Delete disposable Opportunity" message="Only a record with no links or lifecycle history can be deleted. Archive historical records instead." confirmLabel="Delete" destructive isPending={remove.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove.mutate({ id: deleteTarget.id })} />
  </>;
}
