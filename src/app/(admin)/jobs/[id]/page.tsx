"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

const STATUSES = ["estimate", "sent", "approved", "active", "completed", "on_hold", "cancelled"] as const;

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const utils = api.useUtils();
  const { data: job, isLoading } = api.jobs.byId.useQuery({ id });
  const customers = api.customers.list.useQuery();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    customerId: 0,
    name: "",
    status: "estimate" as (typeof STATUSES)[number],
    scopeOfWork: "",
    materialsBudget: 0,
    laborBudget: 0,
    totalEstimate: 0,
    contractAmount: 0,
  });
  const [paintForm, setPaintForm] = useState({
    area: "",
    colorName: "",
    brand: "",
    finish: "",
    notes: "",
  });
  const [editingPaintColorId, setEditingPaintColorId] = useState<number | null>(null);
  const [editingPaintForm, setEditingPaintForm] = useState({
    area: "",
    colorName: "",
    brand: "",
    finish: "",
    notes: "",
  });

  const updateJob = api.jobs.update.useMutation({
    onSuccess: () => {
      utils.jobs.byId.invalidate({ id });
      utils.jobs.list.invalidate();
      toast.success("Job updated");
      setIsEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const setStatus = api.jobs.setStatus.useMutation({
    onSuccess: () => {
      utils.jobs.byId.invalidate({ id });
      utils.jobs.list.invalidate();
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const addPaintColor = api.jobs.addPaintColor.useMutation({
    onSuccess: () => {
      utils.jobs.byId.invalidate({ id });
      toast.success("Paint color added");
      setPaintForm({ area: "", colorName: "", brand: "", finish: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePaintColor = api.jobs.updatePaintColor.useMutation({
    onSuccess: () => {
      utils.jobs.byId.invalidate({ id });
      toast.success("Paint color updated");
      setEditingPaintColorId(null);
      setEditingPaintForm({ area: "", colorName: "", brand: "", finish: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePaintColor = api.jobs.deletePaintColor.useMutation({
    onSuccess: () => {
      utils.jobs.byId.invalidate({ id });
      toast.success("Paint color removed");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !job) return <div className="text-slate-500">Loading…</div>;

  const openEditModal = () => {
    setEditForm({
      customerId: job.customerId,
      name: job.name,
      status: job.status,
      scopeOfWork: job.scopeOfWork || "",
      materialsBudget: Number(job.materialsBudget),
      laborBudget: Number(job.laborBudget),
      totalEstimate: Number(job.totalEstimate),
      contractAmount: Number(job.contractAmount),
    });
    setIsEditOpen(true);
  };

  const saveJobEdits = async () => {
    await updateJob.mutateAsync({
      id,
      data: {
        customerId: editForm.customerId,
        name: editForm.name,
        scopeOfWork: editForm.scopeOfWork,
        materialsBudget: editForm.materialsBudget,
        laborBudget: editForm.laborBudget,
        totalEstimate: editForm.totalEstimate,
        contractAmount: editForm.contractAmount,
      },
    });

    if (editForm.status !== job.status) {
      await setStatus.mutateAsync({ id, status: editForm.status });
    }
  };

  return (
    <>
      <PageHeader
        title={job.name}
        description={`${job.estimateNumber} · ${job.customer.name}`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" type="button" onClick={openEditModal}>
              Edit Job
            </button>
            <select
              className="input w-auto"
              value={job.status}
              onChange={(e) => setStatus.mutate({ id, status: e.target.value as any })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <h2 className="text-base font-semibold">Overview</h2>
          <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
            <Stat label="Materials budget" value={formatCurrency(Number(job.materialsBudget))} />
            <Stat label="Labor budget" value={formatCurrency(Number(job.laborBudget))} />
            <Stat label="Subtotal (after burden)" value={formatCurrency(Number(job.subtotalBeforeMarkup))} />
            <Stat label="Total estimate" value={formatCurrency(Number(job.totalEstimate))} />
            <Stat label="Contract" value={formatCurrency(Number(job.contractAmount))} />
            <Stat label="Approved" value={job.approvedAt ? formatDateTime(job.approvedAt) : "—"} />
          </div>

          <h2 className="text-base font-semibold mt-8 mb-2">Scope of Work</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.scopeOfWork || "—"}</p>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold mb-2">Assigned Crew</h2>
          {job.assignments.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody assigned yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {job.assignments.map((a) => (
                <li key={a.id}>{a.user.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Recent Time Entries</h2>
          {job.timeEntries.length === 0 ? (
            <p className="text-sm text-slate-500">No time logged.</p>
          ) : (
            <ul className="text-sm divide-y">
              {job.timeEntries.slice(0, 8).map((t) => (
                <li key={t.id} className="py-2 flex justify-between">
                  <span>{t.user.name}</span>
                  <span className="text-slate-500">
                    {t.hoursWorked ? `${Number(t.hoursWorked).toFixed(2)}h` : "in progress"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Invoices</h2>
          {job.invoices.length === 0 ? (
            <p className="text-sm text-slate-500">No invoices yet.</p>
          ) : (
            <ul className="text-sm divide-y">
              {job.invoices.map((i) => (
                <li key={i.id} className="py-2 flex justify-between">
                  <span>{i.invoiceNumber} · {i.title}</span>
                  <span>{formatCurrency(Number(i.total))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5 mt-4">
        <h2 className="text-base font-semibold mb-2">Paint Colors</h2>
        <p className="text-xs text-slate-500 mb-4">
          Track paint decisions by area. Examples: Walls / Pinecone Hill / Behr, Trims / Windswept, Doors / Haute Couture.
        </p>

        <div className="grid md:grid-cols-5 gap-2">
          <input
            className="input"
            placeholder="Area (Walls)"
            value={paintForm.area}
            onChange={(e) => setPaintForm((f) => ({ ...f, area: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Color name"
            value={paintForm.colorName}
            onChange={(e) => setPaintForm((f) => ({ ...f, colorName: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Brand (optional)"
            value={paintForm.brand}
            onChange={(e) => setPaintForm((f) => ({ ...f, brand: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Finish (optional)"
            value={paintForm.finish}
            onChange={(e) => setPaintForm((f) => ({ ...f, finish: e.target.value }))}
          />
          <button
            className="btn btn-primary"
            disabled={addPaintColor.isPending || !paintForm.area || !paintForm.colorName}
            onClick={() => addPaintColor.mutate({ jobId: id, ...paintForm })}
          >
            {addPaintColor.isPending ? "Adding…" : "Add Color"}
          </button>
        </div>

        <textarea
          className="input mt-2"
          placeholder="Notes (optional)"
          value={paintForm.notes}
          onChange={(e) => setPaintForm((f) => ({ ...f, notes: e.target.value }))}
        />

        {job.paintColors.length === 0 ? (
          <p className="text-sm text-slate-500 mt-4">No paint colors added yet.</p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead className="text-left bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-medium">Area</th>
                  <th className="px-3 py-2 font-medium">Color</th>
                  <th className="px-3 py-2 font-medium">Brand</th>
                  <th className="px-3 py-2 font-medium">Finish</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {job.paintColors.map((color) => {
                  const isEditing = editingPaintColorId === color.id;
                  return (
                    <tr key={color.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            className="input"
                            value={editingPaintForm.area}
                            onChange={(e) => setEditingPaintForm((f) => ({ ...f, area: e.target.value }))}
                          />
                        ) : (
                          color.area
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            className="input"
                            value={editingPaintForm.colorName}
                            onChange={(e) => setEditingPaintForm((f) => ({ ...f, colorName: e.target.value }))}
                          />
                        ) : (
                          color.colorName
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            className="input"
                            value={editingPaintForm.brand}
                            onChange={(e) => setEditingPaintForm((f) => ({ ...f, brand: e.target.value }))}
                          />
                        ) : (
                          color.brand || "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <input
                            className="input"
                            value={editingPaintForm.finish}
                            onChange={(e) => setEditingPaintForm((f) => ({ ...f, finish: e.target.value }))}
                          />
                        ) : (
                          color.finish || "—"
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-xs">
                        {isEditing ? (
                          <textarea
                            className="input"
                            value={editingPaintForm.notes}
                            onChange={(e) => setEditingPaintForm((f) => ({ ...f, notes: e.target.value }))}
                          />
                        ) : (
                          <span className="text-slate-600">{color.notes || "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button
                                className="btn btn-secondary text-xs"
                                onClick={() => {
                                  setEditingPaintColorId(null);
                                  setEditingPaintForm({ area: "", colorName: "", brand: "", finish: "", notes: "" });
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                className="btn btn-primary text-xs"
                                disabled={updatePaintColor.isPending || !editingPaintForm.area || !editingPaintForm.colorName}
                                onClick={() =>
                                  updatePaintColor.mutate({
                                    id: color.id,
                                    data: {
                                      area: editingPaintForm.area,
                                      colorName: editingPaintForm.colorName,
                                      brand: editingPaintForm.brand,
                                      finish: editingPaintForm.finish,
                                      notes: editingPaintForm.notes,
                                    },
                                  })
                                }
                              >
                                Save
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn btn-secondary text-xs"
                                onClick={() => {
                                  setEditingPaintColorId(color.id);
                                  setEditingPaintForm({
                                    area: color.area,
                                    colorName: color.colorName,
                                    brand: color.brand || "",
                                    finish: color.finish || "",
                                    notes: color.notes || "",
                                  });
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-secondary text-xs"
                                disabled={deletePaintColor.isPending}
                                onClick={() => deletePaintColor.mutate({ id: color.id })}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isEditOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-2xl p-6">
            <div className="text-lg font-semibold mb-3">Edit Job</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Job name</label>
                <input
                  className="input"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as (typeof STATUSES)[number] }))}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Customer</label>
                <select
                  className="input"
                  value={editForm.customerId}
                  onChange={(e) => setEditForm((f) => ({ ...f, customerId: Number(e.target.value) }))}
                >
                  {customers.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="label">Scope of work</label>
                <textarea
                  className="input min-h-24"
                  value={editForm.scopeOfWork}
                  onChange={(e) => setEditForm((f) => ({ ...f, scopeOfWork: e.target.value }))}
                />
              </div>

              <Field label="Materials budget" value={editForm.materialsBudget} onChange={(v) => setEditForm((f) => ({ ...f, materialsBudget: v }))} />
              <Field label="Labor budget" value={editForm.laborBudget} onChange={(v) => setEditForm((f) => ({ ...f, laborBudget: v }))} />
              <Field label="Total amount" value={editForm.totalEstimate} onChange={(v) => setEditForm((f) => ({ ...f, totalEstimate: v }))} />
              <Field label="Contract amount" value={editForm.contractAmount} onChange={(v) => setEditForm((f) => ({ ...f, contractAmount: v }))} />
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-secondary" onClick={() => setIsEditOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={updateJob.isPending || setStatus.isPending || !editForm.name || !editForm.customerId}
                onClick={saveJobEdits}
              >
                {updateJob.isPending || setStatus.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-base font-medium mt-0.5">{value}</div>
    </div>
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
