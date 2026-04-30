"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

export default function AutomationsPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.automations.templates.useQuery();
  const toggle = api.automations.toggle.useMutation({
    onSuccess: () => {
      utils.automations.templates.invalidate();
      toast.success("Updated");
    },
  });

  return (
    <>
      <PageHeader title="Automations" description="SMS/email follow-ups by pipeline stage" />
      {isLoading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data?.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{t.displayName}</div>
                  <div className="text-xs text-slate-500">{t.trigger}</div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.isEnabled}
                    onChange={(e) => toggle.mutate({ id: t.id, enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <div className="mt-4 text-sm">
                <div className="font-medium mb-1">Steps</div>
                <ol className="space-y-1 text-slate-700">
                  {t.steps.map((s) => (
                    <li key={s.id} className="border-l-2 border-brand-200 pl-3">
                      <div className="text-xs uppercase text-slate-500">
                        Step {s.stepNumber} · {s.channel} · {s.delayMinutes}m delay
                      </div>
                      <div>{s.messageContent}</div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
