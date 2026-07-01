"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, Briefcase, Check, Clock3, Copy, Filter, MapPinned, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";

type TabId = "overview" | "log" | "review";
type ReviewMode = "employee" | "job" | "exceptions";
type ReviewStatus = "pending" | "approved" | "rejected";
type ExceptionFilter = "all" | "missing_clock_out" | "manual_entry" | "over_12_hours" | "no_gps" | "different_project_same_day" | "edited_after_approval" | "rejected" | "needs_attention";
type GpsFilter = "all" | "captured" | "missing";
type BoolFilter = "all" | "yes" | "no";

type ReviewFilters = {
  weekStart: string;
  employeeId: string;
  projectId: string;
  status: "all" | ReviewStatus;
  manual: BoolFilter;
  gps: GpsFilter;
  exceptionType: ExceptionFilter;
  search: string;
};

type TimeEntryRecord = {
  id: number;
  userId: number;
  approvedById: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  reviewStatus: ReviewStatus;
  managerNotes: string | null;
  notes: string | null;
  notAtJobsiteReason: string | null;
  breakMinutes: number;
  isManual: boolean;
  isIslandJob: boolean;
  workType: string | null;
  clockIn: Date | string;
  clockOut: Date | string | null;
  clockInLatitude: number | string | null;
  clockInLongitude: number | string | null;
  clockOutLatitude: number | string | null;
  clockOutLongitude: number | string | null;
  grossHours: number | string | null;
  paidHours: number | string | null;
  hoursWorked: number | string | null;
  user?: { id: number; name: string; hourlyRate: number | string | null };
  job?: { id: number; name: string; address: string | null; customer?: { name: string } | null; laborBudget?: number | string | null } | null;
};

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
  reviewStatus: ReviewStatus;
  workType: string;
};

const REVIEW_MODES: Array<{ id: ReviewMode; label: string; icon: React.ReactNode }> = [
  { id: "employee", label: "By Employee", icon: <UserRound className="h-4 w-4" /> },
  { id: "job", label: "By Job", icon: <Briefcase className="h-4 w-4" /> },
  { id: "exceptions", label: "Exceptions", icon: <AlertTriangle className="h-4 w-4" /> },
];

const NOTE_TEMPLATES = [
  "Missing clock out",
  "Wrong job selected",
  "Needs GPS review",
  "Hours need confirmation",
  "Duplicate entry",
  "Manual correction needed",
];

const FILTERS_KEY = "time-review-filters-v3";

function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekStart(date: Date) {
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

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function entryHours(entry: TimeEntryRecord) {
  return toNumber(entry.paidHours ?? entry.hoursWorked ?? entry.grossHours ?? 0);
}

function hasGps(entry: TimeEntryRecord) {
  return Boolean(entry.clockInLatitude && entry.clockInLongitude);
}

function wasEdited(entry: TimeEntryRecord) {
  const created = new Date(entry.createdAt).getTime();
  const updated = new Date(entry.updatedAt).getTime();
  return updated - created > 60_000;
}

function statusTone(status: ReviewStatus) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
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
      breakMinutes: "30",
      notes: "",
      managerNotes: "",
      notAtJobsiteReason: "",
      isManual: true,
      isIslandJob: false,
      reviewStatus: "pending",
      workType: "job_site",
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
    breakMinutes: String(entry.breakMinutes ?? 0),
    notes: entry.notes || "",
    managerNotes: entry.managerNotes || "",
    notAtJobsiteReason: entry.notAtJobsiteReason || "",
    isManual: Boolean(entry.isManual),
    isIslandJob: Boolean(entry.isIslandJob),
    reviewStatus: entry.reviewStatus || "pending",
    workType: entry.workType || "job_site",
  };
}

function defaultFilters(): ReviewFilters {
  return {
    weekStart: toDateInput(weekStart(new Date())),
    employeeId: "",
    projectId: "",
    status: "all",
    manual: "all",
    gps: "all",
    exceptionType: "all",
    search: "",
  };
}

export default function TimePage() {
  const utils = api.useUtils();
  const [tab, setTab] = useState<TabId>("review");
  const [mode, setMode] = useState<ReviewMode>("exceptions");
  const [filters, setFilters] = useState<ReviewFilters>(() => {
    if (typeof window === "undefined") return defaultFilters();
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (!raw) return defaultFilters();
      return { ...defaultFilters(), ...JSON.parse(raw) } as ReviewFilters;
    } catch {
      return defaultFilters();
    }
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkMoveProject, setBulkMoveProject] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EntryEditorState>(buildEditor());

  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  const employees = api.employees.list.useQuery();
  const jobs = api.jobs.list.useQuery();

  const listQuery = api.time.listAll.useQuery({
    weekStart: filters.weekStart,
    employeeId: filters.employeeId ? Number(filters.employeeId) : undefined,
    projectId: filters.projectId ? Number(filters.projectId) : undefined,
    reviewStatus: filters.status === "all" ? undefined : filters.status,
    manualEntries: filters.manual === "all" ? undefined : filters.manual === "yes",
    search: filters.search.trim() || undefined,
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

  const approve = api.time.approve.useMutation({
    onSuccess: () => {
      toast.success("Approved");
      void utils.time.listAll.invalidate();
    },
  });

  const reject = api.time.reject.useMutation({
    onSuccess: () => {
      toast.success("Rejected");
      void utils.time.listAll.invalidate();
    },
  });

  const duplicateEntry = api.time.duplicateEntry.useMutation({
    onSuccess: () => {
      toast.success("Duplicated");
      void utils.time.listAll.invalidate();
    },
  });

  const removeEntry = api.time.remove.useMutation({
    onSuccess: () => {
      toast.success("Deleted");
      void utils.time.listAll.invalidate();
    },
  });

  const bulkReview = api.time.bulkReview.useMutation({
    onSuccess: () => {
      toast.success("Review updated");
      void utils.time.listAll.invalidate();
      setSelectedIds([]);
    },
  });

  const bulkTools = api.time.bulkTools.useMutation({
    onSuccess: () => {
      toast.success("Bulk action complete");
      void utils.time.listAll.invalidate();
      setSelectedIds([]);
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = (listQuery.data || []) as TimeEntryRecord[];
  const employeeLookup = useMemo(() => new Map((employees.data || []).map((e) => [e.id, e])), [employees.data]);
  const jobLookup = useMemo(() => new Map((jobs.data || []).map((j) => [j.id, j])), [jobs.data]);

  const sameDayProjectExceptionIds = useMemo(() => {
    const byEmployeeDay = new Map<string, Set<number | null>>();
    for (const entry of rows) {
      const day = toDateInput(new Date(entry.clockIn));
      const key = `${entry.userId}-${day}`;
      const set = byEmployeeDay.get(key) || new Set<number | null>();
      set.add(entry.job?.id ?? null);
      byEmployeeDay.set(key, set);
    }

    const result = new Set<number>();
    for (const entry of rows) {
      const day = toDateInput(new Date(entry.clockIn));
      const key = `${entry.userId}-${day}`;
      const projects = byEmployeeDay.get(key);
      if (projects && projects.size > 1) result.add(entry.id);
    }
    return result;
  }, [rows]);

  const exceptionFlags = useMemo(() => {
    const map = new Map<number, ExceptionFilter[]>();
    for (const entry of rows) {
      const flags: ExceptionFilter[] = [];
      const hours = entryHours(entry);
      const attention = (entry.managerNotes || "").toLowerCase();

      if (!entry.clockOut) flags.push("missing_clock_out");
      if (entry.isManual) flags.push("manual_entry");
      if (hours > 12) flags.push("over_12_hours");
      if (!hasGps(entry)) flags.push("no_gps");
      if (sameDayProjectExceptionIds.has(entry.id)) flags.push("different_project_same_day");
      if (entry.approvedById && (entry.reviewStatus !== "approved" || wasEdited(entry))) flags.push("edited_after_approval");
      if (entry.reviewStatus === "rejected") flags.push("rejected");
      if (flags.length || attention.includes("attention") || (entry.notAtJobsiteReason || "").trim()) flags.push("needs_attention");

      map.set(entry.id, flags);
    }
    return map;
  }, [rows, sameDayProjectExceptionIds]);

  const filteredRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((entry) => {
      if (filters.gps === "captured" && !hasGps(entry)) return false;
      if (filters.gps === "missing" && hasGps(entry)) return false;
      if (filters.manual === "yes" && !entry.isManual) return false;
      if (filters.manual === "no" && entry.isManual) return false;
      if (filters.exceptionType !== "all" && !exceptionFlags.get(entry.id)?.includes(filters.exceptionType)) return false;

      if (!q) return true;
      const haystack = [
        entry.user?.name || employeeLookup.get(entry.userId)?.name || "",
        entry.job?.name || "",
        entry.job?.address || "",
        entry.notes || "",
        entry.managerNotes || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [employeeLookup, exceptionFlags, filters.exceptionType, filters.gps, filters.manual, filters.search, rows]);

  const dashboard = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejectedCount = 0;
    let manualEntries = 0;
    let totalHours = 0;
    let payrollCost = 0;
    let overtimeHours = 0;

    const byEmployee = new Map<number, number>();

    for (const entry of filteredRows) {
      const hours = entryHours(entry);
      const rate = toNumber(entry.user?.hourlyRate ?? employeeLookup.get(entry.userId)?.hourlyRate ?? 0);
      totalHours += hours;
      payrollCost += hours * rate;

      if (entry.reviewStatus === "pending") pending += 1;
      if (entry.reviewStatus === "approved") approved += 1;
      if (entry.reviewStatus === "rejected") rejectedCount += 1;
      if (entry.isManual) manualEntries += 1;

      byEmployee.set(entry.userId, (byEmployee.get(entry.userId) || 0) + hours);
    }

    for (const weeklyHours of byEmployee.values()) {
      overtimeHours += Math.max(0, weeklyHours - 40);
    }

    return { pending, approved, rejected: rejectedCount, manualEntries, totalHours, payrollCost, overtimeHours };
  }, [employeeLookup, filteredRows]);

  const employeeGroups = useMemo(() => {
    const map = new Map<number, TimeEntryRecord[]>();
    for (const entry of filteredRows) {
      const list = map.get(entry.userId) || [];
      list.push(entry);
      map.set(entry.userId, list);
    }

    return Array.from(map.entries())
      .map(([employeeId, entries]) => {
        const name = entries[0]?.user?.name || employeeLookup.get(employeeId)?.name || "Employee";
        const hourlyRate = toNumber(entries[0]?.user?.hourlyRate ?? employeeLookup.get(employeeId)?.hourlyRate ?? 0);
        const weeklyHours = entries.reduce((sum, entry) => sum + entryHours(entry), 0);
        const islandHours = entries.filter((e) => e.isIslandJob).reduce((sum, e) => sum + entryHours(e), 0);
        const travelHours = entries.filter((e) => e.workType === "travel").reduce((sum, e) => sum + entryHours(e), 0);
        const regularHours = Math.min(40, weeklyHours);
        const overtime = Math.max(0, weeklyHours - 40);
        const payroll = regularHours * hourlyRate + overtime * hourlyRate * 1.5 + islandHours * hourlyRate * 1.25;

        const days = new Map<string, TimeEntryRecord[]>();
        for (const entry of entries) {
          const day = toDateInput(new Date(entry.clockIn));
          const list = days.get(day) || [];
          list.push(entry);
          days.set(day, list);
        }

        const statuses = new Set(entries.map((e) => e.reviewStatus));
        const status: ReviewStatus | "mixed" = statuses.size === 1 ? entries[0].reviewStatus : "mixed";

        return { employeeId, name, entries, days, weeklyHours, regularHours, overtime, islandHours, travelHours, payroll, status };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employeeLookup, filteredRows]);

  const jobGroups = useMemo(() => {
    const map = new Map<string, TimeEntryRecord[]>();
    for (const entry of filteredRows) {
      const key = String(entry.job?.id || 0);
      const list = map.get(key) || [];
      list.push(entry);
      map.set(key, list);
    }

    return Array.from(map.entries()).map(([key, entries]) => {
      const jobName = entries[0]?.job?.name || "Unassigned Project";
      const address = entries[0]?.job?.address || "No address";

      const byEmployee = new Map<number, { name: string; hours: number }>();
      let payroll = 0;
      let actualHours = 0;
      for (const entry of entries) {
        const hours = entryHours(entry);
        const rate = toNumber(entry.user?.hourlyRate ?? employeeLookup.get(entry.userId)?.hourlyRate ?? 0);
        payroll += hours * rate;
        actualHours += hours;

        const current = byEmployee.get(entry.userId) || { name: entry.user?.name || employeeLookup.get(entry.userId)?.name || "Employee", hours: 0 };
        current.hours += hours;
        byEmployee.set(entry.userId, current);
      }

      const avgRate = Math.max(1, entries.reduce((sum, e) => sum + toNumber(e.user?.hourlyRate ?? employeeLookup.get(e.userId)?.hourlyRate ?? 0), 0) / Math.max(1, entries.length));
      const laborBudget = toNumber(entries[0]?.job?.laborBudget ?? 0);
      const estimatedHours = laborBudget > 0 ? laborBudget / avgRate : 0;
      const difference = actualHours - estimatedHours;

      return {
        key,
        jobName,
        address,
        entries,
        byEmployee: Array.from(byEmployee.values()).sort((a, b) => b.hours - a.hours),
        payroll,
        actualHours,
        estimatedHours,
        difference,
      };
    });
  }, [employeeLookup, filteredRows]);

  const exceptionGroups = useMemo(() => {
    const buckets: Record<ExceptionFilter, TimeEntryRecord[]> = {
      all: [],
      missing_clock_out: [],
      manual_entry: [],
      over_12_hours: [],
      no_gps: [],
      different_project_same_day: [],
      edited_after_approval: [],
      rejected: [],
      needs_attention: [],
    };

    for (const entry of filteredRows) {
      const flags = exceptionFlags.get(entry.id) || [];
      for (const flag of flags) buckets[flag].push(entry);
    }

    return buckets;
  }, [exceptionFlags, filteredRows]);

  const loading = listQuery.isLoading;

  const applyBulkReview = (ids: number[], status: ReviewStatus) => {
    if (!ids.length) return toast.error("Select at least one entry.");
    bulkReview.mutate({ ids, reviewStatus: status, managerNotes: status === "rejected" ? bulkNote || undefined : undefined });
  };

  const runBulkTool = (action: "assign_note" | "move_project" | "duplicate" | "delete") => {
    if (!selectedIds.length) return toast.error("Select at least one entry.");
    if (action === "move_project" && !bulkMoveProject) return toast.error("Choose a project for move.");

    bulkTools.mutate({
      ids: selectedIds,
      action,
      managerNotes: action === "assign_note" ? bulkNote : undefined,
      projectId: action === "move_project" ? Number(bulkMoveProject) : undefined,
    });
  };

  const submitEditor = () => {
    if (!editor.userId) return toast.error("Select employee");

    const clockIn = new Date(`${editor.date}T${editor.clockInTime}:00`);
    const hasTotal = editor.totalHours.trim().length > 0;
    const clockOut = hasTotal ? null : editor.clockOutTime ? new Date(`${editor.date}T${editor.clockOutTime}:00`) : null;

    saveEntry.mutate({
      id: editor.id ?? undefined,
      data: {
        userId: editor.userId,
        jobId: editor.jobId,
        clockIn: clockIn.toISOString(),
        clockOut: clockOut ? clockOut.toISOString() : null,
        totalHours: hasTotal ? toNumber(editor.totalHours) : null,
        breakMinutes: toNumber(editor.breakMinutes),
        notes: editor.notes,
        managerNotes: editor.managerNotes,
        notAtJobsiteReason: editor.notAtJobsiteReason,
        isManual: editor.isManual,
        isIslandJob: editor.isIslandJob,
        reviewStatus: editor.reviewStatus,
        overtimeOverride: false,
        workType: editor.workType as any,
      },
    });
  };

  const resetFilters = () => setFilters(defaultFilters());

  return (
    <>
      <PageHeader
        title="Time Tracking"
        description="Payroll review workspace for weekly approvals, exceptions, and bulk corrections."
        actions={<button className="btn btn-primary" onClick={() => { setEditor(buildEditor()); setEditorOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add Manual Hours</button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <MetricCard icon={<Clock3 className="h-4 w-4" />} label="Pending Review" value={String(dashboard.pending)} tone="amber" />
        <MetricCard icon={<Check className="h-4 w-4" />} label="Approved" value={String(dashboard.approved)} tone="emerald" />
        <MetricCard icon={<X className="h-4 w-4" />} label="Rejected" value={String(dashboard.rejected)} tone="rose" />
        <MetricCard icon={<Pencil className="h-4 w-4" />} label="Manual Entries" value={String(dashboard.manualEntries)} tone="slate" />
        <MetricCard icon={<Clock3 className="h-4 w-4" />} label="Total Hours" value={dashboard.totalHours.toFixed(2)} tone="slate" />
        <MetricCard icon={<Briefcase className="h-4 w-4" />} label="Payroll Cost" value={`$${dashboard.payrollCost.toFixed(2)}`} tone="slate" />
        <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Overtime Hours" value={dashboard.overtimeHours.toFixed(2)} tone="amber" />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {["overview", "log", "review"].map((id) => (
          <button key={id} className={["rounded-md px-3 py-2 text-sm font-medium", tab === id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setTab(id as TabId)}>
            {id === "overview" ? "Overview" : id === "log" ? "Check In / Out" : "Review Time"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="space-y-4">
          <div className="card sticky top-4 z-20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Filter className="h-4 w-4" /> Filters</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FieldSelect label="Week" value={filters.weekStart} onChange={(value) => setFilters((s) => ({ ...s, weekStart: value }))} options={Array.from({ length: 8 }).map((_, i) => {
                const d = addDays(new Date(`${filters.weekStart}T00:00:00`), i * 7);
                const val = toDateInput(d);
                return { value: val, label: val };
              })} />
              <FieldSelect label="Employee" value={filters.employeeId} onChange={(value) => setFilters((s) => ({ ...s, employeeId: value }))} options={[{ value: "", label: "All employees" }, ...(employees.data || []).map((e) => ({ value: String(e.id), label: e.name }))]} />
              <FieldSelect label="Project" value={filters.projectId} onChange={(value) => setFilters((s) => ({ ...s, projectId: value }))} options={[{ value: "", label: "All projects" }, ...(jobs.data || []).map((j) => ({ value: String(j.id), label: j.name }))]} />
              <FieldSelect label="Status" value={filters.status} onChange={(value) => setFilters((s) => ({ ...s, status: value as ReviewFilters["status"] }))} options={[{ value: "all", label: "All" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} />
              <FieldSelect label="Manual" value={filters.manual} onChange={(value) => setFilters((s) => ({ ...s, manual: value as BoolFilter }))} options={[{ value: "all", label: "All" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
              <FieldSelect label="GPS" value={filters.gps} onChange={(value) => setFilters((s) => ({ ...s, gps: value as GpsFilter }))} options={[{ value: "all", label: "All" }, { value: "captured", label: "Captured" }, { value: "missing", label: "Missing" }]} />
              <FieldSelect label="Exceptions" value={filters.exceptionType} onChange={(value) => setFilters((s) => ({ ...s, exceptionType: value as ExceptionFilter }))} options={[
                { value: "all", label: "All" },
                { value: "missing_clock_out", label: "Missing clock out" },
                { value: "manual_entry", label: "Manual entry" },
                { value: "over_12_hours", label: "Over 12 hours" },
                { value: "no_gps", label: "No GPS" },
                { value: "different_project_same_day", label: "Different project same day" },
                { value: "edited_after_approval", label: "Edited after approval" },
                { value: "rejected", label: "Rejected" },
                { value: "needs_attention", label: "Needs manager attention" },
              ]} />
              <div>
                <label className="label">Search</label>
                <input className="input" value={filters.search} onChange={(event) => setFilters((s) => ({ ...s, search: event.target.value }))} placeholder="Employee, project, notes" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-secondary" onClick={resetFilters}>Reset</button>
              <button className="btn btn-secondary" onClick={() => setMode("exceptions")}>Focus Exceptions</button>
            </div>
          </div>

          {tab !== "review" ? (
            <div className="card p-6 text-sm text-slate-600">Review workspace is available in the Review Time tab.</div>
          ) : (
            <>
              <div className="card p-3">
                <div className="flex flex-wrap gap-2">
                  {REVIEW_MODES.map((option) => (
                    <button key={option.id} className={["inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium", mode === option.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")} onClick={() => setMode(option.id)}>
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? <div className="card p-8 text-center text-slate-500">Loading review workspace…</div> : null}

              {!loading && filteredRows.length === 0 ? (
                <div className="card p-8 text-center text-slate-500">
                  <div className="font-medium">No entries found for these filters.</div>
                  <div className="mt-2">
                    <button className="btn btn-secondary" onClick={resetFilters}>Clear Filters</button>
                  </div>
                </div>
              ) : null}

              {!loading && filteredRows.length > 0 && mode === "employee" ? (
                <div className="space-y-3">
                  {employeeGroups.map((group) => (
                    <details key={group.employeeId} className="card overflow-hidden" open>
                      <summary className="cursor-pointer list-none border-b border-slate-200 px-4 py-3">
                        <div className="grid gap-2 text-sm lg:grid-cols-8">
                          <div className="font-semibold text-slate-900">{group.name}</div>
                          <div>Weekly {group.weeklyHours.toFixed(2)}h</div>
                          <div>Regular {group.regularHours.toFixed(2)}h</div>
                          <div>Overtime {group.overtime.toFixed(2)}h</div>
                          <div>Island {group.islandHours.toFixed(2)}h</div>
                          <div>Travel {group.travelHours.toFixed(2)}h</div>
                          <div>Payroll ${group.payroll.toFixed(2)}</div>
                          <div><span className={["inline-flex rounded-full px-2 py-0.5 text-xs font-medium", group.status === "mixed" ? "bg-slate-100 text-slate-700" : statusTone(group.status)].join(" ")}>{group.status === "mixed" ? "Mixed" : group.status}</span></div>
                        </div>
                      </summary>
                      <div className="space-y-2 p-3">
                        {Array.from(group.days.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, dayEntries]) => (
                          <DayReviewCards
                            key={day}
                            day={day}
                            entries={dayEntries}
                            selectedIds={selectedIds}
                            setSelectedIds={setSelectedIds}
                            bulkNote={bulkNote}
                            onApproveDay={(ids) => applyBulkReview(ids, "approved")}
                            onRejectDay={(ids) => applyBulkReview(ids, "rejected")}
                            onApprove={(id) => approve.mutate({ id })}
                            onReject={(id) => reject.mutate({ id, managerNotes: bulkNote || undefined })}
                            onDuplicate={(id) => duplicateEntry.mutate({ id })}
                            onDelete={(id) => removeEntry.mutate({ id })}
                            onEdit={(entry) => { setEditor(buildEditor(entry)); setEditorOpen(true); }}
                          />
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}

              {!loading && filteredRows.length > 0 && mode === "job" ? (
                <div className="space-y-3">
                  {jobGroups.map((group) => (
                    <div key={group.key} className="card p-4">
                      <div className="mb-2 text-base font-semibold">{group.jobName}</div>
                      <div className="mb-3 text-sm text-slate-500">{group.address}</div>
                      <div className="grid gap-2 text-sm lg:grid-cols-5">
                        <div>Total Labor Hours {group.actualHours.toFixed(2)}</div>
                        <div>Estimated Hours {group.estimatedHours.toFixed(2)}</div>
                        <div>Actual Hours {group.actualHours.toFixed(2)}</div>
                        <div>Difference {group.difference.toFixed(2)}</div>
                        <div>Payroll Cost ${group.payroll.toFixed(2)}</div>
                      </div>
                      <div className="mt-3 space-y-1">
                        {group.byEmployee.map((row) => (
                          <div key={row.name} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                            <span>{row.name}</span>
                            <span>{row.hours.toFixed(2)}h</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!loading && filteredRows.length > 0 && mode === "exceptions" ? (
                <div className="space-y-3">
                  {([
                    ["missing_clock_out", "Missing clock out"],
                    ["manual_entry", "Manual entry"],
                    ["over_12_hours", "Over 12 hours"],
                    ["no_gps", "No GPS"],
                    ["different_project_same_day", "Different project same day"],
                    ["edited_after_approval", "Edited after approval"],
                    ["rejected", "Rejected"],
                    ["needs_attention", "Needs manager attention"],
                  ] as Array<[ExceptionFilter, string]>).map(([key, label]) => {
                    const entries = exceptionGroups[key];
                    if (!entries.length) return null;
                    return (
                      <details key={key} className="card overflow-hidden" open>
                        <summary className="cursor-pointer list-none border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                          {label} <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{entries.length}</span>
                        </summary>
                        <div className="space-y-2 p-3">
                          <DayReviewCards
                            day={label}
                            entries={entries}
                            selectedIds={selectedIds}
                            setSelectedIds={setSelectedIds}
                            bulkNote={bulkNote}
                            onApproveDay={(ids) => applyBulkReview(ids, "approved")}
                            onRejectDay={(ids) => applyBulkReview(ids, "rejected")}
                            onApprove={(id) => approve.mutate({ id })}
                            onReject={(id) => reject.mutate({ id, managerNotes: bulkNote || undefined })}
                            onDuplicate={(id) => duplicateEntry.mutate({ id })}
                            onDelete={(id) => removeEntry.mutate({ id })}
                            onEdit={(entry) => { setEditor(buildEditor(entry)); setEditorOpen(true); }}
                            collapsed
                          />
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bulk Tools</div>
            <div className="mt-3 space-y-2">
              <button className="btn btn-secondary w-full" disabled={!selectedIds.length || bulkReview.isPending} onClick={() => applyBulkReview(selectedIds, "approved")}>Approve selected</button>
              <button className="btn btn-secondary w-full" disabled={!selectedIds.length || bulkReview.isPending} onClick={() => applyBulkReview(selectedIds, "rejected")}>Reject selected</button>
              <input className="input" value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} placeholder="Manager note for selected" />
              <div className="flex flex-wrap gap-2">
                {NOTE_TEMPLATES.map((note) => (
                  <button key={note} className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700" onClick={() => setBulkNote(note)}>{note}</button>
                ))}
              </div>
              <button className="btn btn-secondary w-full" disabled={!selectedIds.length || bulkTools.isPending} onClick={() => runBulkTool("assign_note")}>Assign manager note</button>
              <select className="input" value={bulkMoveProject} onChange={(event) => setBulkMoveProject(event.target.value)}>
                <option value="">Move selected to project…</option>
                {(jobs.data || []).map((job) => <option key={job.id} value={String(job.id)}>{job.name}</option>)}
              </select>
              <button className="btn btn-secondary w-full" disabled={!selectedIds.length || bulkTools.isPending} onClick={() => runBulkTool("move_project")}>Move to another project</button>
              <button className="btn btn-secondary w-full" disabled={!selectedIds.length || bulkTools.isPending} onClick={() => runBulkTool("duplicate")}>Duplicate selected</button>
              <button className="btn btn-secondary w-full" disabled={!selectedIds.length || bulkTools.isPending} onClick={() => runBulkTool("delete")}>Delete selected</button>
            </div>
          </div>
        </aside>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card flex max-h-[90vh] w-full max-w-4xl flex-col p-6">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{editor.id ? "Edit Time Entry" : "Add Manual Hours"}</div>
                <div className="text-sm text-slate-500">Manual correction modal for payroll review.</div>
              </div>
              <button className="btn btn-secondary" onClick={() => setEditorOpen(false)}>Close</button>
            </div>
            <div className="grid gap-4 overflow-y-auto md:grid-cols-2">
              <FieldSelect label="Employee" value={editor.userId ? String(editor.userId) : ""} onChange={(value) => setEditor((s) => ({ ...s, userId: value ? Number(value) : null }))} options={[{ value: "", label: "Select employee" }, ...(employees.data || []).map((e) => ({ value: String(e.id), label: e.name }))]} />
              <FieldSelect label="Project" value={editor.jobId ? String(editor.jobId) : ""} onChange={(value) => setEditor((s) => ({ ...s, jobId: value ? Number(value) : null }))} options={[{ value: "", label: "No project" }, ...(jobs.data || []).map((j) => ({ value: String(j.id), label: j.name }))]} />
              <FieldInput label="Date" type="date" value={editor.date} onChange={(value) => setEditor((s) => ({ ...s, date: value }))} />
              <FieldSelect label="Source" value={editor.workType} onChange={(value) => setEditor((s) => ({ ...s, workType: value }))} options={[{ value: "job_site", label: "Job site" }, { value: "shop", label: "Shop" }, { value: "office", label: "Office" }, { value: "travel", label: "Travel" }, { value: "meeting", label: "Meeting" }, { value: "training", label: "Training" }, { value: "other", label: "Other" }]} />
              <FieldInput label="Clock In" type="time" value={editor.clockInTime} onChange={(value) => setEditor((s) => ({ ...s, clockInTime: value }))} />
              <FieldInput label="Clock Out" type="time" value={editor.clockOutTime} onChange={(value) => setEditor((s) => ({ ...s, clockOutTime: value }))} />
              <FieldInput label="Total Hours" type="number" value={editor.totalHours} onChange={(value) => setEditor((s) => ({ ...s, totalHours: value }))} />
              <FieldInput label="Break Minutes" type="number" value={editor.breakMinutes} onChange={(value) => setEditor((s) => ({ ...s, breakMinutes: value }))} />
              <FieldTextArea label="Notes" value={editor.notes} onChange={(value) => setEditor((s) => ({ ...s, notes: value }))} />
              <FieldTextArea label="Manager Notes" value={editor.managerNotes} onChange={(value) => setEditor((s) => ({ ...s, managerNotes: value }))} />
              <FieldTextArea label="Not at Jobsite Reason" value={editor.notAtJobsiteReason} onChange={(value) => setEditor((s) => ({ ...s, notAtJobsiteReason: value }))} />
              <FieldSelect label="Review Status" value={editor.reviewStatus} onChange={(value) => setEditor((s) => ({ ...s, reviewStatus: value as ReviewStatus }))} options={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="btn btn-secondary" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!editor.userId || saveEntry.isPending} onClick={submitEditor}>{saveEntry.isPending ? "Saving…" : "Save Entry"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DayReviewCards({
  day,
  entries,
  selectedIds,
  setSelectedIds,
  bulkNote,
  onApproveDay,
  onRejectDay,
  onApprove,
  onReject,
  onDuplicate,
  onEdit,
  onDelete,
  collapsed,
}: {
  day: string;
  entries: TimeEntryRecord[];
  selectedIds: number[];
  setSelectedIds: React.Dispatch<React.SetStateAction<number[]>>;
  bulkNote: string;
  onApproveDay: (ids: number[]) => void;
  onRejectDay: (ids: number[]) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDuplicate: (id: number) => void;
  onEdit: (entry: TimeEntryRecord) => void;
  onDelete: (id: number) => void;
  collapsed?: boolean;
}) {
  const ids = entries.map((entry) => entry.id);
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50" open={!collapsed}>
      <summary className="cursor-pointer list-none border-b border-slate-200 px-3 py-2 text-sm font-medium">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{day}</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary text-xs" onClick={(event) => { event.preventDefault(); onApproveDay(ids); }}>Approve Day</button>
            <button className="btn btn-secondary text-xs" onClick={(event) => { event.preventDefault(); onRejectDay(ids); }}>{bulkNote ? "Reject Day + Note" : "Reject Day"}</button>
          </div>
        </div>
      </summary>
      <div className="space-y-2 p-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{entry.job?.name || "No project"}</div>
              <div className="flex items-center gap-2">
                <span className={["rounded-full px-2 py-0.5 text-xs font-medium", statusTone(entry.reviewStatus)].join(" ")}>{entry.reviewStatus}</span>
                {entry.isManual ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Manual Entry</span> : null}
                {wasEdited(entry) ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Edited</span> : null}
              </div>
            </div>

            <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-6">
              <div><span className="font-medium text-slate-700">Clock In:</span> {formatDateTime(entry.clockIn)}</div>
              <div><span className="font-medium text-slate-700">Clock Out:</span> {entry.clockOut ? formatDateTime(entry.clockOut) : "Missing"}</div>
              <div><span className="font-medium text-slate-700">Hours:</span> {entryHours(entry).toFixed(2)}</div>
              <div className="inline-flex items-center gap-1"><MapPinned className="h-3.5 w-3.5" /> {hasGps(entry) ? "GPS captured" : "No GPS"}</div>
              <div><span className="font-medium text-slate-700">Manager Notes:</span> {entry.managerNotes || "-"}</div>
              <div>
                <input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} /> Select
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              <ActionButton label="Approve" icon={<Check className="h-3.5 w-3.5" />} onClick={() => onApprove(entry.id)} />
              <ActionButton label="Reject" icon={<X className="h-3.5 w-3.5" />} onClick={() => onReject(entry.id)} />
              <ActionButton label="Duplicate" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => onDuplicate(entry.id)} />
              <ActionButton label="Edit" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(entry)} />
              <ActionButton label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDelete(entry.id)} />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "amber" | "emerald" | "rose" | "slate" }) {
  const styles: Record<typeof tone, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  };
  return (
    <div className={["rounded-xl border p-3", styles[tone]].join(" ")}>
      <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">{icon}{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function ActionButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button className="btn btn-secondary text-xs" onClick={onClick}><span className="mr-1">{icon}</span>{label}</button>;
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function FieldInput({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function FieldTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="md:col-span-2">
      <label className="label">{label}</label>
      <textarea className="input min-h-20" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
