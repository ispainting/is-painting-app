"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

export default function SettingsPage() {
  const utils = api.useUtils();
  const { data } = api.config.get.useQuery();
  const update = api.config.update.useMutation({
    onSuccess: () => {
      utils.config.get.invalidate();
      toast.success("Saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    companyName: "",
    companyPhone: "",
    companyEmail: "",
    companyAddress: "",
    googleReviewUrl: "",
    defaultWcPercent: 0,
    defaultGlPercent: 0,
    defaultOverhead: 0,
    defaultMarkup: 0,
    defaultTaxPercent: 0,
    defaultLaborSellRate: "",
    defaultLaborCostRate: "",
    defaultProposalPricingMethod: "GROSS_MARGIN" as "GROSS_MARGIN" | "MARKUP",
  });

  useEffect(() => {
    if (data) {
      setForm({
        companyName: data.companyName ?? "",
        companyPhone: data.companyPhone ?? "",
        companyEmail: data.companyEmail ?? "",
        companyAddress: data.companyAddress ?? "",
        googleReviewUrl: data.googleReviewUrl ?? "",
        defaultWcPercent: Number(data.defaultWcPercent ?? 0),
        defaultGlPercent: Number(data.defaultGlPercent ?? 0),
        defaultOverhead: Number(data.defaultOverhead ?? 0),
        defaultMarkup: Number(data.defaultMarkup ?? 0),
        defaultTaxPercent: Number(data.defaultTaxPercent ?? 0),
        defaultLaborSellRate: data.defaultLaborSellRate == null ? "" : String(Number(data.defaultLaborSellRate)),
        defaultLaborCostRate: data.defaultLaborCostRate == null ? "" : String(Number(data.defaultLaborCostRate)),
        defaultProposalPricingMethod: data.defaultProposalPricingMethod,
      });
    }
  }, [data]);

  return (
    <>
      <PageHeader title="Settings" description="Company info and pricing defaults" />
      <div className="card p-5 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company name" value={form.companyName} onChange={(v) => setForm((f) => ({ ...f, companyName: v }))} />
          <Field label="Phone" value={form.companyPhone} onChange={(v) => setForm((f) => ({ ...f, companyPhone: v }))} />
          <Field label="Email" value={form.companyEmail} onChange={(v) => setForm((f) => ({ ...f, companyEmail: v }))} />
          <Field label="Google review URL" value={form.googleReviewUrl} onChange={(v) => setForm((f) => ({ ...f, googleReviewUrl: v }))} />
          <div className="col-span-2">
            <Field label="Address" value={form.companyAddress} onChange={(v) => setForm((f) => ({ ...f, companyAddress: v }))} />
          </div>
          <NumField label="WC %" value={form.defaultWcPercent} onChange={(v) => setForm((f) => ({ ...f, defaultWcPercent: v }))} />
          <NumField label="GL %" value={form.defaultGlPercent} onChange={(v) => setForm((f) => ({ ...f, defaultGlPercent: v }))} />
          <NumField label="Overhead %" value={form.defaultOverhead} onChange={(v) => setForm((f) => ({ ...f, defaultOverhead: v }))} />
          <NumField label="Markup %" value={form.defaultMarkup} onChange={(v) => setForm((f) => ({ ...f, defaultMarkup: v }))} />
          <NumField label="Tax %" value={form.defaultTaxPercent} onChange={(v) => setForm((f) => ({ ...f, defaultTaxPercent: v }))} />
          <div>
            <label className="label">Default labor sell rate ($/painter-hour)</label>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="Not configured"
              value={form.defaultLaborSellRate}
              onChange={(e) => setForm((f) => ({ ...f, defaultLaborSellRate: e.target.value }))}
            />
            <p className="text-xs text-slate-500 mt-1">
              Required before Proposal scopes with estimated labor hours can be priced. Leave blank to keep unconfigured.
            </p>
          </div>
          <div>
            <label className="label">Default labor cost rate ($/hr, internal, optional)</label>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="Not tracked"
              value={form.defaultLaborCostRate}
              onChange={(e) => setForm((f) => ({ ...f, defaultLaborCostRate: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Default proposal pricing method</label>
            <select
              className="input"
              value={form.defaultProposalPricingMethod}
              onChange={(e) => setForm((f) => ({ ...f, defaultProposalPricingMethod: e.target.value as "GROSS_MARGIN" | "MARKUP" }))}
            >
              <option value="GROSS_MARGIN">Gross margin</option>
              <option value="MARKUP">Markup</option>
            </select>
          </div>
        </div>
        <button
          className="btn btn-primary mt-5"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              ...form,
              defaultLaborSellRate: form.defaultLaborSellRate.trim() === "" ? null : Number(form.defaultLaborSellRate),
              defaultLaborCostRate: form.defaultLaborCostRate.trim() === "" ? null : Number(form.defaultLaborCostRate),
            })
          }
        >
          {update.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step="0.01"
        className="input"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}
