"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function CustomersPage() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const { data, isLoading } = api.customers.list.useQuery({ search });
  const create = api.customers.create.useMutation({
    onSuccess: () => {
      toast.success("Customer added");
      utils.customers.list.invalidate();
      setOpen(false);
      setForm({ name: "", email: "", phone: "", city: "", state: "", source: "", tags: [] });
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", city: "", state: "", source: "",
    tags: [] as string[],
  });

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          <button onClick={() => setOpen(true)} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-1" /> New customer
          </button>
        }
      />

      <div className="mb-3">
        <input
          className="input max-w-xs"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">City</th>
              <th className="px-4 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : data?.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-slate-500">No customers found.</td></tr>
            ) : (
              data?.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">{c.email || "—"}</td>
                  <td className="px-4 py-2">{c.phone || "—"}</td>
                  <td className="px-4 py-2">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-2">{c.source || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="text-lg font-semibold mb-3">New customer</div>
            <div className="space-y-3">
              <Input label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
              <Input label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
              <Input label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
                <Input label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} />
              </div>
              <Input label="Source" value={form.source} onChange={(v) => setForm((f) => ({ ...f, source: v }))} />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!form.name || create.isPending}
                onClick={() => create.mutate(form)}
              >
                {create.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
