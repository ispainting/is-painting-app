"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";

export default function InventoryPage() {
  const { data, isLoading } = api.inventory.list.useQuery();
  return (
    <>
      <PageHeader title="Inventory" description="Materials and supplies" />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium text-right">Stock</th>
              <th className="px-4 py-2 font-medium text-right">Cost / unit</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : (
              data?.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{i.name}</td>
                  <td className="px-4 py-2 capitalize">{i.category}</td>
                  <td className="px-4 py-2">{i.unit}</td>
                  <td className={`px-4 py-2 text-right ${
                    Number(i.currentStock) < Number(i.minStockLevel) ? "text-red-600 font-medium" : ""
                  }`}>
                    {Number(i.currentStock).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(i.costPerUnit))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
