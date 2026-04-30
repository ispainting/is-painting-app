"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function InvoicesPage() {
  const { data, isLoading } = api.invoices.list.useQuery();
  return (
    <>
      <PageHeader title="Invoices" />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Number</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium text-right">Total</th>
              <th className="px-4 py-2 font-medium text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : data?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-slate-500">No invoices yet. Create one from a job.</td></tr>
            ) : (
              data?.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{i.invoiceNumber}</td>
                  <td className="px-4 py-2">{i.title}</td>
                  <td className="px-4 py-2">{i.customer.name}</td>
                  <td className="px-4 py-2 capitalize">{i.status}</td>
                  <td className="px-4 py-2">{i.dueDate ? formatDate(i.dueDate) : "—"}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(i.total))}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(i.amountRemaining))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
