"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { InstallPrompt } from "@/components/employee/InstallPrompt";

function getCoords(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

export default function ClockPage() {
  const utils = api.useUtils();
  const router = useRouter();
  const active = api.time.myActive.useQuery();
  const myEntries = api.time.myEntries.useQuery({ days: 14 });
  const jobs = api.jobs.list.useQuery();
  const me = api.auth.me.useQuery();

  const [jobId, setJobId] = useState<number | "">("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [notes, setNotes] = useState("");

  const inMut = api.time.clockIn.useMutation({
    onSuccess: () => {
      toast.success("Clocked in");
      utils.time.myActive.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const outMut = api.time.clockOut.useMutation({
    onSuccess: () => {
      toast.success("Clocked out");
      utils.time.myActive.invalidate();
      utils.time.myEntries.invalidate();
      setBreakMinutes(0);
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });
  const logout = api.auth.logout.useMutation({
    onSuccess: () => router.push("/login"),
  });

  const isIn = !!active.data;

 return (
  <>
    <InstallPrompt />
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm text-slate-500">Hi {me.data?.name?.split(" ")[0]}</div>
          <div className="text-xl font-semibold">Time clock</div>
        </div>
        <button onClick={() => logout.mutate()} className="text-sm text-slate-600">
          Sign out
        </button>
      </div>

      <div className={`card p-5 mb-4 text-center ${isIn ? "bg-green-50" : ""}`}>
        <div className="text-sm text-slate-500 mb-1">
          {isIn ? "Clocked in since" : "Currently clocked out"}
        </div>
        <div className="text-2xl font-bold mb-3">
          {isIn ? formatDateTime(active.data!.clockIn) : "—"}
        </div>
        {isIn && active.data?.job && (
          <div className="text-sm">at <strong>{active.data.job.name}</strong></div>
        )}
      </div>

      {!isIn ? (
        <div className="card p-5 mb-4">
          <label className="label">Job (optional)</label>
          <select
            className="input mb-3"
            value={jobId}
            onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— Not at a jobsite —</option>
            {jobs.data?.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
          <button
            className="btn btn-primary w-full"
            disabled={inMut.isPending}
            onClick={async () => {
            if (!jobId) {
  toast.error("Pick a job first");
  return;
}

const pos = await getCoords();

if (!pos) {
  toast.error("Location permission is required to clock in.");
  return;
}

inMut.mutate({
  jobId,
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
});
            }}
          >
            {inMut.isPending ? "Clocking in…" : "Clock IN"}
          </button>
        </div>
      ) : (
        <div className="card p-5 mb-4">
          <label className="label">Break minutes</label>
          <input
            type="number"
            min={0}
            className="input mb-3"
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
          />
          <label className="label">Notes</label>
          <textarea
            className="input mb-3"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            className="btn btn-danger w-full"
            disabled={outMut.isPending}
            onClick={async () => {
              const pos = await getCoords();
              outMut.mutate({
                lat: pos?.coords.latitude,
                lng: pos?.coords.longitude,
                accuracy: pos?.coords.accuracy,
                breakMinutes,
                notes,
              });
            }}
          >
            {outMut.isPending ? "Clocking out…" : "Clock OUT"}
          </button>
        </div>
      )}

      <div className="card p-5">
        <div className="text-sm font-medium mb-2">Recent (14 days)</div>
        {myEntries.data?.length === 0 ? (
          <div className="text-sm text-slate-500">No time logged yet.</div>
        ) : (
          <ul className="text-sm divide-y">
            {myEntries.data?.map((t) => (
              <li key={t.id} className="py-2">
                <div className="flex justify-between">
                  <span>{t.job?.name ?? "—"}</span>
                  <span className="text-slate-500">
                    {t.hoursWorked ? `${Number(t.hoursWorked).toFixed(2)}h` : "open"}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  {formatDateTime(t.clockIn)} → {t.clockOut ? formatDateTime(t.clockOut) : "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
