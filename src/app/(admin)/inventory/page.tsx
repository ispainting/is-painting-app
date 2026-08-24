"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

const CATEGORIES = ["paint", "primer", "caulk", "tape", "tools", "supplies", "other"] as const;

export default function InventoryPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.inventory.list.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "paint" as (typeof CATEGORIES)[number],
    unit: "gallon",
    costPerUnit: 0,
    defaultMarkupPercent: 0,
    sku: "",
    supplier: "",
  });

  const create = api.inventory.create.useMutation({
    onSuccess: () => {
      toast.success("Material added to catalog");
      utils.inventory.list.invalidate();
      setOpen(false);
      setForm({ name: "", category: "paint", unit: "gallon", costPerUnit: 0, defaultMarkupPercent: 0, sku: "", supplier: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const archive = api.inventory.archive.useMutation({
    onSuccess: () => {
      toast.success("Material archived");
      utils.inventory.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Material Catalog"
        description="Reusable materials used for inventory tracking and Proposal material estimating"
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            Add Material
          </button>
        }
      />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium text-right">Stock</th>
              <th className="px-4 py-2 font-medium text-right">Cost / unit</th>
              <th className="px-4 py-2 font-medium text-right">Default markup</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : data?.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-slate-500">No materials yet. Add one to start estimating with a real catalog.</td></tr>
            ) : (
              data?.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{i.name}</td>
                  <td className="px-4 py-2 capitalize">{i.category}</td>
                  <td className="px-4 py-2">{i.unit}</td>
                  <td className="px-4 py-2 text-xs font-mono">{i.sku || "—"}</td>
                  <td className={`px-4 py-2 text-right ${
                    Number(i.currentStock) < Number(i.minStockLevel) ? "text-red-600 font-medium" : ""
                  }`}>
                    {Number(i.currentStock).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(i.costPerUnit))}</td>
                  <td className="px-4 py-2 text-right">{i.defaultMarkupPercent != null ? `${Number(i.defaultMarkupPercent)}%` : "Company default"}</td>
                  <td className="px-4 py-2 text-right">
                    <button className="btn btn-secondary" onClick={() => archive.mutate({ id: i.id })}>
                      Archive
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg p-6">
            <div className="text-lg font-semibold mb-3">Add Material</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as (typeof CATEGORIES)[number] }))}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Unit</label>
                <input className="input" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
              </div>
              <div>
                <label className="label">Unit cost</label>
                <input type="number" step="0.01" className="input" value={form.costPerUnit} onChange={(e) => setForm((f) => ({ ...f, costPerUnit: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">Default markup %</label>
                <input type="number" step="0.01" className="input" value={form.defaultMarkupPercent} onChange={(e) => setForm((f) => ({ ...f, defaultMarkupPercent: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">SKU / product code</label>
                <input className="input" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
              </div>
              <div>
                <label className="label">Supplier</label>
                <input className="input" value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={create.isPending || !form.name.trim()}
                onClick={() =>
                  create.mutate({
                    name: form.name,
                    category: form.category,
                    unit: form.unit,
                    costPerUnit: form.costPerUnit,
                    sellingPrice: form.costPerUnit * (1 + form.defaultMarkupPercent / 100),
                    defaultMarkupPercent: form.defaultMarkupPercent || undefined,
                    sku: form.sku || undefined,
                    supplier: form.supplier || undefined,
                  })
                }
              >
                {create.isPending ? "Saving…" : "Add to Catalog"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
