"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function JobsPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.jobs.list.useQuery();
  const customers = api.customers.list.useQuery();
  const create = api.jobs.create.useMutation({
    onSuccess: () => {
      toast.success("Job created");
      utils.jobs.list.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: 0,
    name: "",
    materialsBudget: 0,
    laborBudget: 0,
    wcPercent: 17.5,
    glPercent: 7.5,
    overheadPercent: 12,
    markupPercent: 27,
    taxPercent: 0,
    jobType: "interior" as "interior" | "exterior" | "both" | "commercial" | "other",
  });

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Estimates and active jobs"
        actions={
          <button onClick={() => setOpen(true)} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-1" /> New job
          </button>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Estimate #</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Total</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : data?.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No jobs yet.</td></tr>
            ) : (
              data?.map((j) => (
                <tr key={j.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{j.estimateNumber}</td>
                  <td className="px-4 py-2">
                    <Link className="text-brand-700 hover:underline" href={`/jobs/${j.id}`}>
                      {j.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{j.customer.name}</td>
                  <td className="px-4 py-2">
                    <span className="badge bg-slate-100 text-slate-700 capitalize">{j.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(j.totalEstimate))}</td>
                  <td className="px-4 py-2 text-slate-500">{formatDate(j.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg p-6">
            <div className="text-lg font-semibold mb-3">New job</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Customer</label>
                <select
                  className="input"
                  value={form.customerId}
                  onChange={(e) => setForm((f) => ({ ...f, customerId: Number(e.target.value) }))}
                >
                  <option value={0}>Select…</option>
                  {customers.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Job name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <Field label="Materials" value={form.materialsBudget} onChange={(v) => setForm((f) => ({ ...f, materialsBudget: v }))} />
              <Field label="Labor" value={form.laborBudget} onChange={(v) => setForm((f) => ({ ...f, laborBudget: v }))} />
              <Field label="WC %" value={form.wcPercent} onChange={(v) => setForm((f) => ({ ...f, wcPercent: v }))} />
              <Field label="GL %" value={form.glPercent} onChange={(v) => setForm((f) => ({ ...f, glPercent: v }))} />
              <Field label="Overhead %" value={form.overheadPercent} onChange={(v) => setForm((f) => ({ ...f, overheadPercent: v }))} />
              <Field label="Markup %" value={form.markupPercent} onChange={(v) => setForm((f) => ({ ...f, markupPercent: v }))} />
              <Field label="Tax %" value={form.taxPercent} onChange={(v) => setForm((f) => ({ ...f, taxPercent: v }))} />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={create.isPending || !form.customerId || !form.name}
                onClick={() => create.mutate(form)}
              >
                {create.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
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
