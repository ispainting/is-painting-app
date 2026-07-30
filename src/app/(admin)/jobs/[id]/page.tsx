"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExpenseIntakePanel } from "@/components/expenses/ExpenseIntakePanel";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  const { data: me } = api.auth.me.useQuery();
  const { data: job, isLoading } = api.jobs.byId.useQuery({ id });
  const { data: budgetPayload, isLoading: isBudgetLoading } = api.jobs.budget.useQuery({ id });
  const { data: financialSummary, isLoading: isFinancialSummaryLoading } = api.jobs.financialSummary.useQuery({ id });
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isBudgetEditOpen, setIsBudgetEditOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    laborBudget: 0,
    materialsBudget: 0,
    equipmentBudget: 0,
    subcontractorBudget: 0,
    travelBudget: 0,
    otherBudget: 0,
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const customers = api.customers.list.useQuery(
    { search: customerSearch.trim() || undefined },
    { enabled: isEditOpen }
  );

  useEffect(() => {
    if (!budgetPayload) return;
    setBudgetForm({
      laborBudget: Number(budgetPayload.budgets.laborBudget || 0),
      materialsBudget: Number(budgetPayload.budgets.materialsBudget || 0),
      equipmentBudget: Number(budgetPayload.budgets.equipmentBudget || 0),
      subcontractorBudget: Number(budgetPayload.budgets.subcontractorBudget || 0),
      travelBudget: Number(budgetPayload.budgets.travelBudget || 0),
      otherBudget: Number(budgetPayload.budgets.otherBudget || 0),
    });
  }, [budgetPayload]);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [showAddExpensePanel, setShowAddExpensePanel] = useState(false);
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

  const archiveJob = api.jobs.softDelete.useMutation({
    onSuccess: () => {
      utils.jobs.byId.invalidate({ id });
      utils.jobs.list.invalidate();
      toast.success("Job archived");
      setConfirmDeleteOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const updateBudget = api.jobs.updateBudget.useMutation({
    onSuccess: () => {
      toast.success("Budget updated");
      utils.jobs.budget.invalidate({ id });
      utils.jobs.financialSummary.invalidate({ id });
      utils.jobs.byId.invalidate({ id });
      setIsBudgetEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !job) return <div className="text-slate-500">Loading…</div>;
  const jobData = job as typeof job & {
    customer: { name: string };
    assignments: Array<{ id: number; user: { name: string }; userId: number }>;
    expenses: Array<{ id: number; status: string; category: string; amount: string | number; receiptUrl: string | null; vendor: string | null; description: string | null; expenseDate: string | Date }>;
    timeEntries: Array<{
      id: number;
      paidHours: string | number | null;
      hoursWorked: string | number | null;
      grossHours: string | number | null;
      travelHours: string | number | null;
      reviewStatus: "pending" | "approved" | "rejected";
      rateType: "regular" | "island" | "special" | "travel" | "overtime";
      clockOut: string | null;
      clockIn: string;
      user: { name: string; hourlyRate: string | number | null };
    }>;
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

  const categoryRows = financialSummary?.budgetHealth ?? [];
  const summaryCategoryRows = financialSummary?.categoryBreakdown ?? [];
  const totalBudget = Number(financialSummary?.totalBudget ?? 0);
  const hasNoBudgetConfigured = totalBudget === 0;
  const totalActualSpent = Number(financialSummary?.actualTotalCost ?? 0);
  const totalCommitted = Number(financialSummary?.committedTotalCost ?? 0);
  const remainingBudget = Number(financialSummary?.remainingBudget ?? 0);

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
            <button className="btn bg-rose-600 text-white hover:bg-rose-700" type="button" onClick={() => setConfirmDeleteOpen(true)}>
              Delete Job
            </button>
            <select
              className="input w-auto"
              value={job.status}
              onChange={(e) => setStatus.mutate({ id, status: e.target.value as any })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}

              <ConfirmDialog
                open={confirmDeleteOpen}
                title="Delete Job"
                message="Are you sure you want to delete this job? This cannot be undone."
                confirmLabel="Delete Job"
                destructive
                isPending={archiveJob.isPending}
                onCancel={() => setConfirmDeleteOpen(false)}
                onConfirm={() => archiveJob.mutate({ id })}
              />
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Budget</h2>
              {me?.role === "admin" ? (
                <button className="btn btn-primary" type="button" onClick={() => setIsBudgetEditOpen((open) => !open)}>
                  {hasNoBudgetConfigured ? "Set Budget" : "Edit Budget"}
                </button>
              ) : null}
            </div>

            {isBudgetLoading || isFinancialSummaryLoading ? (
              <p className="text-sm text-slate-500">Loading budget...</p>
            ) : (
              <>
                <div className="grid md:grid-cols-4 gap-4 mb-4">
                  <Stat label="Total Budget" value={formatCurrency(totalBudget)} />
                  <Stat label="Actual Spent" value={formatCurrency(totalActualSpent)} />
                  <Stat label="Committed Cost" value={formatCurrency(totalCommitted)} />
                  <Stat label="Remaining Budget" value={formatCurrency(remainingBudget)} />
                </div>

                {hasNoBudgetConfigured ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-700">No budget configured yet.</p>
                    {me?.role === "admin" ? (
                      <button className="btn btn-primary mt-3" type="button" onClick={() => setIsBudgetEditOpen(true)}>
                        Set Budget
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 font-medium">Budget</th>
                        <th className="px-3 py-2 font-medium">Actual Spent</th>
                        <th className="px-3 py-2 font-medium">Pending/Committed</th>
                        <th className="px-3 py-2 font-medium">Remaining</th>
                        <th className="px-3 py-2 font-medium">Percentage Used</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryRows.map((row) => {
                        const progress = row.committedUtilizationPct;
                        const status = budgetStatusLabel(row.status);
                        const statusClass = budgetStatusClass(row.status);
                        const progressClass = budgetProgressClass(row.status);
                        return (
                          <tr key={row.category} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-2 font-medium text-slate-800">{budgetCategoryLabel(row.category)}</td>
                            <td className="px-3 py-2">{formatCurrency(row.budgetAmount)}</td>
                            <td className="px-3 py-2">{formatCurrency(row.actualCost)}</td>
                            <td className="px-3 py-2">
                              <div>{formatCurrency(row.pendingCost)} pending</div>
                              <div className="text-xs text-slate-500">{formatCurrency(row.committedCost)} committed</div>
                            </td>
                            <td className="px-3 py-2">{formatCurrency(row.remainingCommittedBudget)}</td>
                            <td className="px-3 py-2 min-w-44">
                              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                                <span>{progress.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-200">
                                <div
                                  className={`h-2 rounded-full ${progressClass}`}
                                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>{status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {isBudgetEditOpen && me?.role === "admin" ? (
            <div className="card p-5">
              <h3 className="text-base font-semibold mb-3">Edit Budget</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Labor" value={budgetForm.laborBudget} onChange={(v) => setBudgetForm((f) => ({ ...f, laborBudget: v }))} />
                <Field label="Paint & Materials" value={budgetForm.materialsBudget} onChange={(v) => setBudgetForm((f) => ({ ...f, materialsBudget: v }))} />
                <Field label="Equipment & Tools" value={budgetForm.equipmentBudget} onChange={(v) => setBudgetForm((f) => ({ ...f, equipmentBudget: v }))} />
                <Field label="Subcontractors" value={budgetForm.subcontractorBudget} onChange={(v) => setBudgetForm((f) => ({ ...f, subcontractorBudget: v }))} />
                <Field label="Travel & Ferry" value={budgetForm.travelBudget} onChange={(v) => setBudgetForm((f) => ({ ...f, travelBudget: v }))} />
                <Field label="Other" value={budgetForm.otherBudget} onChange={(v) => setBudgetForm((f) => ({ ...f, otherBudget: v }))} />
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button className="btn btn-secondary" type="button" onClick={() => setIsBudgetEditOpen(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={updateBudget.isPending}
                  onClick={() => updateBudget.mutate({ id, data: budgetForm })}
                >
                  {updateBudget.isPending ? "Saving..." : "Save Budget"}
                </button>
              </div>
            </div>
          ) : null}
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Expenses</h2>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowAddExpensePanel((prev) => !prev)}
                >
                  + Add Expense
                </button>
              </div>

              {showAddExpensePanel && (
                <div className="mb-4 border-b border-slate-200 pb-4">
                  <ExpenseIntakePanel
                    fixedJobId={id}
                    fixedJobName={job.name}
                    onCancel={() => setShowAddExpensePanel(false)}
                    onSaved={() => setShowAddExpensePanel(false)}
                  />
                </div>
              )}

              {nonRejectedExpenses.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">No expenses tracked yet.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowAddExpensePanel(true)}
                  >
                    + Add Expense
                  </button>
                </div>
              ) : (
                <ul className="text-sm divide-y">
                  {nonRejectedExpenses.slice(0, 12).map((e) => (
                    <li key={e.id} className="py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-800">{e.vendor || "Expense"}</p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(e.expenseDate)} · {e.category.replaceAll("_", " ")}
                          </p>
                          {e.description && <p className="text-xs text-slate-600 mt-1">{e.description}</p>}
                          {e.receiptUrl && (
                            <a className="mt-1 inline-block text-xs text-brand-700 hover:underline" href={e.receiptUrl} target="_blank" rel="noreferrer">
                              View receipt
                            </a>
                          )}
                        </div>
                        <span className="font-medium">{formatCurrency(Number(e.amount))}</span>
                      </div>
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
            <h2 className="text-base font-semibold mb-3">Financial Overview</h2>
            {isFinancialSummaryLoading || !financialSummary ? (
              <p className="text-sm text-slate-500">Loading financial summary...</p>
            ) : (
              <div className="grid md:grid-cols-4 gap-4">
                <Stat label="Contract Value" value={formatCurrency(financialSummary.contractValue)} />
                <Stat label="Total Budget" value={formatCurrency(financialSummary.totalBudget)} />
                <Stat label="Actual Cost" value={formatCurrency(financialSummary.actualTotalCost)} />
                <Stat label="Committed Cost" value={formatCurrency(financialSummary.committedTotalCost)} />
                <Stat label="Remaining Budget" value={formatCurrency(financialSummary.remainingBudget)} />
                <Stat label="Gross Profit" value={formatCurrency(financialSummary.grossProfit)} />
                <Stat label="Gross Margin" value={`${Number(financialSummary.grossMargin).toFixed(1)}%`} />
                <Stat label="Projected" value={financialSummary.projectedFinalCost == null ? "Not enough data yet." : formatCurrency(financialSummary.projectedFinalCost)} />
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-base font-semibold mb-3">Budget vs Actual</h3>
              {isFinancialSummaryLoading || !financialSummary ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Total Budget</span><span>{formatCurrency(financialSummary.totalBudget)}</span></div>
                  <div className="flex justify-between"><span>Actual</span><span>{formatCurrency(financialSummary.actualTotalCost)}</span></div>
                  <div className="flex justify-between"><span>Pending</span><span>{formatCurrency(financialSummary.pendingLaborCost + financialSummary.pendingExpenseCost)}</span></div>
                  <div className="flex justify-between font-medium border-t border-slate-200 pt-2"><span>Committed</span><span>{formatCurrency(financialSummary.committedTotalCost)}</span></div>
                </div>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-base font-semibold mb-3">Labor and Expense Detail</h3>
              {isFinancialSummaryLoading || !financialSummary ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Actual Labor</span><span>{formatCurrency(financialSummary.actualLaborCost)}</span></div>
                  <div className="flex justify-between"><span>Pending Labor</span><span>{formatCurrency(financialSummary.pendingLaborCost)}</span></div>
                  <div className="flex justify-between"><span>Actual Expenses</span><span>{formatCurrency(financialSummary.actualExpenseCost)}</span></div>
                  <div className="flex justify-between"><span>Pending Expenses</span><span>{formatCurrency(financialSummary.pendingExpenseCost)}</span></div>
                  <div className="flex justify-between"><span>Subcontractor Cost</span><span>{formatCurrency(financialSummary.subcontractorCost)}</span></div>
                  <div className="flex justify-between font-medium border-t border-slate-200 pt-2"><span>Gross Margin</span><span>{Number(financialSummary.grossMargin).toFixed(1)}%</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-base font-semibold mb-3">Six-Category Breakdown</h3>
            {isFinancialSummaryLoading || !financialSummary ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Budget</th>
                      <th className="px-3 py-2 font-medium">Actual</th>
                      <th className="px-3 py-2 font-medium">Pending</th>
                      <th className="px-3 py-2 font-medium">Committed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financialSummary.categoryBreakdown.map((row) => (
                      <tr key={row.category} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{budgetCategoryLabel(row.category)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.budgetAmount)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.actualCost)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.pendingCost)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.committedCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-base font-semibold mb-3">Over-Budget Warnings</h3>
              {isFinancialSummaryLoading || !financialSummary ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : financialSummary.warnings.length === 0 ? (
                <p className="text-sm text-slate-500">No warnings.</p>
              ) : (
                <ul className="text-sm space-y-2">
                  {financialSummary.warnings.map((warning, idx) => (
                    <li key={`${warning.code}-${idx}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      {warning.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-base font-semibold mb-3">Job Health</h3>
              {isFinancialSummaryLoading || !financialSummary ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Overall</span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${healthBadgeClass(financialSummary.health.overall)}`}>
                      {financialSummary.health.overall.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Score</span>
                    <span className="text-sm font-semibold text-slate-900">{Number(financialSummary.health.score).toFixed(1)} / 100</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Margin Health</span>
                    <span className="text-sm font-medium text-slate-900">{financialSummary.health.marginHealth}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    {financialSummary.health.categoryHealth.map((row) => (
                      <div key={row.category} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{budgetCategoryLabel(row.category)}</span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${budgetStatusClass(row.status)}`}>
                          {budgetStatusLabel(row.status)} ({Number(row.utilizationPct).toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-base font-semibold mb-3">Budget Change History</h3>
              {isFinancialSummaryLoading || !financialSummary ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : financialSummary.budgetChangeHistory.length === 0 ? (
                <p className="text-sm text-slate-500">No budget changes recorded yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {financialSummary.budgetChangeHistory.slice(0, 12).map((change, idx) => (
                    <li key={`${change.field}-${change.at}-${idx}`} className="py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{budgetFieldLabel(change.field)}</span>
                        <span className="text-xs text-slate-500">{formatDateTime(change.at)}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {change.changedBy} changed {formatCurrency(change.previousValue)} to {formatCurrency(change.newValue)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h3 className="text-base font-semibold mb-3">Financial Timeline</h3>
              {isFinancialSummaryLoading || !financialSummary ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : financialSummary.timeline.length === 0 ? (
                <p className="text-sm text-slate-500">No timeline events yet.</p>
              ) : (
                <ul className="text-sm divide-y">
                  {financialSummary.timeline.slice(0, 14).map((event, idx) => (
                    <li key={`${event.type}-${event.at}-${idx}`} className="py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{event.title}</span>
                        <span className="text-xs text-slate-500">{formatDateTime(event.at)}</span>
                      </div>
                      <p className="text-xs text-slate-600">{event.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-base font-semibold mb-3">Category Drill-Down</h3>
            {isFinancialSummaryLoading || !financialSummary ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">
                <DrilldownSection title="Labor" rows={financialSummary.drilldown.labor.map((row) => ({
                  id: row.timeEntryId,
                  label: `${row.employee} (${row.payType})`,
                  sublabel: `${Number(row.hours).toFixed(2)}h - ${row.status}`,
                  amount: row.totalCost,
                }))} />
                <DrilldownSection title="Paint & Materials" rows={financialSummary.drilldown.paintMaterials.map((row) => ({
                  id: row.expenseId,
                  label: row.vendor,
                  sublabel: row.invoice || row.status,
                  amount: row.amount,
                }))} />
                <DrilldownSection title="Equipment & Tools" rows={financialSummary.drilldown.equipmentTools.map((row) => ({
                  id: row.expenseId,
                  label: row.vendor,
                  sublabel: row.invoice || row.status,
                  amount: row.amount,
                }))} />
                <DrilldownSection title="Subcontractors" rows={financialSummary.drilldown.subcontractors.map((row) => ({
                  id: row.expenseId,
                  label: row.vendor,
                  sublabel: row.invoice || row.status,
                  amount: row.amount,
                }))} />
                <DrilldownSection title="Travel & Ferry" rows={financialSummary.drilldown.travelFerry.map((row) => ({
                  id: row.expenseId,
                  label: row.vendor,
                  sublabel: row.invoice || row.status,
                  amount: row.amount,
                }))} />
                <DrilldownSection title="Other" rows={financialSummary.drilldown.other.map((row) => ({
                  id: row.expenseId,
                  label: row.vendor,
                  sublabel: row.invoice || row.status,
                  amount: row.amount,
                }))} />
              </div>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-base font-semibold mb-3">Labor Verification Report</h3>
            {isFinancialSummaryLoading || !financialSummary ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : financialSummary.laborVerification.rows.length === 0 ? (
              <p className="text-sm text-slate-500">No approved or pending labor entries yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Actual Total</div>
                    <div className="font-semibold text-slate-900">{formatCurrency(financialSummary.laborVerification.actualTotal)}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Pending Total</div>
                    <div className="font-semibold text-slate-900">{formatCurrency(financialSummary.laborVerification.pendingTotal)}</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Employee</th>
                        <th className="px-3 py-2 font-medium">Hours</th>
                        <th className="px-3 py-2 font-medium">Regular</th>
                        <th className="px-3 py-2 font-medium">Island</th>
                        <th className="px-3 py-2 font-medium">Travel</th>
                        <th className="px-3 py-2 font-medium">Special</th>
                        <th className="px-3 py-2 font-medium">Cost</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financialSummary.laborVerification.rows.map((row) => (
                        <tr key={row.timeEntryId} className="border-t border-slate-100">
                          <td className="px-3 py-2">{row.employee}</td>
                          <td className="px-3 py-2">{Number(row.hours).toFixed(2)}</td>
                          <td className="px-3 py-2">{formatCurrency(row.regular)}</td>
                          <td className="px-3 py-2">{formatCurrency(row.island)}</td>
                          <td className="px-3 py-2">{formatCurrency(row.travel)}</td>
                          <td className="px-3 py-2">{formatCurrency(row.special)}</td>
                          <td className="px-3 py-2 font-medium">{formatCurrency(row.cost)}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-base font-semibold mb-3">Recent Approved/Pending Labor Activity</h3>
            {jobData.timeEntries.length === 0 ? (
              <p className="text-sm text-slate-500">No labor activity yet.</p>
            ) : (
              <ul className="text-sm divide-y">
                {jobData.timeEntries
                  .filter((entry) => entry.reviewStatus === "approved" || entry.reviewStatus === "pending")
                  .slice(0, 10)
                  .map((entry) => (
                    <li key={entry.id} className="py-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-800">{entry.user.name}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(entry.clockIn)} · {entry.reviewStatus}</p>
                      </div>
                      <span className="text-slate-700">
                        {entry.paidHours != null
                          ? `${Number(entry.paidHours).toFixed(2)}h`
                          : entry.hoursWorked != null
                            ? `${Number(entry.hoursWorked).toFixed(2)}h`
                            : entry.grossHours != null
                              ? `${Number(entry.grossHours).toFixed(2)}h`
                              : "0.00h"}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
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
          <div className="card w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-6 pb-3 border-b border-slate-200">
              <div className="text-lg font-semibold">Edit Job</div>
            </div>
            <div className="grid grid-cols-2 gap-3 overflow-y-auto px-6 py-4 pr-5 flex-1">
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

              <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Payroll Settings</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={editForm.specialPayEnabled} onChange={(e) => setEditForm((f) => ({ ...f, specialPayEnabled: e.target.checked }))} />
                    Special Pay Job
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={editForm.travelPayEnabled} onChange={(e) => setEditForm((f) => ({ ...f, travelPayEnabled: e.target.checked }))} />
                    Paid Travel
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="Hourly rate adjustment (+$/hr)" value={editForm.hourlyRateAdjustment} onChange={(v) => setEditForm((f) => ({ ...f, hourlyRateAdjustment: v }))} disabled={!editForm.specialPayEnabled} />
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
              </div>

              <Field label="Materials budget" value={editForm.materialsBudget} onChange={(v) => setEditForm((f) => ({ ...f, materialsBudget: v }))} />
              <Field label="Labor budget" value={editForm.laborBudget} onChange={(v) => setEditForm((f) => ({ ...f, laborBudget: v }))} />
              <Field label="Subcontractor budget" value={editForm.subcontractorBudget} onChange={(v) => setEditForm((f) => ({ ...f, subcontractorBudget: v }))} />
              <Field label="Total amount" value={editForm.totalEstimate} onChange={(v) => setEditForm((f) => ({ ...f, totalEstimate: v }))} />
              <Field label="Contract amount" value={editForm.contractAmount} onChange={(v) => setEditForm((f) => ({ ...f, contractAmount: v }))} />
            </div>

            <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
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

function budgetCategoryLabel(category: string) {
  if (category === "labor") return "Labor";
  if (category === "paint_materials") return "Paint & Materials";
  if (category === "equipment_tools") return "Equipment & Tools";
  if (category === "subcontractors") return "Subcontractors";
  if (category === "travel_ferry") return "Travel & Ferry";
  return "Other";
}

function budgetStatusLabel(status: string) {
  if (status === "on_track") return "On Track";
  if (status === "watch") return "Watch";
  if (status === "at_risk") return "At Risk";
  return "Over Budget";
}

function budgetStatusClass(status: string) {
  if (status === "on_track") return "bg-emerald-100 text-emerald-700";
  if (status === "watch") return "bg-amber-100 text-amber-700";
  if (status === "at_risk") return "bg-orange-100 text-orange-700";
  return "bg-rose-100 text-rose-700";
}

function healthBadgeClass(status: string) {
  if (status === "healthy") return "bg-emerald-100 text-emerald-700";
  if (status === "watch") return "bg-amber-100 text-amber-700";
  if (status === "at_risk") return "bg-orange-100 text-orange-700";
  return "bg-rose-100 text-rose-700";
}

function budgetFieldLabel(field: string) {
  if (field === "laborBudget") return "Labor Budget";
  if (field === "materialsBudget") return "Materials Budget";
  if (field === "equipmentBudget") return "Equipment Budget";
  if (field === "subcontractorBudget") return "Subcontractor Budget";
  if (field === "travelBudget") return "Travel Budget";
  return "Other Budget";
}

function budgetProgressClass(status: string) {
  if (status === "on_track") return "bg-emerald-500";
  if (status === "watch") return "bg-amber-500";
  if (status === "at_risk") return "bg-orange-500";
  return "bg-rose-500";
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

function DrilldownSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: number; label: string; sublabel: string; amount: number }>;
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{title}</div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-slate-500">No items yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.slice(0, 6).map((row) => (
            <li key={row.id} className="px-3 py-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-slate-800">{row.label}</p>
                <p className="text-xs text-slate-500">{row.sublabel}</p>
              </div>
              <span className="font-medium text-slate-900">{formatCurrency(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function normalizeNumberInput(nextValue: string) {
  if (!nextValue.trim()) return 0;
  const parsed = Number(nextValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step="0.01"
        className="input"
        value={value}
        onChange={(e) => onChange(normalizeNumberInput(e.target.value))}
        onBlur={(e) => onChange(normalizeNumberInput(e.target.value))}
        disabled={disabled}
      />
    </div>
  );
}
