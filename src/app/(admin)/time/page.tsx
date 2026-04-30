"use client";

import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";

export default function TimePage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.time.listAll.useQuery();
  const approve = api.time.approve.useMutation({
    onSuccess: () => {
      utils.time.listAll.invalidate();
      toast.success("Approved");
    },
  });

  return (
    <>
      <PageHeader title="Time" description="Last 30 days of clock-ins/outs" />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Job</th>
              <th className="px-4 py-2 font-medium">Clock in</th>
              <th className="px-4 py-2 font-medium">Clock out</th>
              <th className="px-4 py-2 font-medium text-right">Hours</th>
              <th className="px-4 py-2 font-medium">Approved</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : (
              data?.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{t.user.name}</td>
                  <td className="px-4 py-2">{t.job?.name ?? "—"}</td>
                  <td className="px-4 py-2">{formatDateTime(t.clockIn)}</td>
                  <td className="px-4 py-2">{t.clockOut ? formatDateTime(t.clockOut) : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {t.hoursWorked ? Number(t.hoursWorked).toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {t.approvedById ? (
                      <span className="badge bg-green-100 text-green-700">Yes</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-700">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!t.approvedById && t.clockOut && (
                      <button
                        className="btn btn-secondary text-xs"
                        onClick={() => approve.mutate({ id: t.id })}
                      >
                        Approve
                      </button>
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
