"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/lib/utils";
import { Clock3, Copy, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

type TabId = "payroll" | "overview" | "log";
type ReviewStatus = "pending" | "approved" | "rejected";

type TimeEntryRecord = {
  id: number;
  userId: number;
  clockIn: Date | string;
  clockOut: Date | string | null;
  breakMinutes: number;
  hoursWorked: number | string | null;
  grossHours: number | string | null;
  paidHours: number | string | null;
  rateType?: "regular" | "island" | "special" | "travel" | "overtime" | null;
  travelHours?: number | string | null;
  isManual: boolean;
  isIslandJob?: boolean;
  specialPayEnabled: boolean;
  hourlyRateAdjustment?: number | string | null;
  notes: string | null;
  reviewStatus: ReviewStatus;
  workType: string | null;
  user?: { id: number; name: string; hourlyRate: number | string | null };
  job?: { id: number; name: string; address: string | null; isIslandJob?: boolean; specialPayEnabled?: boolean; hourlyRateAdjustment?: number | string | null; travelPayEnabled?: boolean; defaultTravelHours?: number | string | null; travelRateType?: "regular" | "island" | "special" | "custom" | null; customTravelRate?: number | string | null } | null;
};

type EntryEditorState = {
  id: number | null;
  userId: number | null;
  jobId: number | null;
  date: string;
  clockInTime: string;
  clockOutTime: string;
  totalHours: string;
  travelHours: string;
  notes: string;
  managerNotes: string;
  rateType: "regular" | "island" | "special" | "travel" | "overtime";
};

function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getBiweeklyPeriod(date: Date) {
  const anchor = new Date("2026-01-05T00:00:00");
  const daysFromAnchor = Math.floor((date.getTime() - anchor.getTime()) / 86_400_000);
  const periodIndex = Math.floor(daysFromAnchor / 14);
  const start = addDays(anchor, periodIndex * 14);
  const end = addDays(start, 13);
  return { start, end };
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function entryHours(entry: TimeEntryRecord) {
  return toNumber(entry.paidHours ?? entry.hoursWorked ?? entry.grossHours ?? 0);
}

function travelEntryHours(entry: TimeEntryRecord) {
  return toNumber(entry.travelHours ?? entry.job?.defaultTravelHours ?? 0);
}

function hasSpecialPay(entry: TimeEntryRecord) {
  return Boolean(entry.specialPayEnabled || entry.isIslandJob || entry.job?.specialPayEnabled || entry.job?.isIslandJob);
}

function getRates(entry: TimeEntryRecord, fallbackRate: number) {
  const regularRate = toNumber(entry.user?.hourlyRate ?? fallbackRate);
  const rawAdjustment = hasSpecialPay(entry)
    ? toNumber(entry.hourlyRateAdjustment ?? entry.job?.hourlyRateAdjustment ?? 0)
    : 0;
  const legacyIslandSpecial = Boolean(entry.isIslandJob || entry.job?.isIslandJob);
  const adjustment = rawAdjustment > 0 ? rawAdjustment : (legacyIslandSpecial ? 2 : 0);
  const effectiveRate = regularRate + adjustment;
  const overtimeRate = effectiveRate * 1.5;
  return { regularRate, adjustment, effectiveRate, overtimeRate };
}

function getRateType(entry: TimeEntryRecord) {
  if (entry.rateType === "travel" || entry.workType === "travel") return "travel";
  if (entry.rateType === "overtime") return "overtime";
  if (entry.rateType === "island") return "special";
  if (entry.rateType === "special") return "special";
  if (hasSpecialPay(entry)) return "special";
  if (entry.workType === "travel" || entry.job?.travelPayEnabled) return "travel";
  return "regular";
}

function getPayableHours(entry: TimeEntryRecord) {
  const rateType = getRateType(entry);
  if (rateType === "travel") {
    const travelHours = travelEntryHours(entry);
    return travelHours > 0 ? travelHours : entryHours(entry);
  }
  return entryHours(entry);
}

function getTravelRate(entry: TimeEntryRecord, fallbackRate: number) {
  const { regularRate, effectiveRate } = getRates(entry, fallbackRate);
  const travelRateType = entry.job?.travelRateType || "regular";
  if (travelRateType === "island") return effectiveRate;
  if (travelRateType === "special") return effectiveRate;
  if (travelRateType === "custom") return toNumber(entry.job?.customTravelRate ?? regularRate);
  return regularRate;
}

function rateLabelForType(rateType: TimeEntryRecord["rateType"], rates: { regularRate: number; effectiveRate: number; overtimeRate: number }) {
  if (rateType === "special") return `Special $${rates.effectiveRate.toFixed(2)}`;
  if (rateType === "overtime") return `Overtime ${rates.overtimeRate.toFixed(2)}`;
  if (rateType === "travel") return `Travel`;
  return `Regular $${rates.regularRate.toFixed(2)}`;
}

function weekKey(date: Date) {
  const start = startOfWeek(date);
  return toDateInput(start);
}

function buildEditor(entry?: TimeEntryRecord | null): EntryEditorState {
  if (!entry) {
    const now = new Date();
    return {
      id: null,
      userId: null,
      jobId: null,
      date: toDateInput(now),
      clockInTime: "08:00",
      clockOutTime: "17:00",
      totalHours: "",
      travelHours: "",
      notes: "",
      managerNotes: "",
      rateType: "regular",
    };
  }

  const inAt = new Date(entry.clockIn);
  const outAt = entry.clockOut ? new Date(entry.clockOut) : null;
  return {
    id: entry.id,
    userId: entry.userId,
    jobId: entry.job?.id ?? null,
    date: toDateInput(inAt),
    clockInTime: `${`${inAt.getHours()}`.padStart(2, "0")}:${`${inAt.getMinutes()}`.padStart(2, "0")}`,
    clockOutTime: outAt ? `${`${outAt.getHours()}`.padStart(2, "0")}:${`${outAt.getMinutes()}`.padStart(2, "0")}` : "",
    totalHours: entry.hoursWorked ? String(toNumber(entry.hoursWorked)) : "",
    travelHours: String(toNumber(entry.travelHours ?? entry.job?.defaultTravelHours ?? 0)),
    notes: entry.notes || "",
    managerNotes: "",
    rateType: (entry.rateType === "island" ? "special" : entry.rateType) || (hasSpecialPay(entry) ? "special" : "regular"),
  };
}

export default function TimePage() {
  const utils = api.useUtils();
  const [tab, setTab] = useState<TabId>("payroll");
  const [startDate, setStartDate] = useState(toDateInput(startOfWeek(new Date())));
  const [endDate, setEndDate] = useState(toDateInput(addDays(startOfWeek(new Date()), 6)));
  const [employeeId, setEmployeeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EntryEditorState>(buildEditor());
  const [editorTouchedTravelHours, setEditorTouchedTravelHours] = useState(false);

  const employees = api.employees.list.useQuery();
  const employeeRows = employees.data?.rows || [];
  const jobs = api.jobs.list.useQuery();
  const selectedJob = useMemo(() => jobs.data?.find((job) => job.id === editor.jobId) || null, [editor.jobId, jobs.data]) as (null | {
    isIslandJob: boolean;
    specialPayEnabled: boolean;
    hourlyRateAdjustment: number | string | null;
    travelPayEnabled: boolean;
    defaultTravelHours: number | string | null;
    travelRateType?: "regular" | "island" | "special" | "custom" | null;
  });

  useEffect(() => {
    if (!selectedJob) return;
    if (selectedJob.travelPayEnabled && !editorTouchedTravelHours) {
      setEditor((current) => ({
        ...current,
        travelHours: String(toNumber(selectedJob.defaultTravelHours ?? 0)),
      }));
    }
    if ((selectedJob.specialPayEnabled || selectedJob.isIslandJob) && editor.rateType === "regular") {
      setEditor((current) => ({ ...current, rateType: "special" }));
    }
  }, [editor.rateType, editorTouchedTravelHours, selectedJob]);

  const listQuery = api.time.listAll.useQuery({
    startDate,
    endDate,
    employeeId: employeeId ? Number(employeeId) : undefined,
    projectId: projectId ? Number(projectId) : undefined,
  });

  const saveEntry = api.time.saveEntry.useMutation({
    onSuccess: () => {
      toast.success("Time entry saved");
      void utils.time.listAll.invalidate();
      setEditorOpen(false);
      setEditor(buildEditor());
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicateEntry = api.time.duplicateEntry.useMutation({
    onSuccess: () => {
      toast.success("Entry duplicated");
      void utils.time.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeEntry = api.time.remove.useMutation({
    onSuccess: () => {
      toast.success("Entry deleted");
      void utils.time.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = (listQuery.data || []) as unknown as TimeEntryRecord[];

  const employeeSummaries = useMemo(() => {
    const byEmployee = new Map<number, TimeEntryRecord[]>();
    for (const entry of rows) {
      const list = byEmployee.get(entry.userId) || [];
      list.push(entry);
      byEmployee.set(entry.userId, list);
    }

    return Array.from(byEmployee.entries())
      .map(([id, entries]) => {
        const sorted = [...entries].sort((a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime());
        const name = sorted[0]?.user?.name || employeeRows.find((e) => e.id === id)?.name || "Employee";
        const hourlyRate = toNumber(sorted[0]?.user?.hourlyRate ?? employeeRows.find((e) => e.id === id)?.hourlyRate ?? 0);

        // Travel pay is applied once per employee + job + date.
        const travelAllocations = new Map<string, { anchorEntryId: number; travelHours: number; travelRate: number }>();
        const travelGroups = new Map<string, TimeEntryRecord[]>();
        for (const entry of sorted) {
          const groupKey = `${entry.job?.id ?? 0}:${toDateInput(new Date(entry.clockIn))}`;
          const list = travelGroups.get(groupKey) || [];
          list.push(entry);
          travelGroups.set(groupKey, list);
        }
        for (const groupEntries of travelGroups.values()) {
          const explicitOverride = groupEntries.find((entry) => entry.travelHours !== null && entry.travelHours !== undefined);
          if (explicitOverride) {
            travelAllocations.set(`${explicitOverride.job?.id ?? 0}:${toDateInput(new Date(explicitOverride.clockIn))}`, {
              anchorEntryId: explicitOverride.id,
              travelHours: toNumber(explicitOverride.travelHours),
              travelRate: getTravelRate(explicitOverride, hourlyRate),
            });
            continue;
          }

          const defaultSource = groupEntries.find((entry) => Boolean(entry.job?.travelPayEnabled));
          if (defaultSource) {
            travelAllocations.set(`${defaultSource.job?.id ?? 0}:${toDateInput(new Date(defaultSource.clockIn))}`, {
              anchorEntryId: groupEntries[0].id,
              travelHours: toNumber(defaultSource.job?.defaultTravelHours ?? 0),
              travelRate: getTravelRate(defaultSource, hourlyRate),
            });
          }
        }

        let regularHours = 0;
        let overtimeHours = 0;
        let specialHours = 0;
        let travelHours = 0;
        let totalHours = 0;
        let regularPay = 0;
        let travelPay = 0;
        let overtimePay = 0;
        let estimatedCheck = 0;

        const weekTotals = new Map<string, number>();
        const details = sorted.map((entry) => {
          const workHours = entryHours(entry);
          const travelGroupKey = `${entry.job?.id ?? 0}:${toDateInput(new Date(entry.clockIn))}`;
          const travelAllocation = travelAllocations.get(travelGroupKey);
          const travelPayHours = travelAllocation && travelAllocation.anchorEntryId === entry.id ? travelAllocation.travelHours : 0;
          const wk = weekKey(new Date(entry.clockIn));
          const prior = weekTotals.get(wk) || 0;
          const rateType = getRateType(entry);
          const rates = getRates(entry, hourlyRate);
          const travelRate = travelAllocation?.travelRate ?? getTravelRate(entry, hourlyRate);
          const overtimePart = Math.max(0, prior + workHours - 40);
          const boundedOvertime = rateType === "overtime" ? workHours : Math.min(workHours, overtimePart);
          const baseHours = Math.max(0, workHours - boundedOvertime);
          const specialEligible = rateType === "special" || hasSpecialPay(entry);
          const specialPart = specialEligible ? baseHours : 0;
          const regularPart = specialEligible ? 0 : baseHours;
          weekTotals.set(wk, prior + workHours);

          const travelPart = travelPayHours;
          const detailRegularPay = regularPart * rates.regularRate;
          const detailSpecialPay = specialPart * rates.effectiveRate;
          const detailTravelPay = travelPart * travelRate;
          const detailOvertimePay = boundedOvertime * rates.overtimeRate;
          const amount = detailRegularPay + detailSpecialPay + detailTravelPay + detailOvertimePay;

          regularHours += regularPart;
          overtimeHours += boundedOvertime;
          specialHours += specialPart;
          travelHours += travelPart;
          totalHours += workHours + travelPart;
          regularPay += detailRegularPay;
          travelPay += detailTravelPay;
          overtimePay += detailOvertimePay;
          estimatedCheck += amount;

          const displayRateType = rateType === "regular" && specialEligible ? "special" : rateType;
          const rateLabel = rateLabelForType(displayRateType, { regularRate: rates.regularRate, effectiveRate: rates.effectiveRate, overtimeRate: rates.overtimeRate });

          return {
            id: entry.id,
            date: toDateInput(new Date(entry.clockIn)),
            clockIn: entry.clockIn,
            project: entry.job?.name || "No project",
            hours: workHours,
            travelHours: travelPart,
            rateLabel,
            adjustment: rates.adjustment,
            effectiveRate: rates.effectiveRate,
            travelLabel: travelPart > 0 ? `${travelPart.toFixed(2)}h @ $${travelRate.toFixed(2)}` : "—",
            dailyTotal: amount,
            notes: entry.notes || "",
          };
        });

        return {
          id,
          name,
          regularHours,
          overtimeHours,
          specialHours,
          travelHours,
          totalHours,
          hourlyRate,
          estimatedCheck,
          details,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees.data, rows]);

  const summaryCards = useMemo(() => {
    const totalHours = employeeSummaries.reduce((sum, row) => sum + row.totalHours, 0);
    const totalPayroll = employeeSummaries.reduce((sum, row) => sum + row.estimatedCheck, 0);
    const totalEmployees = employeeSummaries.length;
    return { totalHours, totalPayroll, totalEmployees };
  }, [employeeSummaries]);

  const overviewRows = useMemo(() => {
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return employeeSummaries.map((summary) => {
      const byDay = new Map<number, number>();
      for (const detail of summary.details) {
        const day = new Date(detail.clockIn).getDay();
        byDay.set(day, (byDay.get(day) || 0) + detail.hours + detail.travelHours);
      }
      return {
        employee: summary.name,
        daily: dayLabels.map((_, i) => byDay.get(i) || 0),
        total: summary.totalHours,
      };
    });
  }, [employeeSummaries]);

  const setRange = (start: Date, end: Date) => {
    setStartDate(toDateInput(start));
    setEndDate(toDateInput(end));
  };

  const applyQuickRange = (kind: "this_week" | "last_week" | "this_period" | "last_period") => {
    const today = new Date();
    if (kind === "this_week") {
      const start = startOfWeek(today);
      setRange(start, addDays(start, 6));
      return;
    }
    if (kind === "last_week") {
      const start = addDays(startOfWeek(today), -7);
      setRange(start, addDays(start, 6));
      return;
    }
    if (kind === "this_period") {
      const period = getBiweeklyPeriod(today);
      setRange(period.start, period.end);
      return;
    }
    const period = getBiweeklyPeriod(today);
    const lastStart = addDays(period.start, -14);
    setRange(lastStart, addDays(lastStart, 13));
  };

  const openCreate = () => {
    setEditorTouchedTravelHours(false);
    setEditor(buildEditor());
    setEditorOpen(true);
  };

  const openEdit = (entry: TimeEntryRecord) => {
    setEditorTouchedTravelHours(true);
    setEditor(buildEditor(entry));
    setEditorOpen(true);
  };

  const submitEditor = () => {
    if (!editor.userId) return toast.error("Select an employee.");

    const inAt = new Date(`${editor.date}T${editor.clockInTime}:00`);
    const hasTotalHours = editor.totalHours.trim().length > 0;
    const outAt = hasTotalHours ? null : editor.clockOutTime ? new Date(`${editor.date}T${editor.clockOutTime}:00`) : null;

    saveEntry.mutate({
      id: editor.id ?? undefined,
      data: {
        userId: editor.userId,
        jobId: editor.jobId,
        clockIn: inAt.toISOString(),
        clockOut: outAt ? outAt.toISOString() : null,
        totalHours: hasTotalHours ? toNumber(editor.totalHours) : null,
        travelHours: editor.travelHours.trim() ? toNumber(editor.travelHours) : null,
        rateType: editor.rateType,
        breakMinutes: 0,
        notes: editor.notes,
        managerNotes: editor.managerNotes || undefined,
        notAtJobsiteReason: undefined,
        isManual: true,
        overtimeOverride: false,
        reviewStatus: "pending",
        workType: "job_site",
      },
    });
  };

  const printSummary = () => window.print();

  return (
    <>
      <PageHeader
        title="Time Tracking"
        description="Payroll preview from date range to check amount."
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={printSummary}><Printer className="mr-1 h-4 w-4" /> Print Payroll Summary</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> Add Manual Hours</button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button className={["rounded-md px-3 py-2 text-sm font-medium", tab === "payroll" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setTab("payroll")}>Payroll Preview</button>
        <button className={["rounded-md px-3 py-2 text-sm font-medium", tab === "overview" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setTab("overview")}>Overview</button>
        <button className={["rounded-md px-3 py-2 text-sm font-medium", tab === "log" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setTab("log")}>Check In / Out</button>
      </div>

      <div className="card mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FieldInput label="Start date" type="date" value={startDate} onChange={setStartDate} />
          <FieldInput label="End date" type="date" value={endDate} onChange={setEndDate} />
          <FieldSelect label="Employee" value={employeeId} onChange={setEmployeeId} options={[{ value: "", label: "All employees" }, ...employeeRows.map((e) => ({ value: String(e.id), label: e.name }))]} />
          <FieldSelect label="Project" value={projectId} onChange={setProjectId} options={[{ value: "", label: "All projects" }, ...(jobs.data || []).map((j) => ({ value: String(j.id), label: j.name }))]} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={() => applyQuickRange("this_week")}>This week</button>
          <button className="btn btn-secondary" onClick={() => applyQuickRange("last_week")}>Last week</button>
          <button className="btn btn-secondary" onClick={() => applyQuickRange("this_period")}>This pay period</button>
          <button className="btn btn-secondary" onClick={() => applyQuickRange("last_period")}>Last pay period</button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total Hours" value={summaryCards.totalHours.toFixed(2)} />
        <SummaryCard label="Total Payroll" value={`$${summaryCards.totalPayroll.toFixed(2)}`} />
        <SummaryCard label="Total Employees" value={String(summaryCards.totalEmployees)} />
        <SummaryCard label="Date Range" value={`${startDate} to ${endDate}`} />
      </div>

      {tab === "payroll" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium text-right">Regular Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Special Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Travel Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Overtime</th>
                  <th className="px-3 py-2 font-medium text-right">Total Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Hourly Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Estimated Check</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading payroll preview…</td></tr>
                ) : employeeSummaries.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No entries in selected range.</td></tr>
                ) : employeeSummaries.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td colSpan={8} className="p-0">
                      <details>
                        <summary className="grid cursor-pointer grid-cols-8 gap-2 px-3 py-3 text-sm hover:bg-slate-50">
                          <span className="font-medium">{row.name}</span>
                          <span className="text-right">{row.regularHours.toFixed(2)}</span>
                          <span className="text-right">{row.specialHours.toFixed(2)}</span>
                          <span className="text-right">{row.travelHours.toFixed(2)}</span>
                          <span className="text-right">{row.overtimeHours.toFixed(2)}</span>
                          <span className="text-right">{row.totalHours.toFixed(2)}</span>
                          <span className="text-right">${row.hourlyRate.toFixed(2)}</span>
                          <span className="text-right font-semibold">${row.estimatedCheck.toFixed(2)}</span>
                        </summary>
                        <div className="border-t border-slate-200 bg-white p-3">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-left">
                              <tr>
                                <th className="px-2 py-2">Date</th>
                                <th className="px-2 py-2">Project</th>
                                <th className="px-2 py-2 text-right">Hours</th>
                                <th className="px-2 py-2">Rate used</th>
                                <th className="px-2 py-2 text-right">Adjustment</th>
                                <th className="px-2 py-2 text-right">Effective Rate</th>
                                <th className="px-2 py-2">Travel</th>
                                <th className="px-2 py-2 text-right">Daily Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.details.map((detail) => (
                                <tr key={detail.id} className="border-t border-slate-100">
                                  <td className="px-2 py-2">{detail.date}</td>
                                  <td className="px-2 py-2">{detail.project}</td>
                                  <td className="px-2 py-2 text-right">{detail.hours.toFixed(2)}</td>
                                  <td className="px-2 py-2">{detail.rateLabel}</td>
                                  <td className="px-2 py-2 text-right">+${detail.adjustment.toFixed(2)}</td>
                                  <td className="px-2 py-2 text-right">${detail.effectiveRate.toFixed(2)}</td>
                                  <td className="px-2 py-2">{detail.travelLabel}</td>
                                  <td className="px-2 py-2 text-right">${detail.dailyTotal.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "overview" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium text-right">Sun</th>
                <th className="px-3 py-2 font-medium text-right">Mon</th>
                <th className="px-3 py-2 font-medium text-right">Tue</th>
                <th className="px-3 py-2 font-medium text-right">Wed</th>
                <th className="px-3 py-2 font-medium text-right">Thu</th>
                <th className="px-3 py-2 font-medium text-right">Fri</th>
                <th className="px-3 py-2 font-medium text-right">Sat</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {overviewRows.map((row) => (
                <tr key={row.employee} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{row.employee}</td>
                  {row.daily.map((hours, index) => (
                    <td key={index} className="px-3 py-2 text-right">{hours.toFixed(2)}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold">{row.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "log" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium">Clock In</th>
                  <th className="px-3 py-2 font-medium">Clock Out</th>
                  <th className="px-3 py-2 font-medium text-right">Hours</th>
                  <th className="px-3 py-2 font-medium">Manual</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{entry.user?.name || employeeRows.find((e) => e.id === entry.userId)?.name || "Employee"}</td>
                    <td className="px-3 py-2">{entry.job?.name || "—"}</td>
                    <td className="px-3 py-2">{formatDateTime(entry.clockIn)}</td>
                    <td className="px-3 py-2">{entry.clockOut ? formatDateTime(entry.clockOut) : "—"}</td>
                    <td className="px-3 py-2 text-right">{entryHours(entry).toFixed(2)}</td>
                    <td className="px-3 py-2">{entry.isManual ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <ActionButton label="Edit" onClick={() => openEdit(entry)} icon={<Pencil className="h-3.5 w-3.5" />} />
                        <ActionButton label="Duplicate" onClick={() => duplicateEntry.mutate({ id: entry.id })} icon={<Copy className="h-3.5 w-3.5" />} />
                        <ActionButton label="Delete" onClick={() => removeEntry.mutate({ id: entry.id })} icon={<Trash2 className="h-3.5 w-3.5" />} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="print-only mt-8 hidden">
        <h2 className="text-xl font-semibold">Payroll Summary</h2>
        <div className="mt-1 text-sm text-slate-700">Pay period: {startDate} to {endDate}</div>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1 text-left">Employee</th>
              <th className="border px-2 py-1 text-right">Total Hours</th>
              <th className="border px-2 py-1 text-right">Estimated Check</th>
            </tr>
          </thead>
          <tbody>
            {employeeSummaries.map((row) => (
              <tr key={row.id}>
                <td className="border px-2 py-1">{row.name}</td>
                <td className="border px-2 py-1 text-right">{row.totalHours.toFixed(2)}</td>
                <td className="border px-2 py-1 text-right">${row.estimatedCheck.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-3xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{editor.id ? "Edit Hours" : "Add Manual Hours"}</div>
                <div className="text-sm text-slate-500">Clock in/out or total hours.</div>
              </div>
              <button className="btn btn-secondary" onClick={() => setEditorOpen(false)}>Close</button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <FieldSelect label="Employee" value={editor.userId ? String(editor.userId) : ""} onChange={(value) => setEditor((s) => ({ ...s, userId: value ? Number(value) : null }))} options={[{ value: "", label: "Select employee" }, ...employeeRows.map((e) => ({ value: String(e.id), label: e.name }))]} />
              <FieldSelect label="Project" value={editor.jobId ? String(editor.jobId) : ""} onChange={(value) => {
                const jobId = value ? Number(value) : null;
                setEditorTouchedTravelHours(false);
                setEditor((s) => ({ ...s, jobId, rateType: s.rateType === "travel" ? "regular" : s.rateType }));
              }} options={[{ value: "", label: "No project" }, ...(jobs.data || []).map((j) => ({ value: String(j.id), label: j.name }))]} />
              <FieldInput label="Date" type="date" value={editor.date} onChange={(value) => setEditor((s) => ({ ...s, date: value }))} />
              <FieldInput label="Clock In" type="time" value={editor.clockInTime} onChange={(value) => setEditor((s) => ({ ...s, clockInTime: value }))} />
              <FieldInput label="Clock Out" type="time" value={editor.clockOutTime} onChange={(value) => setEditor((s) => ({ ...s, clockOutTime: value }))} />
              <FieldInput label="Total Hours (optional)" type="number" value={editor.totalHours} onChange={(value) => setEditor((s) => ({ ...s, totalHours: value }))} />
              <FieldSelect
                label="Rate Type"
                value={editor.rateType}
                onChange={(value) => setEditor((s) => ({ ...s, rateType: value as EntryEditorState["rateType"] }))}
                options={[
                  { value: "regular", label: "Regular" },
                  { value: "special", label: "Special" },
                  { value: "travel", label: "Travel" },
                  { value: "overtime", label: "Overtime" },
                ]}
              />
              <FieldInput
                label="Travel Hours"
                type="number"
                value={editor.travelHours}
                onChange={(value) => {
                  setEditorTouchedTravelHours(true);
                  setEditor((s) => ({ ...s, travelHours: value }));
                }}
              />
              {selectedJob?.travelPayEnabled ? (
                <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  Travel pay is enabled for this job. Default travel hours: {toNumber(selectedJob.defaultTravelHours ?? 0).toFixed(2)}. Rate source: {selectedJob.travelRateType || "regular"}.
                </div>
              ) : null}
              {(selectedJob?.specialPayEnabled || selectedJob?.isIslandJob) ? (
                <div className="md:col-span-2 rounded-lg border border-slate-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  This job uses special pay. The payroll preview adds +${toNumber(selectedJob.hourlyRateAdjustment ?? (selectedJob.isIslandJob ? 2 : 0)).toFixed(2)}/hr to the employee regular rate for worked hours on this job.
                </div>
              ) : null}
              <FieldTextArea label="Notes" value={editor.notes} onChange={(value) => setEditor((s) => ({ ...s, notes: value }))} />
              <FieldTextArea label="Manager Notes" value={editor.managerNotes} onChange={(value) => setEditor((s) => ({ ...s, managerNotes: value }))} />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitEditor} disabled={!editor.userId || saveEntry.isPending}>
                {saveEntry.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-only, .print-only * { visibility: visible; }
          .print-only { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ActionButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button className="btn btn-secondary text-xs" title={label} onClick={onClick}>
      <span className="mr-1">{icon}</span>
      {label}
    </button>
  );
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function FieldInput({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FieldTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="md:col-span-2">
      <label className="label">{label}</label>
      <textarea className="input min-h-24" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
