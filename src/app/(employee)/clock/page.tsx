"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { formatDateTime } from "@/lib/utils";
import { CLOCK_IN_NOT_AT_JOBSITE, formatClockDuration, normalizeClockInJobId } from "@/lib/clock";
import { toast } from "sonner";
import { InstallPrompt } from "@/components/employee/InstallPrompt";
import { BadgeCheck, BriefcaseBusiness, Clock3, Coffee, LogIn, LogOut, PlayCircle, TimerReset } from "lucide-react";

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

function formatOptionalHours(value: unknown) {
  if (value === null || value === undefined || value === "") return "Pending";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "Pending";
  return `${numeric.toFixed(2)}h`;
}

export default function ClockPage() {
  const utils = api.useUtils();
  const router = useRouter();
  const active = api.time.myActive.useQuery();
  const myEntries = api.time.myEntries.useQuery({ days: 14 });
  const jobs = api.jobs.clockable.useQuery();
  const me = api.auth.me.useQuery();

  const [jobId, setJobId] = useState(CLOCK_IN_NOT_AT_JOBSITE);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const startBreakMut = api.time.startBreak.useMutation({
    onSuccess: () => {
      toast.success("Break started");
      void utils.time.myActive.invalidate();
      void utils.time.myEntries.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const endBreakMut = api.time.endBreak.useMutation({
    onSuccess: () => {
      toast.success("Break ended");
      void utils.time.myActive.invalidate();
      void utils.time.myEntries.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const inMut = api.time.clockIn.useMutation({
    onSuccess: () => {
      toast.success("Clocked in");
      void utils.time.myActive.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const outMut = api.time.clockOut.useMutation({
    onSuccess: () => {
      toast.success("Clocked out");
      void utils.time.myActive.invalidate();
      void utils.time.myEntries.invalidate();
      setBreakMinutes(0);
      setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });
  const logout = api.auth.logout.useMutation({
    onSuccess: () => router.push("/login"),
  });

  const isIn = !!active.data;
  const isOnBreak = Boolean(active.data?.breakStartedAt && !active.data?.breakEndedAt);

  const liveSeconds = useMemo(() => {
    if (!active.data) return 0;
    const start = new Date(active.data.clockIn);
    if (isOnBreak && active.data.breakStartedAt) {
      return Math.max(0, Math.floor((now.getTime() - new Date(active.data.breakStartedAt).getTime()) / 1000));
    }
    return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  }, [active.data, isOnBreak, now]);

  const latestEntry = myEntries.data?.[0];
  const summaryEntry = active.data ?? latestEntry ?? null;
  const currentStatus = isIn ? (isOnBreak ? "on-break" : "working") : "clocked-out";

  const statusConfig = {
    "clocked-out": {
      label: "Clocked Out",
      icon: Clock3,
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    },
    working: {
      label: "Working",
      icon: PlayCircle,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    "on-break": {
      label: "On Break",
      icon: Coffee,
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    },
  } as const;

  const status = statusConfig[currentStatus];

  return (
    <>
      <InstallPrompt />
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">Hi {me.data?.name?.split(" ")[0] ?? "there"}</div>
            <div className="text-2xl font-semibold text-slate-900">Time clock</div>
          </div>
          <button onClick={() => logout.mutate()} className="text-sm font-medium text-slate-600">
            Sign out
          </button>
        </div>

        <div className={`rounded-2xl border p-5 shadow-sm ${status.tone}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-white/70 bg-white/70 p-2.5 shadow-sm">
                <status.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em]">Current status</div>
                <div className="text-2xl font-semibold">{status.label}</div>
              </div>
            </div>
            <div className="rounded-full bg-white/70 px-3 py-1 text-sm font-medium">
              {isIn ? "Live" : "Ready"}
            </div>
          </div>

          {isIn ? (
            <>
              <div className="mt-5 text-center">
                <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-600">
                  {isOnBreak ? "Break timer" : "Elapsed time"}
                </div>
                <div className="mt-2 text-5xl font-semibold tabular-nums text-slate-900 sm:text-6xl">
                  {formatClockDuration(liveSeconds)}
                </div>
              </div>

              <div className="mt-5 grid gap-3 rounded-2xl border border-white/70 bg-white/70 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {isOnBreak ? "Break started" : "Clocked in"}
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {formatDateTime(isOnBreak ? active.data?.breakStartedAt : active.data?.clockIn)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current job</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {active.data?.job?.name ?? "No job selected"}
                  </div>
                </div>
              </div>

              {active.data?.job?.customer?.name ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-700">
                  <BriefcaseBusiness className="h-4 w-4" />
                  <span>{active.data.job.customer.name}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/70 bg-white/70 p-4 text-sm text-slate-700">
              No active shift. Clock in when you are ready to start tracking.
            </div>
          )}
        </div>

        {!isIn ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Job (optional)</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none ring-0"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              <option value={CLOCK_IN_NOT_AT_JOBSITE}>— Not at a jobsite —</option>
              {jobs.data?.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm"
              disabled={inMut.isPending}
              onClick={async () => {
                const pos = await getCoords();
                if (!pos) {
                  toast.error("Location permission is required to clock in.");
                  return;
                }

                if (jobId === undefined || jobId === null || jobId === "") {
                  toast.error("Please select a job or choose “Not at a jobsite”.");
                  return;
                }

                inMut.mutate({
                  jobId: normalizeClockInJobId(jobId),
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  accuracy: pos.coords.accuracy,
                });
              }}
            >
              <LogIn className="h-5 w-5" />
              {inMut.isPending ? "Clocking in…" : "Clock In"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <TimerReset className="h-4 w-4" />
              Actions
            </div>
            {isOnBreak ? (
              <button
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-3 text-base font-semibold text-white shadow-sm"
                disabled={endBreakMut.isPending}
                onClick={() => endBreakMut.mutate()}
              >
                <Coffee className="h-5 w-5" />
                {endBreakMut.isPending ? "Ending break…" : "End Break"}
              </button>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-700"
                  disabled={startBreakMut.isPending}
                  onClick={() => startBreakMut.mutate()}
                >
                  <Coffee className="h-5 w-5" />
                  {startBreakMut.isPending ? "Starting break…" : "Start Break"}
                </button>
                <button
                  className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm"
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
                  <LogOut className="h-5 w-5" />
                  {outMut.isPending ? "Clocking out…" : "Clock Out"}
                </button>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Break minutes</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
              />
              <label className="mb-2 mt-3 block text-sm font-semibold text-slate-700">Notes</label>
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BadgeCheck className="h-4 w-4" />
            Today&apos;s summary
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
              <span className="font-medium">Clock-in time</span>
              <span className="text-right text-slate-600">{summaryEntry?.clockIn ? formatDateTime(summaryEntry.clockIn) : "Pending"}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
              <span className="font-medium">Current elapsed time</span>
              <span className="text-right text-slate-600">{isIn ? formatClockDuration(liveSeconds) : "No active shift"}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
              <span className="font-medium">Gross hours</span>
              <span className="text-right text-slate-600">{formatOptionalHours(summaryEntry?.grossHours ?? summaryEntry?.hoursWorked)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
              <span className="font-medium">Paid hours</span>
              <span className="text-right text-slate-600">{formatOptionalHours(summaryEntry?.paidHours)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
