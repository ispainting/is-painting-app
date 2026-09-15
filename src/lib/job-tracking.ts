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
 * Calculates exact elapsed minutes for a single time entry without loss of precision.
 *
 * Order of authority:
 * 1. Explicit paidHours / grossHours / hoursWorked if set (converted to exact minutes)
 * 2. Clock-out minus Clock-in timestamps (with break deduction in minutes)
 */
export function calculateEntryMinutes(entry: TimeEntryLike): number {
  const paidHours = parseNumeric(entry.paidHours);
  if (paidHours != null && paidHours > 0) {
    return Math.round(paidHours * 60);
  }

  const hoursWorked = parseNumeric(entry.hoursWorked);
  if (hoursWorked != null && hoursWorked > 0) {
    return Math.round(hoursWorked * 60);
  }

  const grossHours = parseNumeric(entry.grossHours);
  if (grossHours != null && grossHours > 0) {
    return Math.round(grossHours * 60);
  }

  if (entry.clockIn && entry.clockOut) {
    const start = new Date(entry.clockIn).getTime();
    const end = new Date(entry.clockOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 0;
    }

    const diffMinutes = Math.round((end - start) / 60_000);
    const breakDeduction = entry.breakDeductionMinutes ?? entry.breakMinutes ?? 0;
    const effectiveMinutes = Math.max(0, diffMinutes - breakDeduction);
    return effectiveMinutes;
  }

  return 0;
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

  let totalMinutes = 0;
  let totalLaborCost = 0;
  let isLaborCostPending = false;

  const employeeMap = new Map<number, EmployeeHoursSummary>();
  const dateMap = new Map<string, WorkdayHoursSummary>();

  for (const entry of qualifyingEntries) {
    const entryMinutes = calculateEntryMinutes(entry);
    totalMinutes += entryMinutes;

    const rate = parseNumeric(entry.user?.hourlyRate);
    const entryHours = entryMinutes / 60;
    const entryCost = rate != null && rate > 0 ? round2(entryHours * rate) : 0;

    if (entryMinutes > 0 && (rate == null || rate <= 0)) {
      isLaborCostPending = true;
    }
    totalLaborCost = round2(totalLaborCost + entryCost);

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
    existingEmp.totalMinutes += entryMinutes;
    existingEmp.totalHours = round2(existingEmp.totalMinutes / 60);
    existingEmp.formattedHours = formatMinutesToHours(existingEmp.totalMinutes).formatted;
    existingEmp.laborCost = round2(existingEmp.laborCost + entryCost);
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
    existingDate.totalMinutes += entryMinutes;
    existingDate.totalHours = round2(existingDate.totalMinutes / 60);
    existingDate.formattedHours = formatMinutesToHours(existingDate.totalMinutes).formatted;
    existingDate.laborCost = round2(existingDate.laborCost + entryCost);
    existingDate.entriesCount += 1;
    dateMap.set(dateKey, existingDate);
  }

  const { formatted, decimalHours } = formatMinutesToHours(totalMinutes);

  const byEmployee = Array.from(employeeMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  const byDate = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalMinutes,
    totalHours: decimalHours,
    formattedHours: formatted,
    totalLaborCost,
    isLaborCostPending: qualifyingEntries.length === 0 || isLaborCostPending,
    entriesCount: qualifyingEntries.length,
    byEmployee,
    byDate,
  };
}
