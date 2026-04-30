"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function ExpensesPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.expenses.list.useQuery();
  const approve = api.expenses.approve.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Approved");
    },
  });
  const reject = api.expenses.reject.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      toast.success("Rejected");
    },
  });

  return (
    <>
      <PageHeader title="Expenses" />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Job</th>
              <th className="px-4 py-2 font-medium">Submitted by</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : data?.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-slate-500">No expenses yet.</td></tr>
            ) : (
              data?.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{formatDate(e.expenseDate)}</td>
                  <td className="px-4 py-2">{e.vendor || "—"}</td>
                  <td className="px-4 py-2">{e.job?.name || "—"}</td>
                  <td className="px-4 py-2">{e.submittedBy.name}</td>
                  <td className="px-4 py-2 capitalize">{e.category}</td>
                  <td className="px-4 py-2 capitalize">{e.status}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(e.amount))}</td>
                  <td className="px-4 py-2 text-right">
                    {e.status === "pending" && (
                      <div className="flex gap-1 justify-end">
                        <button
                          className="btn btn-secondary text-xs"
                          onClick={() => approve.mutate({ id: e.id })}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-danger text-xs"
                          onClick={() => reject.mutate({ id: e.id })}
                        >
                          Reject
                        </button>
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
