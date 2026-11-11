"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { toast } from "sonner";

export function JobOpportunityLink({ jobId, customerId, opportunityId }: { jobId: number; customerId: number; opportunityId: number | null }) {
  const utils = api.useUtils();
  const opportunities = api.opportunities.list.useQuery();
  const attribution = api.opportunities.marketingAttribution.useQuery(
    { id: opportunityId ?? 0 },
    { enabled: !!opportunityId },
  );
  const link = api.jobs.setOpportunity.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.jobs.invalidate(), utils.opportunities.invalidate(), utils.business.invalidate(), utils.reports.invalidate(), utils.customers.invalidate()]);
      toast.success("Opportunity link updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const attributionRows = attribution.data ? [
    ["Platform", attribution.data.platform ?? attribution.data.trafficSource],
    ["Campaign", attribution.data.campaignName ?? attribution.data.utmCampaign ?? attribution.data.campaignId],
    ["Ad", attribution.data.adName ?? attribution.data.adId ?? attribution.data.utmContent],
    ["Landing Page", attribution.data.landingPage],
    ["External Lead ID", attribution.data.externalLeadId],
  ].filter((row): row is [string, string] => !!row[1]) : [];
  return <div className="card mb-4 p-4">
    <div className="flex flex-wrap items-center gap-3">
    <label>Linked Opportunity<select className="input" value={opportunityId ?? ""} disabled={link.isPending} onChange={(e) => link.mutate({ id: jobId, opportunityId: Number(e.target.value) || null })}>
      <option value="">No link / Unlink</option>
      {(opportunities.data ?? []).filter((o) => o.customerId === customerId).map((o) => <option key={o.id} value={o.id} disabled={!!o.job && o.job.id !== jobId}>{o.name} ({o.stage}){o.archivedAt ? " - Archived" : ""}</option>)}
    </select></label>
    {opportunityId && <Link className="text-brand-700" href={`/opportunities?open=${opportunityId}`}>Open Opportunity</Link>}
    {opportunities.error && <p className="text-red-600">{opportunities.error.message}</p>}
    </div>
    {!!opportunityId && <section className="mt-4 border-t pt-3">
      <h3 className="mb-2 font-semibold">Marketing Attribution from Opportunity</h3>
      {attribution.isLoading ? <p className="text-sm text-slate-500">Loading attribution...</p> :
        attributionRows.length ? <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {attributionRows.map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="break-all">{value}</dd></div>)}
        </dl> : <p className="text-sm text-slate-500">No structured marketing attribution is recorded for this Opportunity yet.</p>}
    </section>}
  </div>;
}
