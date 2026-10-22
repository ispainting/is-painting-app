"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OpportunityEditor, type OpportunityCardData } from "@/components/OpportunityEditor";
import { formatCurrency } from "@/lib/utils";
import { opportunityStageLabel, isTerminalStage } from "@/lib/pipeline-sync";
import { PIPELINE_STAGE_OPTIONS } from "@/lib/pipeline-stages";
import { LEAD_SOURCE_OPTIONS, normalizeLeadSourceForReport, SERVICE_TYPE_OPTIONS } from "@/lib/lead-source";
import { formatOpportunityDate, latestOpportunityProposal, opportunityLeadDate, opportunityValues } from "@/lib/opportunity-values";
import { filterOpportunityViews, OPPORTUNITY_BOARD_GROUPS, refreshOpportunityQueries, type OpportunityVisibility } from "@/lib/opportunity-board";
import { todayDateInputValueInMassachusetts } from "@/lib/employee-rate-resolver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { opportunitiesPdf } from "@/lib/pdf-export-data";

export default function OpportunitiesPage() {
  const utils = api.useUtils();
  const [visibility, setVisibility] = useState<OpportunityVisibility>("active");
  const query = api.opportunities.list.useQuery({ visibility });
  const [editor, setEditor] = useState<OpportunityCardData | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OpportunityCardData | null>(null);
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
    await refreshOpportunityQueries({
      opportunities: { invalidate: () => utils.opportunities.list.invalidate() },
      proposals: { invalidate: () => utils.proposals.invalidate() },
      jobs: { invalidate: () => utils.jobs.invalidate() },
      customers: { invalidate: () => utils.customers.invalidate() },
      business: { invalidate: () => utils.business.invalidate() },
      reports: { invalidate: () => utils.reports.invalidate() },
    });
  }
  const archive = api.opportunities.setArchived.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = api.opportunities.remove.useMutation({ onSuccess: async () => { await refresh(); setDeleteTarget(null); toast.success("Opportunity deleted"); }, onError: (e) => toast.error(e.message) });
  const today = todayDateInputValueInMassachusetts();
  const filteredViews = filterOpportunityViews(query.data ?? [], {
    visibility, search, source, service, stage, from, to, followUp, today,
  });
  const filtered = filteredViews[view];
  const sources = Array.from(new Set([...LEAD_SOURCE_OPTIONS, ...filtered.map((o) => normalizeLeadSourceForReport(o.source ?? o.customer.leadSource ?? o.customer.source))]));
  const services = Array.from(new Set([...SERVICE_TYPE_OPTIONS, ...filtered.map((o) => o.serviceType).filter((s): s is string => !!s)]));
  function card(o: OpportunityCardData) {
    const values = opportunityValues(o);
    const proposal = latestOpportunityProposal(o.proposals);
    const safeToDelete = !o.job && !o.proposals.length && !o._count.automationRuns;
    return <article key={o.id} className="card mb-2 p-3 text-sm">
      <div className="font-semibold">{o.name} {o.archivedAt && <span className="text-slate-500">(Archived)</span>}</div>
      <Link href={`/customers/${o.customerId}`} className="text-brand-700">{o.customer.name}</Link>
      <div className="mt-2 font-medium">Lead received: {formatOpportunityDate(opportunityLeadDate(o))}</div>
      <div className="text-xs text-slate-500">Stage changed: {formatOpportunityDate(o.lastStageChangedAt)}</div>
      {o.followUpAt && <div className="text-xs">Follow-up: {formatOpportunityDate(o.followUpAt)}</div>}
      {isTerminalStage(o.stage) && <div className="text-xs">Outcome: {formatOpportunityDate(o.outcomeAt)} {o.outcomeReason}</div>}
      <dl className="my-2 text-xs">
        <div>Initial Estimated Value: {formatCurrency(values.initial)}</div>
        {o.status === "open" && !isTerminalStage(o.stage) && <div>Expected: {formatCurrency(values.expected)}{proposal && values.expected === values.quoted ? " (latest Proposal)" : " (initial estimate)"}</div>}
        <div>Contract: {o.job ? formatCurrency(values.contract) : "Not linked"}</div>
        {(o.stage === "completed" || o.status === "won") && <div>Won: {formatCurrency(values.won)}</div>}
        {o.stage === "lost" && <div>Lost: {formatCurrency(values.lost)}</div>}
      </dl>
      {proposal && <div className="text-xs">Current Proposal: {proposal.proposalNumber} <Link className="text-brand-700" href={`/proposals/${proposal.id}`}>Open Proposal</Link> ({o.proposals.length} revision(s))</div>}
      {o.job && <div className="text-xs"><Link className="text-brand-700" href={`/jobs/${o.job.id}`}>Open Job: {o.job.name}</Link></div>}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <button className="text-brand-700" onClick={() => setEditor(o)}>Edit</button>
        <Link className="text-brand-700" href={`/opportunities?open=${o.id}`} onClick={(e) => { e.preventDefault(); setEditor(o); }}>Open</Link>
        <details className="relative">
          <summary className="cursor-pointer text-slate-700">Actions</summary>
          <div className="absolute right-0 z-10 mt-1 min-w-40 rounded border bg-white p-2 shadow">
            <button className="block w-full p-2 text-left" disabled={archive.isPending} onClick={() => archive.mutate({ id: o.id, archived: !o.archivedAt })}>{o.archivedAt ? "Restore" : "Archive"}</button>
            {safeToDelete && <button className="block w-full p-2 text-left text-red-600" onClick={() => setDeleteTarget(o)}>Delete</button>}
          </div>
        </details>
      </div>
    </article>;
  }
  function columns(stages: readonly string[]) {
    const options = [...PIPELINE_STAGE_OPTIONS, { value: "no_reply", label: "No Reply (legacy)" }].filter((s) => stages.includes(s.value));
    return <div className="flex gap-3 overflow-x-auto pb-4">{options.map((s) => {
      const items = filtered.filter((o) => o.stage === s.value);
      const valueLabel = s.value === "completed" ? "Won" :
        s.value === "lost" ? "Lost" :
          ["service_delivery", "review"].includes(s.value) ? "Contract" :
            isTerminalStage(s.value) ? null : "Expected";
      const total = items.reduce((sum, o) => {
        const value = opportunityValues(o);
        return sum + (valueLabel === "Won" ? value.won : valueLabel === "Lost" ? value.lost :
          valueLabel === "Contract" ? value.contract : valueLabel === "Expected" ? value.expected : 0);
      }, 0);
      return <section key={s.value} className="w-72 min-w-72 rounded-lg bg-slate-100 p-3">
        <h3 className="mb-2 text-sm font-semibold">{s.label} ({items.length})</h3>
        {valueLabel && <div className="mb-2 text-xs">{valueLabel}: {formatCurrency(total)}</div>}
        <div className="max-h-[65vh] min-h-32 overflow-y-auto pr-1">{items.length ? items.map(card) : <p className="p-3 text-xs text-slate-500">No {s.label.toLowerCase()} opportunities.</p>}</div>
      </section>;
    })}</div>;
  }
  return <>
    <PageHeader title="Opportunities" description="Lead dates and historical outcomes in America/New_York" actions={<div className="flex flex-wrap gap-2">
      <ExportPdfButton disabled={query.isFetching || query.isError || !query.data} build={() => opportunitiesPdf(filtered, {
        dateRange: `${from || "No lower limit"} through ${to || "No upper limit"} (Lead Received Date)`,
        filters: [["Visibility", visibility === "archived" ? "Archived only" : visibility], ["Search", search], ["Source", source], ["Service", service], ["Stage", stage ? opportunityStageLabel(stage) : "All"], ["Follow-up", followUp || "All"], ["View", view]],
      })} />
      <button className="btn btn-primary" onClick={() => setEditor("new")}>New Opportunity</button>
    </div>} />
    <div className="card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
      <label>Search<input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Project or customer" /></label>
      <label>Lead Source<select className="input" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Service<select className="input" value={service} onChange={(e) => setService(e.target.value)}><option value="">All services</option>{services.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>Stage<select className="input" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All stages</option>{PIPELINE_STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}<option value="no_reply">No Reply (legacy)</option></select></label>
      <label>Lead Received From<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>Lead Received Through<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label>Follow-up<select className="input" value={followUp} onChange={(e) => setFollowUp(e.target.value)}><option value="">All</option><option value="due">Due today or overdue</option><option value="overdue">Overdue</option></select></label>
      <label>Visibility<select aria-label="Visibility" className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as OpportunityVisibility)}>
        <option value="active">Active</option>
        <option value="archived">Archived only</option>
        <option value="all">All</option>
      </select></label>
      <div className="flex items-end"><button className="btn btn-secondary" onClick={() => setView(view === "kanban" ? "table" : "kanban")}>{view === "kanban" ? "Table view" : "Kanban view"}</button></div>
    </div>
    {query.error && <p role="alert" className="text-red-600">{query.error.message}</p>}
    {query.isLoading ? <p>Loading...</p> : !filtered.length ? <div className="card p-8 text-center text-slate-600">No Opportunities match the selected visibility and filters.</div> : view === "table" ? <div className="max-h-[75vh] overflow-auto"><table className="w-full"><thead><tr><th>Opportunity</th><th>Stage</th></tr></thead><tbody>{filteredViews.table.map((o) => <tr key={o.id}><td>{card(o)}</td><td>{opportunityStageLabel(o.stage)}</td></tr>)}</tbody></table></div> : <>
      {OPPORTUNITY_BOARD_GROUPS.filter((group) => group.id !== "closed").map((group) => <section key={group.id} className="mb-5">
        <h2 className="mb-2 text-base font-semibold">{group.label} ({filtered.filter((o) => (group.stages as readonly string[]).includes(o.stage)).length})</h2>
        {columns(group.stages)}
      </section>)}
      <details className="mt-4">
        <summary className="mb-3 cursor-pointer font-semibold">Closed ({filtered.filter((o) => (OPPORTUNITY_BOARD_GROUPS[3].stages as readonly string[]).includes(o.stage)).length})</summary>
        {columns(OPPORTUNITY_BOARD_GROUPS[3].stages)}
      </details>
    </>}
    {editor && <OpportunityEditor opportunity={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} onSaved={refresh} />}
    <ConfirmDialog open={!!deleteTarget} title="Delete disposable Opportunity" message="Only an Opportunity with no linked Proposals, Job, or protected automation data can be deleted. Its stage history will be removed with it. Archive historical records instead." confirmLabel="Delete" destructive isPending={remove.isPending} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove.mutate({ id: deleteTarget.id })} />
  </>;
}
