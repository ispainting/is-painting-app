"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { toast } from "sonner";

export function JobOpportunityLink({ jobId, customerId, opportunityId }: { jobId: number; customerId: number; opportunityId: number | null }) {
  const utils = api.useUtils();
  const opportunities = api.opportunities.list.useQuery();
  const link = api.jobs.setOpportunity.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.jobs.invalidate(), utils.opportunities.invalidate(), utils.business.invalidate(), utils.reports.invalidate(), utils.customers.invalidate()]);
      toast.success("Opportunity link updated");
    },
    onError: (e) => toast.error(e.message),
  });
  return <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
    <label>Linked Opportunity<select className="input" value={opportunityId ?? ""} disabled={link.isPending} onChange={(e) => link.mutate({ id: jobId, opportunityId: Number(e.target.value) || null })}>
      <option value="">No link / Unlink</option>
      {(opportunities.data ?? []).filter((o) => o.customerId === customerId).map((o) => <option key={o.id} value={o.id} disabled={!!o.job && o.job.id !== jobId}>{o.name} ({o.stage}){o.archivedAt ? " - Archived" : ""}</option>)}
    </select></label>
    {opportunityId && <Link className="text-brand-700" href={`/opportunities?open=${opportunityId}`}>Open Opportunity</Link>}
    {opportunities.error && <p className="text-red-600">{opportunities.error.message}</p>}
  </div>;
}
