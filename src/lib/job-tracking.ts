import { round2 } from "./utils";

export interface TimeEntryLike {
  id?: number;
  userId: number;
  jobId?: number | null;
  clockIn: Date | string;
  clockOut?: Date | string | null;
  hoursWorked?: number | string | { toString(): string } | null;
  grossHours?: number | string | { toString(): string } | null;
  paidHours?: number | string | { toString(): string } | null;
  breakMinutes?: number | null;
  breakDeductionMinutes?: number | null;
  user?: {
    id?: number;
    name?: string | null;
    hourlyRate?: number | string | { toString(): string } | null;
  } | null;
}

export interface EmployeeHoursSummary {
  userId: number;
  userName: string;
  totalMinutes: number;
  totalHours: number;
  formattedHours: string;
  laborCost: number;
  hourlyRate: number | null;
  entriesCount: number;
}

export interface WorkdayHoursSummary {
  date: string; // YYYY-MM-DD
  totalMinutes: number;
  totalHours: number;
  formattedHours: string;
  laborCost: number;
  entriesCount: number;
}

export interface JobTrackingSummary {
  totalMinutes: number;
  totalHours: number;
  formattedHours: string;
  totalLaborCost: number;
  isLaborCostPending: boolean;
  entriesCount: number;
  byEmployee: EmployeeHoursSummary[];
  byDate: WorkdayHoursSummary[];
}

function parseNumeric(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const str = typeof val === "object" && val && "toString" in val ? val.toString() : String(val);
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Calculates precise decimal hours for a single time entry.
 *
 * Order of authority:
 * 1. Explicit paidHours / grossHours / hoursWorked if set
 * 2. Clock-out minus Clock-in timestamps (with break deduction in minutes)
 */
export function calculateEntryHours(entry: TimeEntryLike): number {
  const paidHours = parseNumeric(entry.paidHours);
  if (paidHours != null) {
    return paidHours;
  }

  const hoursWorked = parseNumeric(entry.hoursWorked);
  if (hoursWorked != null) {
    return hoursWorked;
  }

  const grossHours = parseNumeric(entry.grossHours);
  if (grossHours != null) {
    return grossHours;
  }

  if (entry.clockIn && entry.clockOut) {
    const start = new Date(entry.clockIn).getTime();
    const end = new Date(entry.clockOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 0;
    }

    const breakDeduction = entry.breakDeductionMinutes ?? entry.breakMinutes ?? 0;
    return Math.max(0, (end - start) / 3_600_000 - breakDeduction / 60);
  }

  return 0;
}

/** Calculates one entry's minutes for callers that need a standalone duration. */
export function calculateEntryMinutes(entry: TimeEntryLike): number {
  return Math.round(calculateEntryHours(entry) * 60);
}

/**
 * Formats a duration in minutes into standard representations:
 * - formatted: e.g. "42h 30m" (or "0h 0m" or "45m")
 * - decimalHours: e.g. 42.5
 */
export function formatMinutesToHours(totalMinutes: number): {
  formatted: string;
  decimalHours: number;
} {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  const decimalHours = round2(safeMinutes / 60);

  let formatted = `${hours}h ${minutes}m`;
  if (hours === 0 && minutes > 0) {
    formatted = `${minutes}m`;
  }

  return { formatted, decimalHours };
}

/**
 * Authoritatively calculates Job Tracking totals from an array of time entries.
 * Filters exclusively for the target jobId (if targetJobId is specified).
 */
export function calculateJobTracking(
  entries: TimeEntryLike[],
  targetJobId?: number | null
): JobTrackingSummary {
  const qualifyingEntries = targetJobId != null
    ? entries.filter((e) => e.jobId === targetJobId)
    : entries;

  let totalHours = 0;
  let totalLaborCost = 0;
  let isLaborCostPending = false;

  const employeeMap = new Map<number, EmployeeHoursSummary>();
  const employeePreciseHours = new Map<number, number>();
  const employeePreciseCosts = new Map<number, number>();
  const dateMap = new Map<string, WorkdayHoursSummary>();
  const datePreciseHours = new Map<string, number>();
  const datePreciseCosts = new Map<string, number>();

  for (const entry of qualifyingEntries) {
    const entryHours = calculateEntryHours(entry);
    totalHours += entryHours;

    const rate = parseNumeric(entry.user?.hourlyRate);
    const entryCost = rate != null && rate > 0 ? entryHours * rate : 0;

    if (entryHours > 0 && (rate == null || rate <= 0)) {
      isLaborCostPending = true;
    }
    totalLaborCost += entryCost;

    // Group by Employee
    const userId = entry.userId;
    const userName = entry.user?.name?.trim() || `Employee #${userId}`;
    const existingEmp = employeeMap.get(userId) ?? {
      userId,
      userName,
      totalMinutes: 0,
      totalHours: 0,
      formattedHours: "0h 0m",
      laborCost: 0,
      hourlyRate: rate,
      entriesCount: 0,
    };
    const preciseEmployeeHours = (employeePreciseHours.get(userId) ?? 0) + entryHours;
    const preciseEmployeeCost = (employeePreciseCosts.get(userId) ?? 0) + entryCost;
    employeePreciseHours.set(userId, preciseEmployeeHours);
    employeePreciseCosts.set(userId, preciseEmployeeCost);
    existingEmp.totalMinutes = Math.round(preciseEmployeeHours * 60);
    existingEmp.totalHours = round2(preciseEmployeeHours);
    existingEmp.formattedHours = formatMinutesToHours(existingEmp.totalMinutes).formatted;
    existingEmp.laborCost = round2(preciseEmployeeCost);
    existingEmp.entriesCount += 1;
    employeeMap.set(userId, existingEmp);

    // Group by Workday (Date)
    const clockInDate = new Date(entry.clockIn);
    const dateKey = Number.isFinite(clockInDate.getTime())
      ? clockInDate.toISOString().slice(0, 10)
      : "Unknown date";

    const existingDate = dateMap.get(dateKey) ?? {
      date: dateKey,
      totalMinutes: 0,
      totalHours: 0,
      formattedHours: "0h 0m",
      laborCost: 0,
      entriesCount: 0,
    };
    const preciseDateHours = (datePreciseHours.get(dateKey) ?? 0) + entryHours;
    const preciseDateCost = (datePreciseCosts.get(dateKey) ?? 0) + entryCost;
    datePreciseHours.set(dateKey, preciseDateHours);
    datePreciseCosts.set(dateKey, preciseDateCost);
    existingDate.totalMinutes = Math.round(preciseDateHours * 60);
    existingDate.totalHours = round2(preciseDateHours);
    existingDate.formattedHours = formatMinutesToHours(existingDate.totalMinutes).formatted;
    existingDate.laborCost = round2(preciseDateCost);
    existingDate.entriesCount += 1;
    dateMap.set(dateKey, existingDate);
  }

  const totalMinutes = Math.round(totalHours * 60);
  const { formatted } = formatMinutesToHours(totalMinutes);

  const byEmployee = Array.from(employeeMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  const byDate = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalMinutes,
    totalHours: round2(totalHours),
    formattedHours: formatted,
    totalLaborCost: round2(totalLaborCost),
    isLaborCostPending: qualifyingEntries.length === 0 || isLaborCostPending,
    entriesCount: qualifyingEntries.length,
    byEmployee,
    byDate,
  };
}
