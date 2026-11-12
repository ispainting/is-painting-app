"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getTimeListState } from "@/lib/time-list-state";
import { isWithinLiveShiftWindow } from "@/lib/clock";
import { formatDateTime } from "@/lib/utils";
import { Clock3, Copy, MapPin, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { buildPayrollSummaries } from "@/lib/payroll-preview";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { payrollPdf } from "@/lib/pdf-export-data";

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
  managerNotes?: string | null;
  notAtJobsiteReason: string | null;
  clockInLatitude: number | string | null;
  clockInLongitude: number | string | null;
  clockInAccuracy: number | string | null;
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
  leaveOpen: boolean;
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

function getDurationParts(value: string) {
  if (!value.trim()) return { hours: "", minutes: "" };
  const totalMinutes = Math.max(0, Math.round((toNumber(value) * 60) / 5) * 5);
  return {
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60).padStart(2, "0"),
  };
}

function updateDurationPart(currentValue: string, part: "hours" | "minutes", nextValue: string) {
  const current = getDurationParts(currentValue);
  if (!nextValue && !current[part === "hours" ? "minutes" : "hours"]) return "";

  const hours = part === "hours" ? Number(nextValue || 0) : Number(current.hours || 0);
  const minutes = part === "minutes" ? Number(nextValue || 0) : Number(current.minutes || 0);
  const totalMinutes = hours >= 24 ? 24 * 60 : hours * 60 + minutes;
  return totalMinutes ? String(totalMinutes / 60) : "";
}

function durationOptions() {
  return {
    hours: [
      { value: "", label: "—" },
      ...Array.from({ length: 25 }, (_, hours) => ({ value: String(hours), label: String(hours) })),
    ],
    minutes: [
      { value: "", label: "—" },
      ...Array.from({ length: 12 }, (_, index) => {
        const minutes = index * 5;
        return { value: String(minutes), label: String(minutes).padStart(2, "0") };
      }),
    ],
  };
}

function DurationFields({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const parts = getDurationParts(value);
  const options = durationOptions();
  return (
    <div className="grid grid-cols-2 gap-2">
      <FieldSelect
        label={`${label} (hours)`}
        value={parts.hours}
        onChange={(next) => onChange(updateDurationPart(value, "hours", next))}
        options={options.hours}
      />
      <FieldSelect
        label="Minutes (5-minute steps)"
        value={parts.minutes}
        onChange={(next) => onChange(updateDurationPart(value, "minutes", next))}
        options={options.minutes}
      />
    </div>
  );
}

function getClockTimeParts(value: string) {
  const [rawHour, rawMinute] = value.split(":").map(Number);
  const totalMinutes = Math.max(0, ((rawHour || 0) * 60 + (rawMinute || 0)) % (24 * 60));
  const roundedMinutes = Math.round(totalMinutes / 5) * 5;
  const normalizedMinutes = roundedMinutes % (24 * 60);
  const hour24 = Math.floor(normalizedMinutes / 60);
  return {
    hour: String(hour24 % 12 || 12).padStart(2, "0"),
    minute: String(normalizedMinutes % 60).padStart(2, "0"),
    period: hour24 < 12 ? "AM" : "PM",
  };
}

function updateClockTimePart(value: string, part: "hour" | "minute" | "period", nextValue: string) {
  const current = getClockTimeParts(value);
  const hour = Number(part === "hour" ? nextValue : current.hour) % 12;
  const minute = Number(part === "minute" ? nextValue : current.minute);
  const period = part === "period" ? nextValue : current.period;
  const hour24 = hour + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function ClockTimeFields({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const parts = getClockTimeParts(value);
  const hourOptions = Array.from({ length: 12 }, (_, index) => {
    const hour = String(index + 1).padStart(2, "0");
    return { value: hour, label: hour };
  });
  const minuteOptions = Array.from({ length: 12 }, (_, index) => {
    const minute = String(index * 5).padStart(2, "0");
    return { value: minute, label: minute };
  });
  const periodOptions = ["AM", "PM"].map((period) => ({ value: period, label: period }));

  return (
    <div className="grid grid-cols-3 gap-2">
      <FieldSelect
        label={`${label} hour`}
        value={parts.hour}
        onChange={(next) => onChange(updateClockTimePart(value, "hour", next))}
        options={hourOptions}
      />
      <FieldSelect
        label="Minute (5-minute steps)"
        value={parts.minute}
        onChange={(next) => onChange(updateClockTimePart(value, "minute", next))}
        options={minuteOptions}
      />
      <FieldSelect
        label="AM/PM"
        value={parts.period}
        onChange={(next) => onChange(updateClockTimePart(value, "period", next))}
        options={periodOptions}
      />
    </div>
  );
}

function entryHours(entry: TimeEntryRecord) {
  return toNumber(entry.paidHours ?? entry.hoursWorked ?? entry.grossHours ?? 0);
}

function hasSpecialPay(entry: TimeEntryRecord) {
  return Boolean(entry.specialPayEnabled || entry.isIslandJob || entry.job?.specialPayEnabled || entry.job?.isIslandJob);
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
      clockOutTime: "",
      totalHours: "",
      travelHours: "",
      notes: "",
      managerNotes: "",
      rateType: "regular",
      leaveOpen: true,
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
    managerNotes: entry.managerNotes || "",
    rateType: (entry.rateType === "island" ? "special" : entry.rateType) || (hasSpecialPay(entry) ? "special" : "regular"),
    leaveOpen: !outAt,
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
  const offsiteAlerts = rows.filter((entry) => !entry.isManual && entry.notAtJobsiteReason);
  const listState = getTimeListState({
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    rowCount: rows.length,
  });

  const employeeSummaries = useMemo(() => {
    return buildPayrollSummaries(rows, employeeRows);
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

  const openCompletedHours = () => {
    const next = buildEditor();
    setEditorTouchedTravelHours(false);
    setEditor({ ...next, leaveOpen: false, clockOutTime: "17:00" });
    setEditorOpen(true);
  };

  const openEdit = (entry: TimeEntryRecord) => {
    setEditorTouchedTravelHours(true);
    setEditor(buildEditor(entry));
    setEditorOpen(true);
  };

  const submitEditor = () => {
    if (!editor.userId) return toast.error("Select an employee.");
    if (editor.leaveOpen && !editor.managerNotes.trim()) return toast.error("Enter why you are clocking in for the employee.");

    const inAt = new Date(`${editor.date}T${editor.clockInTime}:00`);
    const hasTotalHours = editor.totalHours.trim().length > 0;
    const outAt = editor.leaveOpen ? null : hasTotalHours ? null : editor.clockOutTime ? new Date(`${editor.date}T${editor.clockOutTime}:00`) : null;
    if (!editor.leaveOpen && !hasTotalHours && !outAt) return toast.error("Enter clock-out time or total hours.");

    saveEntry.mutate({
      id: editor.id ?? undefined,
      data: {
        userId: editor.userId,
        jobId: editor.jobId,
        clockIn: inAt.toISOString(),
        clockOut: outAt ? outAt.toISOString() : null,
        totalHours: editor.leaveOpen ? null : hasTotalHours ? toNumber(editor.totalHours) : null,
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
            <ExportPdfButton disabled={listQuery.isFetching || listQuery.isError || !listQuery.data} build={() => payrollPdf(rows, employeeSummaries, {
              dateRange: `${startDate} through ${endDate}`,
              filters: [
                ["Employee", employeeId ? employeeRows.find(row => row.id === Number(employeeId))?.name || "Selected employee" : "All"],
                ["Job", projectId ? jobs.data?.find(row => row.id === Number(projectId))?.name || "Selected Job" : "All"],
                ["View", tab],
              ],
            })} />
            <button className="btn btn-secondary" onClick={printSummary}><Printer className="mr-1 h-4 w-4" /> Print Payroll Summary</button>
            <button className="btn btn-secondary" onClick={openCompletedHours}><Plus className="mr-1 h-4 w-4" /> Add Completed Hours</button>
            <button className="btn btn-primary" onClick={openCreate}><Clock3 className="mr-1 h-4 w-4" /> Clock In for Employee</button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button className={["rounded-md px-3 py-2 text-sm font-medium", tab === "payroll" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setTab("payroll")}>Payroll Preview</button>
        <button className={["rounded-md px-3 py-2 text-sm font-medium", tab === "overview" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setTab("overview")}>Overview</button>
        <button className={["rounded-md px-3 py-2 text-sm font-medium", tab === "log" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setTab("log")}>Check In / Out</button>
      </div>

      {offsiteAlerts.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-950">
            <MapPin className="h-5 w-5" />
            Authorized offsite clock-ins ({offsiteAlerts.length})
          </div>
          <div className="mt-3 space-y-2">
            {offsiteAlerts.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                <div className="font-medium text-slate-900">
                  {entry.user?.name || "Employee"} · {formatDateTime(entry.clockIn)}
                </div>
                <div className="text-slate-700">{entry.job?.name || "No job selected"}</div>
                <div className="mt-1 text-amber-900">{entry.notAtJobsiteReason}</div>
                {entry.clockInLatitude != null && entry.clockInLongitude != null ? (
                  <a
                    className="mt-2 inline-flex items-center gap-1 font-medium text-blue-700 underline"
                    href={`https://www.google.com/maps?q=${entry.clockInLatitude},${entry.clockInLongitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View clock-in location
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
                  <th className="px-3 py-2 font-medium text-right">Total Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Hourly Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Estimated Check</th>
                </tr>
              </thead>
              <tbody>
                {listState === "loading" ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading payroll preview…</td></tr>
                ) : listState === "error" ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center"><p className="font-medium text-red-700">Time entries could not be loaded.</p><button className="btn btn-secondary mt-3" type="button" onClick={() => void listQuery.refetch()}>Retry</button></td></tr>
                ) : listState === "empty" ? (
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
                    <td className="px-3 py-2">
                      {entry.clockOut
                        ? formatDateTime(entry.clockOut)
                        : isWithinLiveShiftWindow(entry.clockIn)
                          ? "In progress"
                          : "Historical — missing clock out"}
                    </td>
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
                <div className="text-lg font-semibold">{editor.id ? "Edit Time Entry" : editor.leaveOpen ? "Clock In for Employee" : "Add Completed Hours"}</div>
                <div className="text-sm text-slate-500">
                  {editor.leaveOpen ? "Set the real start time. The employee will clock out normally from their phone." : "Enter a completed time period."}
                </div>
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
              <ClockTimeFields label="Clock In" value={editor.clockInTime} onChange={(value) => setEditor((s) => ({ ...s, clockInTime: value }))} />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={editor.leaveOpen} onChange={(event) => setEditor((s) => ({ ...s, leaveOpen: event.target.checked, clockOutTime: event.target.checked ? "" : s.clockOutTime || "17:00", totalHours: event.target.checked ? "" : s.totalHours }))} />
                  Leave shift open for employee clock-out
                </label>
              </div>
              {!editor.leaveOpen ? (
                <>
                  <ClockTimeFields label="Clock Out" value={editor.clockOutTime} onChange={(value) => setEditor((s) => ({ ...s, clockOutTime: value }))} />
                  <DurationFields label="Total Hours (optional)" value={editor.totalHours} onChange={(value) => setEditor((s) => ({ ...s, totalHours: value }))} />
                </>
              ) : (
                <div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  The effective clock-in time above is used for hours and job cost. The system separately records when you created this entry for audit purposes.
                </div>
              )}
              <FieldSelect
                label="Rate Type"
                value={editor.rateType}
                onChange={(value) => setEditor((s) => ({ ...s, rateType: value as EntryEditorState["rateType"] }))}
                options={[
                  { value: "regular", label: "Regular" },
                  { value: "special", label: "Special" },
                  { value: "travel", label: "Travel" },
                ]}
              />
              <DurationFields
                label="Travel Hours"
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
              <FieldTextArea label={editor.leaveOpen ? "Manager reason (required)" : "Manager Notes"} value={editor.managerNotes} onChange={(value) => setEditor((s) => ({ ...s, managerNotes: value }))} />
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

function FieldInput({ label, type, value, onChange, step }: { label: string; type: string; value: string; onChange: (value: string) => void; step?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} step={step} onChange={(e) => onChange(e.target.value)} />
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
