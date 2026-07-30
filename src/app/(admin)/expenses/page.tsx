"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExpenseIntakePanel } from "@/components/expenses/ExpenseIntakePanel";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const CATEGORY_OPTIONS = [
  "paint",
  "materials",
  "labor",
  "tools",
  "equipment",
  "rentals",
  "fuel",
  "subcontractor",
  "travel",
  "ferry",
  "payroll_related",
  "office",
  "advertising",
  "insurance",
  "vehicle",
  "meals",
  "other",
] as const;

const STATUS_OPTIONS = ["pending", "approved", "rejected"] as const;

export default function ExpensesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | (typeof STATUS_OPTIONS)[number]>("");
  const [category, setCategory] = useState<"" | (typeof CATEGORY_OPTIONS)[number]>("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "vendor" | "status" | "createdAt">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAddExpense, setShowAddExpense] = useState(false);

  const utils = api.useUtils();
  const listQuery = api.expenses.list.useQuery({
    search: search || undefined,
    status: status || undefined,
    category: category || undefined,
    sortBy,
    sortDir,
  });
  const statsQuery = api.expenses.stats.useQuery();

  const approve = api.expenses.approve.useMutation({
    onSuccess: () => {
      void utils.expenses.list.invalidate();
      void utils.expenses.stats.invalidate();
      toast.success("Approved");
    },
  });

  const reject = api.expenses.reject.useMutation({
    onSuccess: () => {
      void utils.expenses.list.invalidate();
      void utils.expenses.stats.invalidate();
      toast.success("Rejected");
    },
  });

  const expenses = listQuery.data ?? [];
  const isLoading = listQuery.isLoading;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Track spend and manage receipt uploads."
        actions={
          <button className="btn btn-primary" onClick={() => setShowAddExpense(true)}>
            Add Expense
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Expenses</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{formatCurrency(statsQuery.data?.totalExpenses ?? 0)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending Uploads</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{String(statsQuery.data?.pendingUploads ?? 0)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Expense Count</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{String(statsQuery.data?.expenseCount ?? 0)}</p>
        </div>
      </div>

      {showAddExpense && (
        <div className="mb-6">
          <ExpenseIntakePanel
            onCancel={() => setShowAddExpense(false)}
            onSaved={() => setShowAddExpense(false)}
          />
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="input md:col-span-2"
            placeholder="Search vendor, description, notes, or job"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "" | (typeof STATUS_OPTIONS)[number])}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as "" | (typeof CATEGORY_OPTIONS)[number])}>
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt.replaceAll("_", " ")}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "vendor" | "status" | "createdAt") }>
              <option value="date">Sort: Date</option>
              <option value="amount">Sort: Amount</option>
              <option value="vendor">Sort: Vendor</option>
              <option value="status">Sort: Status</option>
              <option value="createdAt">Sort: Created</option>
            </select>
            <select className="input" value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium text-right">Amount</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Job</th>
              <th className="px-4 py-2 font-medium">Receipt</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-slate-500">Loading...</td></tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-base font-medium text-slate-900">No expenses yet.</p>
                  <div className="flex justify-center gap-2 mt-4">
                    <button className="btn btn-primary" onClick={() => setShowAddExpense(true)}>Add Expense</button>
                  </div>
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{e.vendor || "-"}</td>
                  <td className="px-4 py-2">{formatDate(e.expenseDate)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(e.amount))}</td>
                  <td className="px-4 py-2 capitalize">{e.category.replaceAll("_", " ")}</td>
                  <td className="px-4 py-2">{e.job?.name || "-"}</td>
                  <td className="px-4 py-2">
                    {e.attachments[0] ? (
                      <a className="text-brand-700 hover:underline" href={`/api/expenses/attachments/${e.attachments[0].id}/preview`} target="_blank" rel="noreferrer">Open</a>
                    ) : (
                      <span className="text-slate-500">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2 capitalize">{e.status}</td>
                  <td className="px-4 py-2 text-right">
                    {e.status === "pending" && (
                      <div className="flex gap-1 justify-end">
                        <button className="btn btn-secondary text-xs" onClick={() => approve.mutate({ id: e.id })}>Approve</button>
                        <button className="btn btn-danger text-xs" onClick={() => reject.mutate({ id: e.id })}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
