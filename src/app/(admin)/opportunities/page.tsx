"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { opportunityStageLabel } from "@/lib/pipeline-sync";
import { PIPELINE_STAGE_OPTIONS, TERMINAL_PIPELINE_STAGES } from "@/lib/pipeline-stages";
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
      <PageHeader title="Opportunities" description="Sales pipeline" />
      {isLoading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {grouped.map((col) => (
              <StageColumn key={col.stage} stage={col.stage} items={col.items} onStage={(id, stage, pipeline) => setStage.mutate({ id, pipeline, stage: stage as any })} />
            ))}
          </div>
          <h2 className="mt-6 text-sm font-semibold text-slate-700">Closed / Terminal</h2>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
            {terminalGrouped.map((col) => (
              <StageColumn key={col.stage} stage={col.stage} items={col.items} onStage={(id, stage, pipeline) => setStage.mutate({ id, pipeline, stage: stage as any })} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function StageColumn({
  stage,
  items,
  onStage,
}: {
  stage: string;
  items: any[];
  onStage: (id: number, stage: string, pipeline: "sales" | "not_interested") => void;
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
        </div>
      ))}
    </div>
  );
}
