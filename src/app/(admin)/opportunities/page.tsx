"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const SALES_STAGES = [
  "new_lead", "onboarding", "not_answered", "follow_up",
  "estimate_sent", "approval", "service_delivery", "review",
] as const;

export default function OpportunitiesPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.opportunities.list.useQuery();
  const setStage = api.opportunities.setStage.useMutation({
    onSuccess: () => {
      utils.opportunities.list.invalidate();
      toast.success("Stage updated");
    },
  });

  const grouped = SALES_STAGES.map((stage) => ({
    stage,
    items: (data ?? []).filter((o) => o.pipeline === "sales" && o.stage === stage),
  }));

  return (
    <>
      <PageHeader title="Opportunities" description="Sales pipeline" />
      {isLoading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {grouped.map((col) => (
            <div key={col.stage} className="bg-slate-100 rounded-lg p-3 min-h-[200px]">
              <div className="text-xs uppercase font-semibold text-slate-600 mb-2">
                {col.stage.replace(/_/g, " ")}
              </div>
              {col.items.map((o) => (
                <div key={o.id} className="card p-3 mb-2 text-sm">
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-slate-500">{o.customer.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {o.leadValue ? formatCurrency(Number(o.leadValue)) : ""} · {formatDate(o.createdAt)}
                  </div>
                  <select
                    className="input mt-2 text-xs"
                    value={o.stage}
                    onChange={(e) =>
                      setStage.mutate({
                        id: o.id,
                        pipeline: o.pipeline,
                        stage: e.target.value as any,
                      })
                    }
                  >
                    {SALES_STAGES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
