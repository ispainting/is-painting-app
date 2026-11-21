"use client";

import { Bell, CheckCheck, CircleDollarSign, Megaphone } from "lucide-react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";

function notificationIcon(kind: string) {
  return kind === "monthly_leads" ? Megaphone : CircleDollarSign;
}

export default function NotificationsPage() {
  const utils = api.useUtils();
  const { data, isLoading, error } = api.notifications.list.useQuery(undefined, { refetchInterval: 60_000 });
  const markRead = api.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });
  const markAllRead = api.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Scheduled job profitability and lead reports from your CRM."
        actions={data?.unreadCount ? (
          <button className="btn btn-secondary inline-flex items-center gap-2" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        ) : undefined}
      />

      {isLoading ? <div className="card p-6 text-sm text-slate-500">Loading notifications…</div> : null}
      {error ? <div role="alert" className="card p-6 text-sm text-red-700">{error.message}</div> : null}
      {!isLoading && !error && data?.items.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Bell className="h-8 w-8 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-900">No reports yet</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">Your CRM will save a job profitability report every two days and a lead-source report at the start of each month.</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {data?.items.map((item) => {
          const Icon = notificationIcon(item.kind);
          return (
            <article key={item.id} className={`card overflow-hidden ${item.readAt ? "" : "border-blue-200"}`}>
              <div className="flex gap-3 p-4 sm:p-5">
                <div className={`mt-0.5 rounded-lg p-2 ${item.kind === "monthly_leads" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-900">{item.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</p>
                    </div>
                    {!item.readAt ? <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">New</span> : null}
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{item.body}</p>
                  {!item.readAt ? (
                    <button className="mt-3 text-sm font-semibold text-brand-700 hover:underline" onClick={() => markRead.mutate({ id: item.id })}>
                      Mark as read
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
