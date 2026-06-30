"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["draft", "ready", "sent", "viewed", "approved", "declined", "converted"] as const;

export default function ProposalsPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.proposals.list.useQuery();
  const [open, setOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const customers = api.customers.list.useQuery(
    { search: customerSearch.trim() || undefined },
    { enabled: open }
  );
  const [form, setForm] = useState({
    customerId: 0,
    projectName: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    status: "draft" as (typeof STATUSES)[number],
    scopeOfWork: "",
    notes: "",
    materialsBudget: 0,
    laborBudget: 0,
    subcontractorBudget: 0,
    totalAmount: 0,
  });

  const create = api.proposals.create.useMutation({
    onSuccess: () => {
      toast.success("Proposal created");
      utils.proposals.list.invalidate();
      setOpen(false);
      setForm({
        customerId: 0,
        projectName: "",
        address: "",
        city: "",
        state: "",
        zipCode: "",
        status: "draft",
        scopeOfWork: "",
        notes: "",
        materialsBudget: 0,
        laborBudget: 0,
        subcontractorBudget: 0,
        totalAmount: 0,
      });
      setCustomerSearch("");
      setShowCustomerResults(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const selectCustomer = (customer: {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  }) => {
    setForm((f) => ({
      ...f,
      customerId: customer.id,
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zipCode: customer.zipCode || "",
    }));
    setCustomerSearch(customer.name);
    setShowCustomerResults(false);
  };

  return (
    <>
      <PageHeader
        title="Proposals"
        description="Lead / Customer -> Proposal -> Sent / Approved -> Job"
        actions={
          <button onClick={() => setOpen(true)} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-1" /> New Proposal
          </button>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Proposal #</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Project Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Total Amount</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : data?.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No proposals yet.</td></tr>
            ) : (
              data?.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{p.proposalNumber}</td>
                  <td className="px-4 py-2">{p.customer.name}</td>
                  <td className="px-4 py-2">
                    <Link href={`/proposals/${p.id}`} className="text-brand-700 hover:underline">{p.projectName}</Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="badge bg-slate-100 text-slate-700 capitalize">{p.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(p.totalAmount))}</td>
                  <td className="px-4 py-2 text-slate-500">{formatDate(p.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-3xl p-6 max-h-[85vh] flex flex-col">
            <div className="text-lg font-semibold mb-3">Create Proposal</div>
            <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 flex-1">
              <div className="col-span-2">
                <label className="label">Customer</label>
                <div className="relative">
                  <input
                    className="input"
                    value={customerSearch}
                    onFocus={() => setShowCustomerResults(true)}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerResults(true);
                    }}
                    placeholder="Search customer by name, phone, email, or address"
                  />
                  {showCustomerResults && customerSearch.trim().length > 0 && (
                    <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {customers.isLoading ? (
                        <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>
                      ) : customers.data && customers.data.length > 0 ? (
                        customers.data.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                            onClick={() => selectCustomer(c)}
                          >
                            <div className="text-sm font-medium text-slate-900">{c.name}</div>
                            <div className="text-xs text-slate-600">{c.address || "No address on file"}</div>
                            <div className="text-xs text-slate-600">{c.phone || c.email || "No contact on file"}</div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">No matching customers.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="col-span-2">
                <label className="label">Project Name</label>
                <input className="input" value={form.projectName} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} />
              </div>

              <div className="col-span-2">
                <label className="label">Street</label>
                <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <FieldText label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
              <FieldText label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} />
              <FieldText label="Zip" value={form.zipCode} onChange={(v) => setForm((f) => ({ ...f, zipCode: v }))} />

              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as (typeof STATUSES)[number] }))}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s === "declined" ? "rejected" : s}</option>)}
                </select>
              </div>

              <FieldNumber label="Materials Budget" value={form.materialsBudget} onChange={(v) => setForm((f) => ({ ...f, materialsBudget: v }))} />
              <FieldNumber label="Labor Budget" value={form.laborBudget} onChange={(v) => setForm((f) => ({ ...f, laborBudget: v }))} />
              <FieldNumber label="Subcontractor Budget" value={form.subcontractorBudget} onChange={(v) => setForm((f) => ({ ...f, subcontractorBudget: v }))} />
              <FieldNumber label="Total Amount" value={form.totalAmount} onChange={(v) => setForm((f) => ({ ...f, totalAmount: v }))} />

              <div className="col-span-2">
                <label className="label">Scope of Work</label>
                <textarea className="input min-h-24" value={form.scopeOfWork} onChange={(e) => setForm((f) => ({ ...f, scopeOfWork: e.target.value }))} />
              </div>

              <div className="col-span-2">
                <label className="label">Notes</label>
                <textarea className="input min-h-20" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200 bg-white sticky bottom-0">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={create.isPending || !form.customerId || !form.projectName}
                onClick={() => create.mutate(form)}
              >
                {create.isPending ? "Creating…" : "Create Proposal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FieldNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" step="0.01" className="input" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
