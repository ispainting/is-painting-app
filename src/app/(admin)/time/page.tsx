"use client";

import { useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, Copy, Filter, Pencil, Plus, Trash2, X } from "lucide-react";

type TabId = "overview" | "log" | "review";

type ReviewStatus = "pending" | "approved" | "rejected";

type TimeEntryRecord = {
  id: number;
  userId: number;
  approvedById: number | null;
  approvedBy?: { id: number; name: string } | null;
  job?: {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    customer?: { name: string } | null;
  } | null;
  clockIn: Date | string;
  clockOut: Date | string | null;
  breakMinutes?: number;
  hoursWorked?: string | number | null;
  grossHours?: string | number | null;
  paidHours?: string | number | null;
  isManual?: boolean;
  isIslandJob?: boolean;
  overtimeOverride?: boolean;
  reviewStatus?: ReviewStatus;
  notes?: string | null;
  managerNotes?: string | null;
  notAtJobsiteReason?: string | null;
  workType?: string | null;
  clockInLatitude?: string | number | null;
  clockInLongitude?: string | number | null;
  clockOutLatitude?: string | number | null;
  clockOutLongitude?: string | number | null;
};

type EmployeeOption = { id: number; name: string };
type ProjectOption = { id: number; name: string };

type EntryEditorState = {
  id: number | null;
  userId: number | null;
  jobId: number | null;
  date: string;
  clockInTime: string;
  clockOutTime: string;
  totalHours: string;
  breakMinutes: string;
  notes: string;
  managerNotes: string;
  notAtJobsiteReason: string;
  isManual: boolean;
  isIslandJob: boolean;
  overtimeOverride: boolean;
  reviewStatus: ReviewStatus;
  workType: string;
};

type OverviewGroup = {
  employeeId: number;
  employeeName: string;
  hourlyRate: number;
  days: Array<{
    key: string;
    label: string;
    hours: number;
    status: ReviewStatus | "empty" | "mixed";
    entries: TimeEntryRecord[];
  }>;
  weeklyTotal: number;
  regularHours: number;
  overtimeHours: number;
  islandHours: number;
  holidayHours: number;
  estimatedPayroll: number;
  approvalStatus: ReviewStatus | "mixed";
  entries: TimeEntryRecord[];
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "log", label: "Check In / Out" },
  { id: "review", label: "Review Time" },
];

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MANAGER_NOTE_TEMPLATES = [
  "Missing clock out",
  "Wrong job selected",
  "Needs GPS review",
  "Hours need confirmation",
  "Duplicate entry",
  "Manual correction needed",
];

function formatHours(value: number) {
  return `${value.toFixed(2)}h`;
}

function parseNumeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getHolidayDates(year: number) {
  const holidays = new Set<string>();
  const add = (date: Date) => holidays.add(toLocalDateInput(date));
  const nthWeekday = (month: number, weekday: number, nth: number) => {
    const date = new Date(year, month, 1);
    const offset = (weekday - date.getDay() + 7) % 7;
    date.setDate(1 + offset + (nth - 1) * 7);
    return date;
  };
  const lastWeekday = (month: number, weekday: number) => {
    const date = new Date(year, month + 1, 0);
    const offset = (date.getDay() - weekday + 7) % 7;
    date.setDate(date.getDate() - offset);
    return date;
  };

  add(new Date(year, 0, 1)); // New Year's Day
  add(nthWeekday(0, 1, 3)); // MLK
  add(nthWeekday(1, 1, 3)); // Presidents
  add(lastWeekday(4, 1)); // Memorial Day
  add(new Date(year, 5, 19)); // Juneteenth
  add(new Date(year, 6, 4)); // Independence Day
  add(nthWeekday(8, 1, 1)); // Labor Day
  add(nthWeekday(9, 1, 2)); // Columbus/Indigenous
  add(new Date(year, 10, 11)); // Veterans Day
  add(nthWeekday(10, 4, 4)); // Thanksgiving
  add(new Date(year, 11, 25)); // Christmas

  return holidays;
}

function isHoliday(date: Date) {
  return getHolidayDates(date.getFullYear()).has(toLocalDateInput(date));
}

function isIslandEntry(entry: TimeEntryRecord) {
  if (entry.isIslandJob) return true;
  const haystack = [entry.job?.name, entry.job?.address, entry.job?.city, entry.job?.state].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes("island");
}

function entryHours(entry: TimeEntryRecord) {
  const value = entry.paidHours ?? entry.hoursWorked ?? entry.grossHours ?? 0;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function entryStatusTone(status: ReviewStatus | "empty" | "mixed") {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  if (status === "pending") return "bg-amber-100 text-amber-700";
  if (status === "mixed") return "bg-slate-100 text-slate-700";
  return "bg-slate-50 text-slate-400";
}

function entryStatusLabel(status: ReviewStatus | "empty" | "mixed") {
  if (status === "approved" || status === "rejected" || status === "pending") return REVIEW_STATUS_LABELS[status];
  if (status === "mixed") return "Mixed";
  return "No entries";
}

function getDayStatus(entries: TimeEntryRecord[]) {
  if (!entries.length) return "empty" as const;
  const statuses = new Set(entries.map((entry) => entry.reviewStatus));
  if (statuses.has("rejected")) return "rejected" as const;
  if (statuses.size === 1 && statuses.has("approved")) return "approved" as const;
  if (statuses.size === 1 && statuses.has("pending")) return "pending" as const;
  return "mixed" as const;
}

function calculatePayroll(entries: TimeEntryRecord[], hourlyRate: number) {
  const islandHours = entries.filter((entry) => isIslandEntry(entry)).reduce((sum, entry) => sum + entryHours(entry), 0);
  const holidayHours = entries.filter((entry) => isHoliday(new Date(entry.clockIn as string | Date))).reduce((sum, entry) => sum + entryHours(entry), 0);
  const overtimeOverrideHours = entries.filter((entry) => entry.overtimeOverride && !isIslandEntry(entry) && !isHoliday(new Date(entry.clockIn as string | Date))).reduce((sum, entry) => sum + entryHours(entry), 0);

  const regularCandidates = entries.filter((entry) => !isIslandEntry(entry) && !isHoliday(new Date(entry.clockIn as string | Date)) && !entry.overtimeOverride);
  const candidateHours = regularCandidates.reduce((sum, entry) => sum + entryHours(entry), 0);
  const regularHours = Math.min(40, candidateHours);
  const overtimeHours = Math.max(0, candidateHours - 40) + overtimeOverrideHours;
  const weeklyTotal = entries.reduce((sum, entry) => sum + entryHours(entry), 0);
  const estimatedPayroll = regularHours * hourlyRate + overtimeHours * hourlyRate * 1.5 + islandHours * hourlyRate * 1.25 + holidayHours * hourlyRate * 2;

  return {
    regularHours,
    overtimeHours,
    islandHours,
    holidayHours,
    weeklyTotal,
    estimatedPayroll,
  };
}

function buildEntryEditor(entry?: TimeEntryRecord | null): EntryEditorState {
  if (!entry) {
    const now = new Date();
    return {
      id: null,
      userId: null,
      jobId: null,
      date: toLocalDateInput(now),
      clockInTime: "08:00",
      clockOutTime: "17:00",
      totalHours: "",
      breakMinutes: "30",
      notes: "",
      managerNotes: "",
      notAtJobsiteReason: "",
      isManual: true,
      isIslandJob: false,
      overtimeOverride: false,
      reviewStatus: "pending",
      workType: "job_site",
    };
  }

  const clockIn = new Date(entry.clockIn);
  const clockOut = entry.clockOut ? new Date(entry.clockOut) : null;
  return {
    id: entry.id,
    userId: entry.userId,
    jobId: entry.job?.id ?? null,
    date: toLocalDateInput(clockIn),
    clockInTime: `${`${clockIn.getHours()}`.padStart(2, "0")}:${`${clockIn.getMinutes()}`.padStart(2, "0")}`,
    clockOutTime: clockOut ? `${`${clockOut.getHours()}`.padStart(2, "0")}:${`${clockOut.getMinutes()}`.padStart(2, "0")}` : "",
    totalHours: entry.hoursWorked ? String(Number(entry.hoursWorked)) : "",
    breakMinutes: String(entry.breakMinutes ?? 0),
    notes: entry.notes || "",
    managerNotes: entry.managerNotes || "",
    notAtJobsiteReason: entry.notAtJobsiteReason || "",
    isManual: Boolean(entry.isManual),
    isIslandJob: Boolean(entry.isIslandJob),
    overtimeOverride: Boolean(entry.overtimeOverride),
    reviewStatus: entry.reviewStatus || "pending",
    workType: entry.workType || "job_site",
  };
}

export default function TimePage() {
  const utils = api.useUtils();
  const [tab, setTab] = useState<TabId>("overview");
  const [selectedWeek, setSelectedWeek] = useState(toLocalDateInput(getWeekStart(new Date())));
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | "all">("all");
  const [manualFilter, setManualFilter] = useState<boolean | undefined>(undefined);
  const [islandFilter, setIslandFilter] = useState<boolean | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState<{ employeeId: number; dayKey: string } | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<number[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EntryEditorState>(buildEntryEditor());
  const [quickManagerNote, setQuickManagerNote] = useState("");
  const [sortKey, setSortKey] = useState<"employee" | "hours" | "payroll" | "status">("employee");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const employees = api.employees.list.useQuery();
  const jobs = api.jobs.list.useQuery();

  const listQuery = api.time.listAll.useQuery({
    weekStart: selectedWeek,
    employeeId: employeeFilter ? Number(employeeFilter) : undefined,
    projectId: projectFilter ? Number(projectFilter) : undefined,
    reviewStatus: reviewFilter === "all" ? undefined : reviewFilter,
    manualEntries: manualFilter,
    islandJobs: islandFilter,
    search: search.trim() || undefined,
  });

  const refreshTimeData = () => {
    void utils.time.listAll.invalidate();
    void utils.time.myActive.invalidate();
    void utils.time.myEntries.invalidate();
  };

  const resetFilters = () => {
    setEmployeeFilter("");
    setProjectFilter("");
    setReviewFilter("all");
    setIslandFilter(undefined);
    setManualFilter(undefined);
    setSearch("");
  };

  const saveEntry = api.time.saveEntry.useMutation({
    onSuccess: () => {
      toast.success("Time entry saved");
      refreshTimeData();
      setEditorOpen(false);
      setEditor(buildEntryEditor());
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicateEntry = api.time.duplicateEntry.useMutation({
    onSuccess: () => {
      toast.success("Time entry duplicated");
      refreshTimeData();
    },
    onError: (error) => toast.error(error.message),
  });

  const removeEntry = api.time.remove.useMutation({
    onSuccess: () => {
      toast.success("Time entry deleted");
      refreshTimeData();
    },
    onError: (error) => toast.error(error.message),
  });

  const approveEntry = api.time.approve.useMutation({
    onSuccess: () => {
      toast.success("Approved");
      refreshTimeData();
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectEntry = api.time.reject.useMutation({
    onSuccess: () => {
      toast.success("Rejected");
      refreshTimeData();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkReview = api.time.bulkReview.useMutation({
    onSuccess: () => {
      toast.success("Review updated");
      refreshTimeData();
      setSelectedEntries([]);
    },
    onError: (error) => toast.error(error.message),
  });

  const applyBulkReview = (ids: number[], reviewStatus: ReviewStatus, managerNotes?: string) => {
    bulkReview.mutate({
      ids,
      reviewStatus,
      managerNotes: managerNotes?.trim() || undefined,
    });
  };

  const applyDayReview = (dayEntries: TimeEntryRecord[], reviewStatus: ReviewStatus) => {
    if (!dayEntries.length) {
      toast.error("No entries found for this day.");
      return;
    }
    applyBulkReview(
      dayEntries.map((entry) => entry.id),
      reviewStatus,
      reviewStatus === "rejected" ? quickManagerNote : undefined
    );
  };

  const weekStartDate = useMemo(() => new Date(`${selectedWeek}T00:00:00`), [selectedWeek]);
  const dayMap = useMemo(() => {
    const map = new Map<string, Date>();
    WEEKDAY_LABELS.forEach((_, index) => map.set(`day-${index}`, addDays(weekStartDate, index)));
    return map;
  }, [weekStartDate]);

  const entries = (listQuery.data || []) as TimeEntryRecord[];
  const projectOptions = useMemo(() => jobs.data || [], [jobs.data]);
  const employeeOptions = useMemo(() => employees.data || [], [employees.data]);
  const employeeLookup = useMemo(() => new Map(employeeOptions.map((employee) => [employee.id, employee])), [employeeOptions]);

  const overviewGroups = useMemo(() => {
    const employeeMap = new Map<number, OverviewGroup>();

    for (const entry of entries) {
      const clockIn = new Date(entry.clockIn);
      const dayIndex = clockIn.getDay();
      const employee = employeeLookup.get(entry.userId);
      const employeeId = entry.userId;
      const existing = employeeMap.get(employeeId);
      const hourlyRate = Number(employee?.hourlyRate || 0);
      const effectiveHours = entryHours(entry);

      if (!existing) {
        employeeMap.set(employeeId, {
          employeeId,
          employeeName: employee?.name || "Employee",
          hourlyRate,
          days: WEEKDAY_LABELS.map((label, index) => ({ key: `day-${index}`, label, hours: 0, status: "empty", entries: [] })),
          weeklyTotal: 0,
          regularHours: 0,
          overtimeHours: 0,
          islandHours: 0,
          holidayHours: 0,
          estimatedPayroll: 0,
          approvalStatus: "pending",
          entries: [],
        });
      }

      const group = employeeMap.get(employeeId)!;
      group.entries.push(entry);
      group.weeklyTotal += effectiveHours;
      group.days[dayIndex].entries.push(entry);
      group.days[dayIndex].hours += effectiveHours;
      group.days[dayIndex].status = getDayStatus(group.days[dayIndex].entries);
    }

    for (const group of employeeMap.values()) {
      const calc = calculatePayroll(group.entries, group.hourlyRate);
      group.regularHours = calc.regularHours;
      group.overtimeHours = calc.overtimeHours;
      group.islandHours = calc.islandHours;
      group.holidayHours = calc.holidayHours;
      group.weeklyTotal = calc.weeklyTotal;
      group.estimatedPayroll = calc.estimatedPayroll;
      const statuses = new Set(group.entries.map((entry) => entry.reviewStatus || "pending"));
      group.approvalStatus = statuses.has("rejected") ? "rejected" : statuses.size === 1 && statuses.has("approved") ? "approved" : statuses.size === 1 && statuses.has("pending") ? "pending" : "mixed";
    }

    return Array.from(employeeMap.values()).sort((a, b) => {
      const sorters: Record<typeof sortKey, number> = {
        employee: a.employeeName.localeCompare(b.employeeName),
        hours: a.weeklyTotal - b.weeklyTotal,
        payroll: a.estimatedPayroll - b.estimatedPayroll,
        status: a.approvalStatus.localeCompare(b.approvalStatus),
      };
      const result = sorters[sortKey];
      return sortDir === "asc" ? result : -result;
    });
  }, [employeeLookup, entries, sortDir, sortKey]);

  const summary = useMemo(() => {
    const totals = entries.reduce(
      (acc, entry) => {
        const hours = entryHours(entry);
        acc.totalHours += hours;
        acc.payrollTotal += hours * Number(employeeLookup.get(entry.userId)?.hourlyRate || 0);
        if (entry.reviewStatus === "pending") acc.pendingHours += hours;
        if (entry.reviewStatus === "approved") acc.approvedHours += hours;
        if (entry.reviewStatus === "pending") acc.employeesPending.add(entry.userId);
        return acc;
      },
      { totalHours: 0, pendingHours: 0, approvedHours: 0, payrollTotal: 0, employeesPending: new Set<number>() }
    );

    return {
      totalHours: totals.totalHours,
      pendingHours: totals.pendingHours,
      approvedHours: totals.approvedHours,
      payrollTotal: totals.payrollTotal,
      employeesPendingApproval: totals.employeesPending.size,
    };
  }, [employeeLookup, entries]);

  const selectedDayEntries = useMemo(() => {
    if (!selectedDay) return [] as TimeEntryRecord[];
    return entries.filter((entry) => {
      const clockIn = new Date(entry.clockIn);
      return entry.userId === selectedDay.employeeId && toLocalDateInput(clockIn) === selectedDay.dayKey;
    });
  }, [entries, selectedDay]);

  const groupedByEmployee = useMemo(() => {
    const map = new Map<number, TimeEntryRecord[]>();
    for (const entry of entries) {
      const list = map.get(entry.userId) || [];
      list.push(entry);
      map.set(entry.userId, list);
    }
    return Array.from(map.entries()).map(([employeeId, list]) => ({ employeeId, entries: list, employeeName: employeeLookup.get(employeeId)?.name || "Employee" }));
  }, [employeeLookup, entries]);

  const openCreate = () => {
    setEditor(buildEntryEditor());
    setEditorOpen(true);
  };

  const openEdit = (entry: TimeEntryRecord) => {
    setEditor(buildEntryEditor(entry));
    setEditorOpen(true);
  };

  const openDuplicate = (entry: TimeEntryRecord) => {
    duplicateEntry.mutate({ id: entry.id });
  };

  const submitEditor = () => {
    if (!editor.userId) {
      toast.error("Select an employee.");
      return;
    }

    const date = editor.date;
    const clockIn = editor.clockInTime ? new Date(`${date}T${editor.clockInTime}:00`) : new Date(date + "T00:00:00");
    const hasTotalHours = editor.totalHours.trim().length > 0;
    const clockOut = hasTotalHours
      ? null
      : editor.clockOutTime.trim().length > 0
        ? new Date(`${date}T${editor.clockOutTime}:00`)
        : null;

    saveEntry.mutate({
      id: editor.id ?? undefined,
      data: {
        userId: editor.userId,
        jobId: editor.jobId,
        clockIn: clockIn.toISOString(),
        clockOut: clockOut ? clockOut.toISOString() : null,
        totalHours: hasTotalHours ? parseNumeric(editor.totalHours) : null,
        breakMinutes: parseNumeric(editor.breakMinutes),
        notes: editor.notes,
        managerNotes: editor.managerNotes,
        notAtJobsiteReason: editor.notAtJobsiteReason,
        isManual: editor.isManual,
        isIslandJob: editor.isIslandJob,
        overtimeOverride: editor.overtimeOverride,
        reviewStatus: editor.reviewStatus,
        workType: editor.workType as any,
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Time Tracking"
        description="Weekly approvals, detailed time logs, and fast manual fixes."
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add Manual Hours
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={[
              "rounded-md px-3 py-2 text-sm font-medium transition",
              tab === item.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="card p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <FilterSelect label="Week" value={selectedWeek} onChange={setSelectedWeek} options={Array.from({ length: 8 }).map((_, i) => {
                const week = addDays(weekStartDate, i * 7);
                return { value: toLocalDateInput(week), label: `${toLocalDateInput(week)}` };
              })} />
              <FilterSelect
                label="Employee"
                value={employeeFilter}
                onChange={setEmployeeFilter}
                options={[{ value: "", label: "All employees" }, ...employeeOptions.map((employee) => ({ value: String(employee.id), label: employee.name }))]}
              />
              <FilterSelect
                label="Project"
                value={projectFilter}
                onChange={setProjectFilter}
                options={[{ value: "", label: "All projects" }, ...projectOptions.map((job) => ({ value: String(job.id), label: job.name }))]}
              />
              <FilterSelect
                label="Status"
                value={reviewFilter}
                onChange={(value) => setReviewFilter(value as ReviewStatus | "all")}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "pending", label: "Pending" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                ]}
              />
              <ToggleFilter label="Island Jobs" value={islandFilter} onChange={setIslandFilter} />
              <ToggleFilter label="Manual Entries" value={manualFilter} onChange={setManualFilter} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="relative max-w-md flex-1">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-9"
                  placeholder="Search employee, project, address, or notes"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button className="btn btn-secondary" onClick={resetFilters}>
                Reset
              </button>
            </div>
          </div>

          {tab === "overview" && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-base font-semibold">Weekly dashboard</div>
                  <div className="text-sm text-slate-500">Sunday through Saturday with total, payroll, and approval status.</div>
                </div>
                <div className="text-sm text-slate-500">Click a day to open that day&apos;s entries</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <SortableHeader label="Employee" active={sortKey === "employee"} direction={sortDir} onClick={() => setSortKeyToggle(setSortKey, setSortDir, "employee")} />
                      {WEEKDAY_LABELS.map((label) => (
                        <th key={label} className="px-3 py-2 font-medium text-center">{label}</th>
                      ))}
                      <SortableHeader label="Weekly Total" active={sortKey === "hours"} direction={sortDir} onClick={() => setSortKeyToggle(setSortKey, setSortDir, "hours")} align="right" />
                      <th className="px-3 py-2 font-medium text-right">Regular</th>
                      <th className="px-3 py-2 font-medium text-right">Overtime</th>
                      <th className="px-3 py-2 font-medium text-right">Island</th>
                      <th className="px-3 py-2 font-medium text-right">Payroll</th>
                      <SortableHeader label="Status" active={sortKey === "status"} direction={sortDir} onClick={() => setSortKeyToggle(setSortKey, setSortDir, "status")} />
                    </tr>
                  </thead>
                  <tbody>
                    {listQuery.isLoading ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                          <div className="font-medium">Loading weekly dashboard…</div>
                          <div className="mt-1 text-xs text-slate-400">Preparing employee totals and day-by-day status.</div>
                        </td>
                      </tr>
                    ) : overviewGroups.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                          <div className="font-medium">No time entries found for this week.</div>
                          <div className="mt-1 text-xs text-slate-400">Try different filters or add a manual time row.</div>
                          <div className="mt-3 flex justify-center gap-2">
                            <button className="btn btn-secondary" onClick={resetFilters}>Clear Filters</button>
                            <button className="btn btn-primary" onClick={openCreate}>Add Manual Hours</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      overviewGroups.map((group) => (
                        <tr key={group.employeeId} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-3 font-medium">
                            <div>{group.employeeName}</div>
                            <div className="text-xs text-slate-500">{formatHours(group.weeklyTotal)}</div>
                          </td>
                          {group.days.map((day) => (
                            <td key={day.key} className="px-2 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedDay({ employeeId: group.employeeId, dayKey: toLocalDateInput(dayMap.get(day.key) || new Date()) })}
                                className={[
                                  "w-full rounded-lg border px-2 py-2 text-left transition",
                                  day.status === "empty" ? "border-slate-200 bg-slate-50 text-slate-400" : day.status === "approved" ? "border-emerald-200 bg-emerald-50" : day.status === "rejected" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50",
                                ].join(" ")}
                              >
                                <div className="text-xs uppercase tracking-wide text-slate-500">{day.label.slice(0, 3)}</div>
                                <div className="mt-1 text-sm font-semibold text-slate-900">{day.hours ? formatHours(day.hours) : "—"}</div>
                                <div className={["mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", entryStatusTone(day.status)].join(" ")}>{entryStatusLabel(day.status)}</div>
                              </button>
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right font-semibold">{formatHours(group.weeklyTotal)}</td>
                          <td className="px-3 py-3 text-right">{formatHours(group.regularHours)}</td>
                          <td className="px-3 py-3 text-right">{formatHours(group.overtimeHours)}</td>
                          <td className="px-3 py-3 text-right">{formatHours(group.islandHours)}</td>
                          <td className="px-3 py-3 text-right font-semibold">${group.estimatedPayroll.toFixed(2)}</td>
                          <td className="px-3 py-3">
                            <span className={["inline-flex rounded-full px-2 py-0.5 text-xs font-medium", entryStatusTone(group.approvalStatus)].join(" ")}>{entryStatusLabel(group.approvalStatus)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "log" && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-base font-semibold">Detailed time log</div>
                  <div className="text-sm text-slate-500">Edit, duplicate, approve, reject, or delete entries without leaving this screen.</div>
                </div>
                <div className="text-sm text-slate-500">{entries.length} entries</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Employee</th>
                      <th className="px-3 py-2 font-medium">Project</th>
                      <th className="px-3 py-2 font-medium">Address</th>
                      <th className="px-3 py-2 font-medium">Clock In</th>
                      <th className="px-3 py-2 font-medium">Clock Out</th>
                      <th className="px-3 py-2 font-medium text-right">Break</th>
                      <th className="px-3 py-2 font-medium text-right">Total Hours</th>
                      <th className="px-3 py-2 font-medium">GPS</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listQuery.isLoading ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                          <div className="font-medium">Loading detailed log…</div>
                          <div className="mt-1 text-xs text-slate-400">Fetching entry details, location, and status.</div>
                        </td>
                      </tr>
                    ) : entries.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                          <div className="font-medium">No entries match the current filters.</div>
                          <div className="mt-1 text-xs text-slate-400">You can add a manual correction or clear filters.</div>
                          <div className="mt-3 flex justify-center gap-2">
                            <button className="btn btn-secondary" onClick={resetFilters}>Clear Filters</button>
                            <button className="btn btn-primary" onClick={openCreate}>Add Manual Hours</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry) => (
                        <tr key={entry.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-3 font-medium">{employeeLookup.get(entry.userId)?.name || "Employee"}</td>
                          <td className="px-3 py-3">{entry.job?.name ?? "—"}</td>
                          <td className="px-3 py-3 text-slate-600">{entry.job ? [entry.job.address, entry.job.city, entry.job.state].filter(Boolean).join(", ") : "—"}</td>
                          <td className="px-3 py-3">{formatDateTime(entry.clockIn)}</td>
                          <td className="px-3 py-3">{entry.clockOut ? formatDateTime(entry.clockOut) : "—"}</td>
                          <td className="px-3 py-3 text-right">{entry.breakMinutes ?? 0}m</td>
                          <td className="px-3 py-3 text-right font-semibold">{formatHours(entryHours(entry))}</td>
                          <td className="px-3 py-3 text-xs text-slate-600">{entry.clockInLatitude && entry.clockInLongitude ? "GPS captured" : "GPS missing"}</td>
                          <td className="px-3 py-3 text-xs text-slate-600">{entry.isManual ? "Manual" : "Mobile"}{entry.isIslandJob ? " · Island" : ""}</td>
                          <td className="px-3 py-3">
                            <span className={["inline-flex rounded-full px-2 py-0.5 text-xs font-medium", entryStatusTone(entry.reviewStatus || "pending")].join(" ")}>{REVIEW_STATUS_LABELS[entry.reviewStatus || "pending"]}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <ActionButton label="Edit" onClick={() => openEdit(entry)} icon={<Pencil className="h-3.5 w-3.5" />} />
                              <ActionButton label="Duplicate" onClick={() => openDuplicate(entry)} icon={<Copy className="h-3.5 w-3.5" />} />
                              <ActionButton label="Approve" onClick={() => approveEntry.mutate({ id: entry.id })} icon={<Check className="h-3.5 w-3.5" />} />
                              <ActionButton label="Reject" onClick={() => rejectEntry.mutate({ id: entry.id, managerNotes: quickManagerNote || undefined })} icon={<X className="h-3.5 w-3.5" />} />
                              <ActionButton label="Delete" onClick={() => removeEntry.mutate({ id: entry.id })} icon={<Trash2 className="h-3.5 w-3.5" />} />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "review" && (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">Approval workspace</div>
                    <div className="text-sm text-slate-500">Expand each employee, inspect each day, and bulk approve or reject with fewer clicks.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-secondary" disabled={!selectedEntries.length || bulkReview.isPending} onClick={() => applyBulkReview(selectedEntries, "approved")}>Approve Selected</button>
                    <button className="btn btn-secondary" disabled={!selectedEntries.length || bulkReview.isPending} onClick={() => applyBulkReview(selectedEntries, "rejected", quickManagerNote)}>Reject Selected</button>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Manager Note Templates</div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {MANAGER_NOTE_TEMPLATES.map((template) => (
                      <button
                        key={template}
                        type="button"
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-medium transition",
                          quickManagerNote === template ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        ].join(" ")}
                        onClick={() => setQuickManagerNote(template)}
                      >
                        {template}
                      </button>
                    ))}
                    <button type="button" className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50" onClick={() => setQuickManagerNote("")}>Clear</button>
                  </div>
                  <input
                    className="input"
                    placeholder="Optional note applied to reject actions"
                    value={quickManagerNote}
                    onChange={(event) => setQuickManagerNote(event.target.value)}
                  />
                </div>
              </div>

              {listQuery.isLoading ? (
                <div className="card p-8 text-center text-slate-500">
                  <div className="font-medium">Loading approval workspace…</div>
                  <div className="mt-1 text-xs text-slate-400">Grouping entries by employee and day.</div>
                </div>
              ) : groupedByEmployee.length === 0 ? (
                <div className="card p-8 text-center text-slate-500">
                  <div className="font-medium">Nothing to review for this filter set.</div>
                  <div className="mt-1 text-xs text-slate-400">Adjust filters or add a manual correction entry.</div>
                  <div className="mt-3 flex justify-center gap-2">
                    <button className="btn btn-secondary" onClick={resetFilters}>Clear Filters</button>
                    <button className="btn btn-primary" onClick={openCreate}>Add Manual Hours</button>
                  </div>
                </div>
              ) : (
                groupedByEmployee.map((group) => {
                  const employeeWeekEntries = group.entries;
                  const employeeWeekPay = calculatePayroll(employeeWeekEntries, Number(employeeLookup.get(group.employeeId)?.hourlyRate || 0));
                  const employeePending = employeeWeekEntries.filter((entry) => (entry.reviewStatus || "pending") === "pending").length;
                  return (
                    <details key={group.employeeId} className="card overflow-hidden" open>
                      <summary className="cursor-pointer list-none border-b border-slate-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-base font-semibold">{group.employeeName}</div>
                            <div className="text-sm text-slate-500">Weekly Total {formatHours(employeeWeekPay.weeklyTotal)} · Estimated Payroll ${employeeWeekPay.estimatedPayroll.toFixed(2)}</div>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <span>{formatHours(employeeWeekPay.regularHours)} regular</span>
                            <span>{formatHours(employeeWeekPay.overtimeHours)} overtime</span>
                            <span>{formatHours(employeeWeekPay.islandHours)} island</span>
                            <span>{employeePending} pending</span>
                          </div>
                        </div>
                      </summary>
                      <div className="space-y-2 p-4">
                        {WEEKDAY_LABELS.map((dayLabel, dayIndex) => {
                          const dayEntries = employeeWeekEntries.filter((entry) => new Date(entry.clockIn).getDay() === dayIndex);
                          const dayHours = dayEntries.reduce((sum, entry) => sum + entryHours(entry), 0);
                          const dayStatus = getDayStatus(dayEntries);
                          return (
                            <details key={dayLabel} className="rounded-xl border border-slate-200 bg-slate-50">
                              <summary className="cursor-pointer list-none px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                    <div className="font-medium">{dayLabel}</div>
                                  </div>
                                  <div className="flex items-center gap-3 text-sm">
                                    <span>{dayHours ? formatHours(dayHours) : "—"}</span>
                                    <span className={["inline-flex rounded-full px-2 py-0.5 text-xs font-medium", entryStatusTone(dayStatus)].join(" ")}>{entryStatusLabel(dayStatus)}</span>
                                  </div>
                                </div>
                              </summary>
                              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-2">
                                <button
                                  type="button"
                                  className="btn btn-secondary text-xs"
                                  disabled={!dayEntries.length || bulkReview.isPending}
                                  onClick={() => applyDayReview(dayEntries, "approved")}
                                >
                                  Approve Day
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary text-xs"
                                  disabled={!dayEntries.length || bulkReview.isPending}
                                  onClick={() => applyDayReview(dayEntries, "rejected")}
                                >
                                  Reject Day
                                </button>
                              </div>
                              <div className="overflow-x-auto border-t border-slate-200 bg-white">
                                <table className="w-full text-sm">
                                  <thead className="bg-slate-50 text-left">
                                    <tr>
                                      <th className="px-3 py-2 font-medium">Select</th>
                                      <th className="px-3 py-2 font-medium">Project</th>
                                      <th className="px-3 py-2 font-medium">Clock In</th>
                                      <th className="px-3 py-2 font-medium">Clock Out</th>
                                      <th className="px-3 py-2 font-medium">Break</th>
                                      <th className="px-3 py-2 font-medium">Notes</th>
                                      <th className="px-3 py-2 font-medium">GPS</th>
                                      <th className="px-3 py-2 font-medium">Hours</th>
                                      <th className="px-3 py-2 font-medium">Status</th>
                                      <th className="px-3 py-2 font-medium">Manager Notes</th>
                                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dayEntries.length === 0 ? (
                                      <tr>
                                        <td colSpan={11} className="px-3 py-6 text-center text-slate-500">No entries on this day.</td>
                                      </tr>
                                    ) : dayEntries.map((entry) => (
                                      <tr key={entry.id} className="border-t border-slate-100 align-top">
                                        <td className="px-3 py-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedEntries.includes(entry.id)}
                                            onChange={(e) => {
                                              setSelectedEntries((current) =>
                                                e.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id)
                                              );
                                            }}
                                          />
                                        </td>
                                        <td className="px-3 py-2">
                                          <div className="font-medium">{entry.job?.name ?? "—"}</div>
                                          <div className="text-xs text-slate-500">{entry.job ? [entry.job.address, entry.job.city].filter(Boolean).join(", ") : ""}</div>
                                        </td>
                                        <td className="px-3 py-2">{formatDateTime(entry.clockIn)}</td>
                                        <td className="px-3 py-2">{entry.clockOut ? formatDateTime(entry.clockOut) : "—"}</td>
                                        <td className="px-3 py-2">{entry.breakMinutes ?? 0}m</td>
                                        <td className="px-3 py-2 text-slate-600">{entry.notes || "—"}</td>
                                        <td className="px-3 py-2 text-xs text-slate-600">{entry.clockInLatitude ? "Captured" : "Missing"}</td>
                                        <td className="px-3 py-2 font-semibold">{formatHours(entryHours(entry))}</td>
                                        <td className="px-3 py-2">
                                          <span className={["inline-flex rounded-full px-2 py-0.5 text-xs font-medium", entryStatusTone(entry.reviewStatus || "pending")].join(" ")}>{REVIEW_STATUS_LABELS[entry.reviewStatus || "pending"]}</span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">{entry.managerNotes || "—"}</td>
                                        <td className="px-3 py-2 text-right">
                                          <div className="flex justify-end gap-1">
                                            <ActionButton label="Approve" onClick={() => applyBulkReview([entry.id], "approved")} icon={<Check className="h-3.5 w-3.5" />} />
                                            <ActionButton label="Reject" onClick={() => applyBulkReview([entry.id], "rejected", quickManagerNote)} icon={<X className="h-3.5 w-3.5" />} />
                                            <ActionButton label="Edit" onClick={() => openEdit(entry)} icon={<Pencil className="h-3.5 w-3.5" />} />
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  );
                })
              )}
            </div>
          )}

          {selectedDay && tab === "overview" ? (
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold">Day entries</div>
                  <div className="text-sm text-slate-500">{selectedDayEntries.length} entries for the selected day</div>
                </div>
                <button className="btn btn-secondary" onClick={() => setSelectedDay(null)}>Close</button>
              </div>
              <div className="space-y-2">
                {selectedDayEntries.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{entry.job?.name ?? "No project"}</div>
                      <div className="text-slate-500">{formatHours(entryHours(entry))}</div>
                    </div>
                    <div className="mt-1 text-slate-600">{formatDateTime(entry.clockIn)} {entry.clockOut ? `- ${formatDateTime(entry.clockOut)}` : ""}</div>
                    <div className="mt-1 text-xs text-slate-500">{entry.notes || "No notes"}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="card p-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</div>
            <div className="mt-4 space-y-3 text-sm">
              <SummaryRow label="Total Hours" value={formatHours(summary.totalHours)} />
              <SummaryRow label="Pending Hours" value={formatHours(summary.pendingHours)} />
              <SummaryRow label="Approved Hours" value={formatHours(summary.approvedHours)} />
              <SummaryRow label="Payroll Total" value={`$${summary.payrollTotal.toFixed(2)}`} />
              <SummaryRow label="Employees Pending Approval" value={String(summary.employeesPendingApproval)} />
            </div>
          </div>

          <div className="card p-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bulk Actions</div>
            <div className="mt-3 space-y-2">
              <button className="btn btn-secondary w-full" onClick={() => applyBulkReview(selectedEntries, "approved")} disabled={!selectedEntries.length || bulkReview.isPending}>Approve Selected Entries</button>
              <button className="btn btn-secondary w-full" onClick={() => applyBulkReview(selectedEntries, "rejected", quickManagerNote)} disabled={!selectedEntries.length || bulkReview.isPending}>Reject Selected Entries</button>
              <button className="btn btn-secondary w-full" onClick={() => selectedEntries.length && applyBulkReview(selectedEntries, "approved")} disabled={bulkReview.isPending}>Approve Entire Employee</button>
              <button className="btn btn-secondary w-full" onClick={() => bulkReview.mutate({ reviewStatus: "approved", employeeId: employeeFilter ? Number(employeeFilter) : undefined, weekStart: selectedWeek, projectId: projectFilter ? Number(projectFilter) : undefined, search: search || undefined, manualEntries: manualFilter, islandJobs: islandFilter })} disabled={bulkReview.isPending}>Approve Entire Week</button>
              <button className="btn btn-secondary w-full" onClick={() => bulkReview.mutate({ reviewStatus: "rejected", employeeId: employeeFilter ? Number(employeeFilter) : undefined, weekStart: selectedWeek, projectId: projectFilter ? Number(projectFilter) : undefined, search: search || undefined, manualEntries: manualFilter, islandJobs: islandFilter, managerNotes: quickManagerNote || undefined })} disabled={bulkReview.isPending}>Reject Entire Week</button>
              <button className="btn btn-secondary w-full" onClick={() => bulkReview.mutate({ reviewStatus: "approved", projectId: projectFilter ? Number(projectFilter) : undefined, weekStart: selectedWeek })} disabled={bulkReview.isPending}>Approve Entire Project</button>
            </div>
          </div>
        </aside>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card flex max-h-[90vh] w-full max-w-4xl flex-col p-6">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{editor.id ? "Edit Manual Hours" : "Add Manual Hours"}</div>
                <div className="text-sm text-slate-500">Enter clock times or total hours. Manual rows stay editable.</div>
              </div>
              <button className="btn btn-secondary" onClick={() => setEditorOpen(false)}>
                Close
              </button>
            </div>
            <div className="grid gap-4 overflow-y-auto pr-1 md:grid-cols-2">
              <FieldSelect
                label="Employee"
                value={editor.userId ? String(editor.userId) : ""}
                onChange={(value) => setEditor((current) => ({ ...current, userId: value ? Number(value) : null }))}
                options={[{ value: "", label: "Select employee" }, ...employeeOptions.map((employee) => ({ value: String(employee.id), label: employee.name }))]}
              />
              <FieldSelect
                label="Project"
                value={editor.jobId ? String(editor.jobId) : ""}
                onChange={(value) => setEditor((current) => ({ ...current, jobId: value ? Number(value) : null }))}
                options={[{ value: "", label: "No project" }, ...projectOptions.map((job) => ({ value: String(job.id), label: job.name }))]}
              />
              <FieldInput label="Date" type="date" value={editor.date} onChange={(value) => setEditor((current) => ({ ...current, date: value }))} />
              <FieldSelect
                label="Source"
                value={editor.workType}
                onChange={(value) => setEditor((current) => ({ ...current, workType: value }))}
                options={[
                  { value: "job_site", label: "Job Site" },
                  { value: "shop", label: "Shop" },
                  { value: "office", label: "Office" },
                  { value: "travel", label: "Travel" },
                  { value: "meeting", label: "Meeting" },
                  { value: "training", label: "Training" },
                  { value: "other", label: "Other" },
                ]}
              />
              <FieldInput label="Clock In" type="time" value={editor.clockInTime} onChange={(value) => setEditor((current) => ({ ...current, clockInTime: value }))} />
              <FieldInput label="Clock Out" type="time" value={editor.clockOutTime} onChange={(value) => setEditor((current) => ({ ...current, clockOutTime: value }))} />
              <FieldInput label="Total Hours" type="number" value={editor.totalHours} onChange={(value) => setEditor((current) => ({ ...current, totalHours: value }))} helperText="Use this instead of clock out if needed." />
              <FieldInput label="Break Minutes" type="number" value={editor.breakMinutes} onChange={(value) => setEditor((current) => ({ ...current, breakMinutes: value }))} />
              <FieldTextArea label="Notes" value={editor.notes} onChange={(value) => setEditor((current) => ({ ...current, notes: value }))} />
              <div className="md:col-span-2">
                <label className="label">Manager Notes</label>
                <textarea className="input min-h-28" value={editor.managerNotes} onChange={(event) => setEditor((current) => ({ ...current, managerNotes: event.target.value }))} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {MANAGER_NOTE_TEMPLATES.map((template) => (
                    <button
                      key={template}
                      type="button"
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => setEditor((current) => ({ ...current, managerNotes: template }))}
                    >
                      {template}
                    </button>
                  ))}
                </div>
              </div>
              <FieldTextArea label="Not at Jobsite Reason" value={editor.notAtJobsiteReason} onChange={(value) => setEditor((current) => ({ ...current, notAtJobsiteReason: value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <ToggleCard label="Manual Entry" checked={editor.isManual} onChange={(checked) => setEditor((current) => ({ ...current, isManual: checked }))} />
                <ToggleCard label="Island Job" checked={editor.isIslandJob} onChange={(checked) => setEditor((current) => ({ ...current, isIslandJob: checked }))} />
                <ToggleCard label="Overtime Override" checked={editor.overtimeOverride} onChange={(checked) => setEditor((current) => ({ ...current, overtimeOverride: checked }))} />
                <FieldSelect
                  label="Review Status"
                  value={editor.reviewStatus}
                  onChange={(value) => setEditor((current) => ({ ...current, reviewStatus: value as ReviewStatus }))}
                  options={[
                    { value: "pending", label: "Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "rejected", label: "Rejected" },
                  ]}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="btn btn-secondary" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!editor.userId || saveEntry.isPending} onClick={submitEditor}>
                {saveEntry.isPending ? "Saving…" : "Save Time Entry"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
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

function ToggleFilter({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (value: boolean | undefined) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <button
        type="button"
        className="input text-left"
        onClick={() => onChange(value === undefined ? true : value ? false : undefined)}
      >
        {value === undefined ? "All" : value ? "Yes" : "No"}
      </button>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
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

function FieldInput({
  label,
  type,
  value,
  onChange,
  helperText,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {helperText ? <div className="mt-1 text-xs text-slate-500">{helperText}</div> : null}
    </div>
  );
}

function FieldTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="md:col-span-2">
      <label className="label">{label}</label>
      <textarea className="input min-h-28" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ToggleCard({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" className={["rounded-xl border px-3 py-3 text-left", checked ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"].join(" ")} onClick={() => onChange(!checked)}>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-slate-500">{checked ? "Enabled" : "Off"}</div>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="text-right text-slate-600">{value}</span>
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

function SortableHeader({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2 font-medium text-${align}`}>
      <button type="button" className="inline-flex items-center gap-1" onClick={onClick}>
        {label}
        {active ? (direction === "asc" ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : null}
      </button>
    </th>
  );
}

function setSortKeyToggle(
  setSortKey: React.Dispatch<React.SetStateAction<"employee" | "hours" | "payroll" | "status">>,
  setSortDir: React.Dispatch<React.SetStateAction<"asc" | "desc">>,
  key: "employee" | "hours" | "payroll" | "status"
) {
  setSortKey((current) => {
    setSortDir((dir) => (current === key ? (dir === "asc" ? "desc" : "asc") : "asc"));
    return key;
  });
}
