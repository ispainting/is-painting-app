"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

const CATEGORIES = ["INTERIOR", "EXTERIOR", "PREP", "SPECIALTY"] as const;
const BASES = ["SQFT_PER_HOUR", "LINEAR_FT_PER_HOUR", "HOURS_PER_ITEM", "FIXED_HOURS"] as const;

export default function ProductionRatesPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.productionRates.list.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "INTERIOR" as (typeof CATEGORIES)[number], surfaceType: "", basis: "SQFT_PER_HOUR" as (typeof BASES)[number], rateValue: 0, coats: 2, prepLevel: "Normal", isDefault: false, notes: "" });
  const create = api.productionRates.create.useMutation({
    onSuccess: () => { toast.success("Production rate saved"); utils.productionRates.list.invalidate(); setOpen(false); },
    onError: (error) => toast.error(error.message),
  });
  const archive = api.productionRates.archive.useMutation({
    onSuccess: () => { toast.success("Production rate archived"); utils.productionRates.list.invalidate(); },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader title="Production Rate Catalog" description="Company-configured production rates for Proposal estimating" actions={<button className="btn btn-primary" onClick={() => setOpen(true)}>Add Rate</button>} />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Basis</th><th className="px-4 py-2">Rate</th><th className="px-4 py-2">Coats</th><th className="px-4 py-2">Prep</th><th className="px-4 py-2">Default</th><th className="px-4 py-2 text-right">Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="px-4 py-6 text-slate-500">Loading…</td></tr> : data?.length === 0 ? <tr><td colSpan={8} className="px-4 py-6 text-slate-500">No rates configured. Add I.S Painting rates when approved.</td></tr> : data?.map((rate) => <tr key={rate.id} className="border-t border-slate-100"><td className="px-4 py-2">{rate.name}</td><td className="px-4 py-2">{rate.category}</td><td className="px-4 py-2">{rate.basis}</td><td className="px-4 py-2">{Number(rate.rateValue)}</td><td className="px-4 py-2">{rate.coats ?? "—"}</td><td className="px-4 py-2">{rate.prepLevel || "—"}</td><td className="px-4 py-2">{rate.isDefault ? "Yes" : "No"}</td><td className="px-4 py-2 text-right"><button className="btn btn-secondary" onClick={() => archive.mutate({ id: rate.id })}>Archive</button></td></tr>)}
          </tbody>
        </table>
      </div>
      {open && <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"><div className="card w-full max-w-lg p-6"><h2 className="text-lg font-semibold mb-4">Add Production Rate</h2><div className="grid grid-cols-2 gap-3"><div className="col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Walls — repaint" /></div><div><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as (typeof CATEGORIES)[number] }))}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div><label className="label">Surface type</label><input className="input" value={form.surfaceType} onChange={(e) => setForm((f) => ({ ...f, surfaceType: e.target.value }))} placeholder="Walls" /></div><div><label className="label">Basis</label><select className="input" value={form.basis} onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value as (typeof BASES)[number] }))}>{BASES.map((basis) => <option key={basis}>{basis}</option>)}</select></div><div><label className="label">Rate value</label><input type="number" step="0.01" className="input" value={form.rateValue} onChange={(e) => setForm((f) => ({ ...f, rateValue: Number(e.target.value) || 0 }))} /></div><div><label className="label">Coats</label><input type="number" min="1" className="input" value={form.coats} onChange={(e) => setForm((f) => ({ ...f, coats: Number(e.target.value) || 1 }))} /></div><div><label className="label">Prep / difficulty</label><input className="input" value={form.prepLevel} onChange={(e) => setForm((f) => ({ ...f, prepLevel: e.target.value }))} /></div><label className="flex gap-2 items-center mt-6"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} /> Active default</label><div className="col-span-2"><label className="label">Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div></div><div className="flex justify-end gap-2 mt-5"><button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={create.isPending || !form.name.trim() || !form.surfaceType.trim() || form.rateValue <= 0} onClick={() => create.mutate({ ...form, prepLevel: form.prepLevel || null })}>Save Rate</button></div></div></div>}
    </>
  );
}
