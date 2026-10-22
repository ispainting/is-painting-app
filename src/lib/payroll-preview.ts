export type PayrollEntry = {
  id: number;
  userId: number;
  clockIn: Date | string;
  clockOut: Date | string | null;
  hoursWorked: unknown;
  grossHours: unknown;
  paidHours: unknown;
  breakMinutes: number;
  breakStartedAt?: Date | string | null;
  breakEndedAt?: Date | string | null;
  breakDurationMinutes?: number | null;
  breakDeductionMinutes?: number | null;
  rateType?: "regular" | "island" | "special" | "travel" | "overtime" | null;
  travelHours?: unknown;
  isIslandJob?: boolean;
  specialPayEnabled: boolean;
  hourlyRateAdjustment?: unknown;
  notes: string | null;
  workType: string | null;
  user?: { name: string; hourlyRate: unknown };
  job?: {
    id: number; name: string; isIslandJob?: boolean; specialPayEnabled?: boolean;
    hourlyRateAdjustment?: unknown; travelPayEnabled?: boolean; defaultTravelHours?: unknown;
    travelRateType?: "regular" | "island" | "special" | "custom" | null; customTravelRate?: unknown;
  } | null;
};

const number = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
// These local-calendar keys preserve the Payroll Preview's existing weekly/travel allocation rules.
function dayKey(value: Date | string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function weekKey(value: Date | string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return dayKey(date);
}
function special(entry: PayrollEntry) {
  return Boolean(entry.specialPayEnabled || entry.isIslandJob || entry.job?.specialPayEnabled || entry.job?.isIslandJob);
}
function rates(entry: PayrollEntry, fallback: number) {
  const regularRate = number(entry.user?.hourlyRate ?? fallback);
  const raw = special(entry) ? number(entry.hourlyRateAdjustment ?? entry.job?.hourlyRateAdjustment ?? 0) : 0;
  const adjustment = raw > 0 ? raw : entry.isIslandJob || entry.job?.isIslandJob ? 2 : 0;
  return { regularRate, adjustment, effectiveRate: regularRate + adjustment, overtimeRate: (regularRate + adjustment) * 1.5 };
}
function rateType(entry: PayrollEntry) {
  if (entry.rateType === "travel" || entry.workType === "travel") return "travel";
  if (entry.rateType === "overtime") return "overtime";
  if (entry.rateType === "island" || entry.rateType === "special" || special(entry)) return "special";
  if (entry.job?.travelPayEnabled) return "travel";
  return "regular";
}
function travelRate(entry: PayrollEntry, fallback: number) {
  const r = rates(entry, fallback);
  const type = entry.job?.travelRateType || "regular";
  return type === "special" || type === "island" ? r.effectiveRate :
    type === "custom" ? number(entry.job?.customTravelRate ?? r.regularRate) : r.regularRate;
}

export function buildPayrollSummaries(
  rows: PayrollEntry[],
  employees: Array<{ id: number; name: string; hourlyRate: unknown }>
) {
  const groups = new Map<number, PayrollEntry[]>();
  for (const entry of rows) groups.set(entry.userId, [...(groups.get(entry.userId) ?? []), entry]);
  return Array.from(groups.entries()).map(([id, entries]) => {
    const sorted = [...entries].sort((a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime());
    const employee = employees.find(e => e.id === id);
    const name = sorted[0]?.user?.name || employee?.name || "Employee";
    const hourlyRate = number(sorted[0]?.user?.hourlyRate ?? employee?.hourlyRate ?? 0);
    const allocations = new Map<string, { anchor: number; hours: number; rate: number }>();
    const travelGroups = new Map<string, PayrollEntry[]>();
    const key = (entry: PayrollEntry) => `${entry.job?.id ?? 0}:${dayKey(entry.clockIn)}`;
    for (const entry of sorted) travelGroups.set(key(entry), [...(travelGroups.get(key(entry)) ?? []), entry]);
    for (const group of travelGroups.values()) {
      const explicit = group.find(e => e.travelHours !== null && e.travelHours !== undefined);
      const source = explicit ?? group.find(e => e.job?.travelPayEnabled);
      if (source) allocations.set(key(source), {
        anchor: explicit ? explicit.id : group[0].id,
        hours: number(explicit ? explicit.travelHours : source.job?.defaultTravelHours ?? 0),
        rate: travelRate(source, hourlyRate),
      });
    }
    let regularHours = 0, overtimeHours = 0, specialHours = 0, travelHours = 0, totalHours = 0, estimatedCheck = 0;
    const weeks = new Map<string, number>();
    const details = sorted.map(entry => {
      const hours = number(entry.paidHours ?? entry.hoursWorked ?? entry.grossHours ?? 0);
      const allocation = allocations.get(key(entry));
      const travel = allocation?.anchor === entry.id ? allocation.hours : 0;
      const wk = weekKey(entry.clockIn), prior = weeks.get(wk) ?? 0;
      const type = rateType(entry), r = rates(entry, hourlyRate);
      const overtime = type === "overtime" ? hours : Math.min(hours, Math.max(0, prior + hours - 40));
      const base = Math.max(0, hours - overtime);
      const specialPart = type === "special" || special(entry) ? base : 0;
      const regular = base - specialPart;
      weeks.set(wk, prior + hours);
      const travelPayRate = allocation?.rate ?? travelRate(entry, hourlyRate);
      const amount = regular * r.regularRate + specialPart * r.effectiveRate + travel * travelPayRate + overtime * r.overtimeRate;
      regularHours += regular; overtimeHours += overtime; specialHours += specialPart;
      travelHours += travel; totalHours += hours + travel; estimatedCheck += amount;
      const displayType = type === "regular" && specialPart > 0 ? "special" : type;
      const rateLabel = displayType === "special" ? `Special $${r.effectiveRate.toFixed(2)}` :
        displayType === "overtime" ? `Overtime ${r.overtimeRate.toFixed(2)}` :
          displayType === "travel" ? "Travel" : `Regular $${r.regularRate.toFixed(2)}`;
      return {
        id: entry.id, date: dayKey(entry.clockIn), clockIn: entry.clockIn, project: entry.job?.name || "No project",
        hours, travelHours: travel, rateLabel, adjustment: r.adjustment, effectiveRate: r.effectiveRate,
        travelLabel: travel > 0 ? `${travel.toFixed(2)}h @ $${travelPayRate.toFixed(2)}` : "—",
        dailyTotal: amount, notes: entry.notes || "",
      };
    });
    return { id, name, regularHours, overtimeHours, specialHours, travelHours, totalHours, hourlyRate, estimatedCheck, details };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
