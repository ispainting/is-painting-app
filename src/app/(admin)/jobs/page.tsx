"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function JobsPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data, isLoading } = api.jobs.list.useQuery();
  const [open, setOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const customers = api.customers.list.useQuery(
    { search: customerSearch.trim() || undefined },
    { enabled: open }
  );
  const create = api.jobs.create.useMutation({
    onSuccess: () => {
      toast.success("Job created");
      utils.jobs.list.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    customerId: 0,
    name: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    specialPayEnabled: false,
    hourlyRateAdjustment: 0,
    travelPayEnabled: false,
    defaultTravelHours: 0,
    travelRateType: "regular" as "regular" | "special" | "custom",
    customTravelRate: 0,
    materialsBudget: 0,
    laborBudget: 0,
    wcPercent: 17.5,
    glPercent: 7.5,
    overheadPercent: 12,
    markupPercent: 27,
    taxPercent: 0,
    jobType: "interior" as "interior" | "exterior" | "both" | "commercial" | "other",
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
        title="Jobs"
        description="Estimates and active jobs"
        actions={
          <button onClick={() => { setOpen(true); setShowCustomerResults(false); }} className="btn btn-primary">
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
                <tr
                  key={j.id}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/jobs/${j.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/jobs/${j.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open job ${j.name}`}
                >
                  <td className="px-4 py-2 font-mono text-xs">{j.estimateNumber}</td>
                  <td className="px-4 py-2 text-brand-700">{j.name}</td>
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
          <div className="card w-full max-w-lg p-6 max-h-[85vh] flex flex-col">
            <div className="text-lg font-semibold mb-3">New job</div>
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
                <label className="label">Job name</label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Street</label>
                <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              </div>
              <FieldText label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
              <FieldText label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} />
              <FieldText label="Zip" value={form.zipCode} onChange={(v) => setForm((f) => ({ ...f, zipCode: v }))} />
              <div className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={form.specialPayEnabled} onChange={(e) => setForm((f) => ({ ...f, specialPayEnabled: e.target.checked }))} />
                  Special Pay Job
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={form.travelPayEnabled} onChange={(e) => setForm((f) => ({ ...f, travelPayEnabled: e.target.checked }))} />
                  Paid Travel
                </label>
                {form.specialPayEnabled ? (
                  <Field label="Hourly Rate Adjustment" value={form.hourlyRateAdjustment} onChange={(v) => setForm((f) => ({ ...f, hourlyRateAdjustment: v }))} prefix="+" />
                ) : <div />}
                <Field label="Default Travel Hours" value={form.defaultTravelHours} onChange={(v) => setForm((f) => ({ ...f, defaultTravelHours: v }))} />
                <div>
                  <label className="label">Travel Rate Type</label>
                  <select className="input" value={form.travelRateType} onChange={(e) => setForm((f) => ({ ...f, travelRateType: e.target.value as "regular" | "special" | "custom" }))}>
                    <option value="regular">Regular Rate</option>
                    <option value="special">Special Rate (includes the job adjustment)</option>
                    <option value="custom">Custom Rate</option>
                  </select>
                </div>
                {form.travelRateType === "custom" ? (
                  <Field label="Custom Travel Rate" value={form.customTravelRate} onChange={(v) => setForm((f) => ({ ...f, customTravelRate: v }))} />
                ) : null}
              </div>
              <Field label="Materials" value={form.materialsBudget} onChange={(v) => setForm((f) => ({ ...f, materialsBudget: v }))} />
              <Field label="Labor" value={form.laborBudget} onChange={(v) => setForm((f) => ({ ...f, laborBudget: v }))} />
              <Field label="WC %" value={form.wcPercent} onChange={(v) => setForm((f) => ({ ...f, wcPercent: v }))} />
              <Field label="GL %" value={form.glPercent} onChange={(v) => setForm((f) => ({ ...f, glPercent: v }))} />
              <Field label="Overhead %" value={form.overheadPercent} onChange={(v) => setForm((f) => ({ ...f, overheadPercent: v }))} />
              <Field label="Markup %" value={form.markupPercent} onChange={(v) => setForm((f) => ({ ...f, markupPercent: v }))} />
              <Field label="Tax %" value={form.taxPercent} onChange={(v) => setForm((f) => ({ ...f, taxPercent: v }))} />
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200 bg-white sticky bottom-0">
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

function Field({ label, value, onChange, prefix }: { label: string; value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        {prefix ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{prefix}</span> : null}
        <input
          type="number"
          step="0.01"
          className={["input", prefix ? "pl-7" : ""].join(" ")}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      </div>
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
