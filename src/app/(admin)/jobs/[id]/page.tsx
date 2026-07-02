"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

const STATUSES = ["estimate", "sent", "approved", "active", "completed", "on_hold", "cancelled"] as const;
const WORKSPACE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "budget", label: "Budget" },
  { id: "scope", label: "Scope" },
  { id: "tracking", label: "Tracking" },
  { id: "financials", label: "Financials" },
  { id: "documents", label: "Documents" },
] as const;

type WorkspaceTab = (typeof WORKSPACE_TABS)[number]["id"];

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const utils = api.useUtils();
  const { data: job, isLoading } = api.jobs.byId.useQuery({ id });
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const customers = api.customers.list.useQuery(
    { search: customerSearch.trim() || undefined },
    { enabled: isEditOpen }
  );

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [editForm, setEditForm] = useState({
    customerId: 0,
    name: "",
    status: "estimate" as (typeof STATUSES)[number],
    scopeOfWork: "",
    jobNotes: "",
    specialPayEnabled: false,
    hourlyRateAdjustment: 0,
    travelPayEnabled: false,
    defaultTravelHours: 0,
    travelRateType: "regular" as "regular" | "island" | "special" | "custom",
    customTravelRate: 0,
    materialsBudget: 0,
    laborBudget: 0,
    subcontractorBudget: 0,
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
  const jobData = job as typeof job & {
    customer: { name: string };
    assignments: Array<{ id: number; user: { name: string }; userId: number }>;
    expenses: Array<{ id: number; status: string; category: string; amount: string | number; receiptUrl: string | null; vendor: string | null }>;
    timeEntries: Array<{ id: number; paidHours: string | number | null; hoursWorked: string | number | null; grossHours: string | number | null; clockOut: string | null; clockIn: string; user: { name: string; hourlyRate: string | number | null } }>;
    invoices: Array<{ id: number; total: string | number; invoiceNumber: string | null; title: string | null }>;
    payments: Array<{ id: number; amount: string | number; dateReceived: string; attachmentUrl: string | null; method: string | null }>;
    paintColors: Array<{ id: number; area: string; colorName: string; brand: string | null; finish: string | null; notes: string | null }>;
    isIslandJob: boolean;
    specialPayEnabled: boolean;
    hourlyRateAdjustment: number | string | null;
    travelPayEnabled: boolean;
    defaultTravelHours: number | string | null;
    travelRateType: "regular" | "island" | "special" | "custom" | null;
    customTravelRate: number | string | null;
  };

  const openEditModal = () => {
    const customerName = jobData.customer?.name || "";
    setEditForm({
      customerId: job.customerId,
      name: job.name,
      status: job.status,
      scopeOfWork: job.scopeOfWork || "",
      jobNotes: job.notes || "",
      specialPayEnabled: Boolean((job as any).specialPayEnabled || (job as any).isIslandJob),
      hourlyRateAdjustment: Number((job as any).hourlyRateAdjustment || ((job as any).isIslandJob ? 2 : 0)),
      travelPayEnabled: Boolean((job as any).travelPayEnabled),
      defaultTravelHours: Number((job as any).defaultTravelHours || 0),
      travelRateType: ((job as any).travelRateType || "regular") as "regular" | "island" | "special" | "custom",
      customTravelRate: Number((job as any).customTravelRate || 0),
      materialsBudget: Number(job.materialsBudget),
      laborBudget: Number(job.laborBudget),
      subcontractorBudget: Number(job.subcontractorBudget || 0),
      totalEstimate: Number(job.totalEstimate),
      contractAmount: Number(job.contractAmount),
    });
    setCustomerSearch(customerName);
    setShowCustomerResults(false);
    setIsEditOpen(true);
  };

  const saveJobEdits = async () => {
    await updateJob.mutateAsync({
      id,
      data: {
        customerId: editForm.customerId,
        name: editForm.name,
        scopeOfWork: editForm.scopeOfWork,
        notes: editForm.jobNotes,
        specialPayEnabled: editForm.specialPayEnabled,
        hourlyRateAdjustment: editForm.hourlyRateAdjustment,
        travelPayEnabled: editForm.travelPayEnabled,
        defaultTravelHours: editForm.defaultTravelHours,
        travelRateType: editForm.travelRateType,
        customTravelRate: editForm.travelRateType === "custom" ? editForm.customTravelRate : undefined,
        materialsBudget: editForm.materialsBudget,
        laborBudget: editForm.laborBudget,
        subcontractorBudget: editForm.subcontractorBudget,
        totalEstimate: editForm.totalEstimate,
        contractAmount: editForm.contractAmount,
      },
    });

    if (editForm.status !== job.status) {
      await setStatus.mutateAsync({ id, status: editForm.status });
    }
  };

  const contractOrTotalAmount = Number(job.contractAmount) > 0
    ? Number(job.contractAmount)
    : Number(job.totalEstimate);
  const estimatedMaterials = Number(job.materialsBudget);
  const estimatedLabor = Number(job.laborBudget);
  const estimatedSubcontractor = Number(job.subcontractorBudget || 0);
  const estimatedSubcontractorPending = job.subcontractorBudget == null;
  const estimatedTotalCost = estimatedMaterials + estimatedLabor + estimatedSubcontractor;
  const estimatedGrossProfit = contractOrTotalAmount - estimatedTotalCost;
  const estimatedMarginPct = contractOrTotalAmount > 0
    ? (estimatedGrossProfit / contractOrTotalAmount) * 100
    : 0;

  const nonRejectedExpenses = jobData.expenses.filter((e) => e.status !== "rejected");
  const subcontractorExpenses = nonRejectedExpenses.filter((e) => e.category === "subcontractor");
  const nonSubcontractorExpenses = nonRejectedExpenses.filter((e) => e.category !== "subcontractor" && e.category !== "labor");

  const actualSubcontractorCost = subcontractorExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const actualExpensesTotal = nonSubcontractorExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const actualLaborResult = jobData.timeEntries.reduce(
    (acc, t) => {
      const hours = t.paidHours != null
        ? Number(t.paidHours)
        : t.hoursWorked != null
          ? Number(t.hoursWorked)
          : t.grossHours != null
            ? Number(t.grossHours)
            : t.clockOut
              ? (new Date(t.clockOut).getTime() - new Date(t.clockIn).getTime()) / 3_600_000
              : null;

      if (hours == null || !Number.isFinite(hours) || hours <= 0) {
        return acc;
      }

      acc.hasHours = true;
      const hourlyRate = Number(t.user.hourlyRate || 0);
      if (hourlyRate <= 0) {
        acc.pending = true;
        return acc;
      }

      acc.cost += hours * hourlyRate;
      return acc;
    },
    { cost: 0, pending: false, hasHours: false }
  );

  const actualLaborCost = actualLaborResult.cost;
  const actualLaborPending = jobData.timeEntries.length === 0 || (actualLaborResult.hasHours && actualLaborResult.pending);
  const actualExpensesPending = nonSubcontractorExpenses.length === 0;
  const actualSubcontractorPending = subcontractorExpenses.length === 0;

  const actualTotalCost = actualLaborCost + actualExpensesTotal + actualSubcontractorCost;
  const actualProfit = contractOrTotalAmount - actualTotalCost;
  const actualMarginPct = contractOrTotalAmount > 0 ? (actualProfit / contractOrTotalAmount) * 100 : 0;

  const invoiceTotal = jobData.invoices.reduce((sum, i) => sum + Number(i.total), 0);
  const paymentsTotal = jobData.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = contractOrTotalAmount - paymentsTotal;

  const knownAttachments = [
    ...jobData.expenses
      .filter((e) => !!e.receiptUrl)
      .map((e) => ({ id: `expense-${e.id}`, name: e.vendor || "Expense receipt", url: e.receiptUrl! })),
    ...jobData.payments
      .filter((p) => !!p.attachmentUrl)
      .map((p) => ({ id: `payment-${p.id}`, name: `Payment ${formatDateTime(p.dateReceived)}`, url: p.attachmentUrl! })),
  ];

  const street = job.address || "Pending";
  const city = job.city || "Pending";
  const state = job.state || "Pending";
  const zipCode = job.zipCode || "Pending";
  const addressPieces = [job.address, job.city, job.state, job.zipCode].filter(Boolean);
  const fullAddress = addressPieces.join(", ");
  const googleMapsUrl = fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}` : "";

  const selectCustomer = (customer: {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
  }) => {
    setEditForm((f) => ({ ...f, customerId: customer.id }));
    setCustomerSearch(customer.name);
    setShowCustomerResults(false);
  };

  return (
    <>
      <PageHeader
        title={job.name}
        description={`${job.estimateNumber} · ${jobData.customer.name}`}
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

      <div className="mb-4 flex flex-wrap gap-2">
        {(jobData.specialPayEnabled || jobData.isIslandJob) ? (
          <span className="badge bg-emerald-100 text-emerald-700">
            SPECIAL PAY {Number(jobData.hourlyRateAdjustment || (jobData.isIslandJob ? 2 : 0)) > 0 ? `+$${Number(jobData.hourlyRateAdjustment || (jobData.isIslandJob ? 2 : 0)).toFixed(2)}/hr` : "+$0.00/hr"}
          </span>
        ) : null}
        {jobData.travelPayEnabled ? <span className="badge bg-blue-100 text-blue-700">Travel Paid</span> : null}
        {jobData.travelPayEnabled ? <span className="badge bg-slate-100 text-slate-700">Travel Hours {Number(jobData.defaultTravelHours || 0).toFixed(2)}</span> : null}
      </div>

      <div className="card p-2 mb-4">
        <div className="flex flex-wrap gap-2">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={[
                "px-3 py-2 rounded-md text-sm font-medium transition",
                activeTab === tab.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="card p-5 md:col-span-2">
            <h2 className="text-base font-semibold mb-3">Overview</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Stat label="Customer" value={jobData.customer.name} />
              <Stat label="Street" value={street} />
              <Stat label="City" value={city} />
              <Stat label="State" value={state} />
              <Stat label="Zip Code" value={zipCode} />
              <Stat label="Status" value={job.status} />
              <Stat label="Contract" value={formatCurrency(contractOrTotalAmount)} />
              <Stat label="Estimated total cost" value={formatCurrency(estimatedTotalCost)} />
              <Stat label="Estimated margin" value={`${estimatedMarginPct.toFixed(1)}%`} />
              <Stat label="Actual total cost" value={formatCurrency(actualTotalCost)} />
              <Stat label="Actual margin" value={`${actualMarginPct.toFixed(1)}%`} />
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="text-xs text-slate-500 uppercase tracking-wide">Job Notes</div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{job.notes || "Pending"}</p>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="text-xs text-slate-500 uppercase tracking-wide">Address Actions</div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!fullAddress}
                  onClick={() => window.open(googleMapsUrl, "_blank", "noopener,noreferrer")}
                >
                  Open in Google Maps
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!fullAddress}
                  onClick={async () => {
                    if (!fullAddress) return;
                    await navigator.clipboard.writeText(fullAddress);
                    toast.success("Address copied");
                  }}
                >
                  Copy Address
                </button>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold mb-2">Assigned Crew</h2>
            {jobData.assignments.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody assigned yet.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {jobData.assignments.map((a) => (
                  <li key={a.id}>{a.user.name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold mb-2">Quick Actions</h2>
            <div className="space-y-2">
              <button className="btn btn-secondary w-full" type="button" onClick={openEditModal}>Edit Job</button>
              <div>
                <label className="label">Update status</label>
                <select
                  className="input"
                  value={job.status}
                  onChange={(e) => setStatus.mutate({ id, status: e.target.value as any })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "budget" && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-3">Budget</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <Stat label="Materials budget" value={formatCurrency(estimatedMaterials)} />
              <Stat label="Labor budget" value={formatCurrency(estimatedLabor)} />
              <Stat label="Subcontractor budget" value={estimatedSubcontractorPending ? `${formatCurrency(estimatedSubcontractor)} (Pending)` : formatCurrency(estimatedSubcontractor)} />
              <Stat label="Estimated total cost" value={formatCurrency(estimatedTotalCost)} />
              <Stat label="Contract amount" value={formatCurrency(contractOrTotalAmount)} />
              <Stat label="ROI estimate" value={`${estimatedMarginPct.toFixed(1)}%`} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <ComingSoonCard title="Equipment" description="Equipment budgeting tools are coming soon." />
            <ComingSoonCard title="Budget Line Items" description="Detailed editable line items are coming soon." />
          </div>
        </div>
      )}

      {activeTab === "scope" && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-2">Scope of Work</h2>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.scopeOfWork || "Pending"}</p>
          </div>

          <div className="card p-5">
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

            {jobData.paintColors.length === 0 ? (
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
                    {jobData.paintColors.map((color) => {
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

          <div className="grid md:grid-cols-2 gap-4">
            <ComingSoonCard title="AI Scope Builder" description="AI-assisted scope drafting is coming soon." />
            {job.priceBreakdownJson ? (
              <div className="card p-5">
                <h3 className="text-base font-semibold mb-2">Price Breakdown</h3>
                <pre className="text-xs bg-slate-50 border border-slate-200 rounded-md p-3 overflow-auto">
                  {JSON.stringify(job.priceBreakdownJson, null, 2)}
                </pre>
              </div>
            ) : (
              <ComingSoonCard title="Price Breakdown" description="Interactive price breakdown tools are coming soon." />
            )}
          </div>
        </div>
      )}

      {activeTab === "tracking" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Time Entries</h2>
              {jobData.timeEntries.length === 0 ? (
                <p className="text-sm text-slate-500">No time logged.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {jobData.timeEntries.slice(0, 12).map((t) => (
                    <li key={t.id} className="py-2 flex justify-between">
                      <span>{t.user.name}</span>
                      <span className="text-slate-500">
                        {t.paidHours != null
                          ? `${Number(t.paidHours).toFixed(2)}h`
                          : t.hoursWorked != null
                            ? `${Number(t.hoursWorked).toFixed(2)}h`
                            : "in progress"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Labor Cost</h2>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Actual labor cost" value={actualLaborPending ? `${formatCurrency(actualLaborCost)} (Pending)` : formatCurrency(actualLaborCost)} />
                <Stat label="Tracked entries" value={String(jobData.timeEntries.length)} />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Expenses</h2>
              {nonRejectedExpenses.length === 0 ? (
                <p className="text-sm text-slate-500">No expenses tracked yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {nonRejectedExpenses.slice(0, 12).map((e) => (
                    <li key={e.id} className="py-2 flex items-start justify-between gap-3">
                      <span className="text-slate-700">{e.vendor || "Expense"} · {e.category}</span>
                      <span>{formatCurrency(Number(e.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Receipts</h2>
              {jobData.expenses.filter((e) => !!e.receiptUrl).length === 0 ? (
                <p className="text-sm text-slate-500">No receipts uploaded yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {jobData.expenses.filter((e) => !!e.receiptUrl).slice(0, 12).map((e) => (
                    <li key={e.id} className="py-2 flex items-start justify-between gap-3">
                      <span>{e.vendor || "Receipt"}</span>
                      <a className="text-brand-700 hover:underline" href={e.receiptUrl!} target="_blank" rel="noreferrer">Open</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Subcontractors</h2>
              {subcontractorExpenses.length === 0 ? (
                <p className="text-sm text-slate-500">No subcontractor costs tracked yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {subcontractorExpenses.slice(0, 8).map((e) => (
                    <li key={e.id} className="py-2 flex justify-between">
                      <span>{e.vendor || "Subcontractor"}</span>
                      <span>{formatCurrency(Number(e.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <ComingSoonCard title="Progress Photos" description="Progress photo timeline is coming soon." />
            <ComingSoonCard title="Daily Logs" description="Daily work logs are coming soon." />
          </div>
        </div>
      )}

      {activeTab === "financials" && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-3">Financial Summary</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <Stat label="Contract amount" value={formatCurrency(contractOrTotalAmount)} />
              <Stat label="Change orders" value="Coming Soon" />
              <Stat label="Invoices total" value={formatCurrency(invoiceTotal)} />
              <Stat label="Payments received" value={formatCurrency(paymentsTotal)} />
              <Stat label="Balance due" value={formatCurrency(balanceDue)} />
              <Stat label="Actual costs" value={formatCurrency(actualTotalCost)} />
              <Stat label="Gross profit" value={formatCurrency(actualProfit)} />
              <Stat label="Net profit" value={formatCurrency(actualProfit)} />
              <Stat label="Margin" value={`${actualMarginPct.toFixed(1)}%`} />
              <Stat label="ROI" value={`${actualMarginPct.toFixed(1)}%`} />
              <RoiFlag profit={actualProfit} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Invoices</h2>
              {jobData.invoices.length === 0 ? (
                <p className="text-sm text-slate-500">No invoices yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {jobData.invoices.map((i) => (
                    <li key={i.id} className="py-2 flex justify-between">
                      <span>{i.invoiceNumber} · {i.title}</span>
                      <span>{formatCurrency(Number(i.total))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Payments</h2>
              {jobData.payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {jobData.payments.map((p) => (
                    <li key={p.id} className="py-2 flex justify-between">
                      <span>{p.method} · {formatDateTime(p.dateReceived)}</span>
                      <span>{formatCurrency(Number(p.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <ComingSoonCard title="Proposal" description="Linked proposal document is coming soon." />
            <ComingSoonCard title="Signed Contract" description="Signed contract storage is coming soon." />
            <ComingSoonCard title="Permits" description="Permit tracking is coming soon." />
            <ComingSoonCard title="Warranty" description="Warranty documents are coming soon." />
            <ComingSoonCard title="Photos" description="Project photo documents are coming soon." />
            <div className="card p-5">
              <h3 className="text-base font-semibold mb-2">Uploaded Files</h3>
              {knownAttachments.length === 0 ? (
                <p className="text-sm text-slate-500">No uploaded files yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {knownAttachments.slice(0, 12).map((f) => (
                    <li key={f.id} className="py-2 flex justify-between gap-2">
                      <span className="text-slate-700 truncate">{f.name}</span>
                      <a className="text-brand-700 hover:underline" href={f.url} target="_blank" rel="noreferrer">Open</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

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
                  <div className="text-xs text-slate-500 mt-1">
                    Selected: {customers.data?.find((c) => c.id === editForm.customerId)?.name || jobData.customer.name}
                  </div>
              </div>

              <div className="col-span-2">
                <label className="label">Scope of work</label>
                <textarea
                  className="input min-h-24"
                  value={editForm.scopeOfWork}
                  onChange={(e) => setEditForm((f) => ({ ...f, scopeOfWork: e.target.value }))}
                />
              </div>

              <div className="col-span-2">
                <label className="label">Job Notes</label>
                <textarea
                  className="input min-h-24"
                  value={editForm.jobNotes}
                  onChange={(e) => setEditForm((f) => ({ ...f, jobNotes: e.target.value }))}
                />
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={editForm.specialPayEnabled} onChange={(e) => setEditForm((f) => ({ ...f, specialPayEnabled: e.target.checked }))} />
                  Special Pay Job
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={editForm.travelPayEnabled} onChange={(e) => setEditForm((f) => ({ ...f, travelPayEnabled: e.target.checked }))} />
                  Paid Travel
                </label>
                {editForm.specialPayEnabled ? (
                  <Field label="Hourly rate adjustment" value={editForm.hourlyRateAdjustment} onChange={(v) => setEditForm((f) => ({ ...f, hourlyRateAdjustment: v }))} prefix="+" />
                ) : <div />}
                <Field label="Default travel hours" value={editForm.defaultTravelHours} onChange={(v) => setEditForm((f) => ({ ...f, defaultTravelHours: v }))} />
                <div>
                  <label className="label">Travel rate type</label>
                  <select className="input" value={editForm.travelRateType} onChange={(e) => setEditForm((f) => ({ ...f, travelRateType: e.target.value as "regular" | "island" | "special" | "custom" }))}>
                    <option value="regular">Regular rate</option>
                    <option value="special">Special rate (includes the job adjustment)</option>
                    <option value="custom">Custom rate</option>
                  </select>
                </div>
                {editForm.travelRateType === "custom" ? (
                  <Field label="Custom travel rate" value={editForm.customTravelRate} onChange={(v) => setEditForm((f) => ({ ...f, customTravelRate: v }))} />
                ) : null}
              </div>

              <Field label="Materials budget" value={editForm.materialsBudget} onChange={(v) => setEditForm((f) => ({ ...f, materialsBudget: v }))} />
              <Field label="Labor budget" value={editForm.laborBudget} onChange={(v) => setEditForm((f) => ({ ...f, laborBudget: v }))} />
              <Field label="Subcontractor budget" value={editForm.subcontractorBudget} onChange={(v) => setEditForm((f) => ({ ...f, subcontractorBudget: v }))} />
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

function RoiFlag({ profit }: { profit: number }) {
  const profitable = profit >= 0;
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">ROI Status</div>
      <div className={`text-sm font-semibold mt-1 ${profitable ? "text-emerald-700" : "text-rose-700"}`}>
        {profitable ? "Profitable" : "Losing Money"}
      </div>
    </div>
  );
}

function ComingSoonCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-500">Coming Soon</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
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
