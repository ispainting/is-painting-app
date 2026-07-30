import { calculateEmployeeGrossPay } from "../employee-payroll";
import { round2, toMoney } from "./money";
import type {
  JobFinancialContext,
  JobLaborVerificationReport,
  JobLaborVerificationRow,
  JobTimeEntryRecord,
} from "./types";

type LaborBucket = "actual" | "pending";

interface LaborAccumulator {
  total: number;
  hours: number;
}

interface LaborCostSummary {
  actualLaborCost: number;
  pendingLaborCost: number;
  actualLaborHours: number;
  pendingLaborHours: number;
}

function normalizeRateType(rateType: JobTimeEntryRecord["rateType"]): "regular" | "special" | "travel" | "overtime" {
  if (rateType === "island") return "special";
  if (rateType === "special") return "special";
  if (rateType === "travel") return "travel";
  if (rateType === "overtime") return "overtime";
  return "regular";
}

function deriveWorkedHours(entry: JobTimeEntryRecord): number {
  return toMoney(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked ?? 0);
}

function deriveSpecialAdjustment(entry: JobTimeEntryRecord): number {
  const specialEnabled = entry.specialPayEnabled || entry.isIslandJob;
  if (!specialEnabled) return 0;
  const configured = toMoney(entry.hourlyRateAdjustment);
  if (configured > 0) return configured;
  return entry.isIslandJob ? 2 : 0;
}

function deriveTravelRateType(context: JobFinancialContext): "regular" | "special" | "custom" {
  if (context.travelRateType === "island") return "special";
  if (context.travelRateType === "special") return "special";
  if (context.travelRateType === "custom") return "custom";
  return "regular";
}

function isApproved(entry: JobTimeEntryRecord): boolean {
  return entry.reviewStatus === "approved";
}

function isPending(entry: JobTimeEntryRecord): boolean {
  return entry.reviewStatus === "pending";
}

function deriveEntryLaborCost(context: JobFinancialContext, entry: JobTimeEntryRecord): {
  payType: "regular" | "special" | "travel" | "overtime";
  hours: number;
  rate: number;
  totalCost: number;
  regularCost: number;
  specialCost: number;
  travelCost: number;
  overtimeCost: number;
} {
  const payType = normalizeRateType(entry.rateType);
  const hours = deriveWorkedHours(entry);
  const baseRate = toMoney(entry.userHourlyRate);
  const specialAdjustment = deriveSpecialAdjustment(entry);

  const regularHours = payType === "regular" ? hours : 0;
  const specialHours = payType === "special" ? hours : 0;
  const overtimeHours = payType === "overtime" ? hours : 0;
  const travelHours = payType === "travel"
    ? hours
    : entry.travelHours != null
      ? toMoney(entry.travelHours)
      : 0;

  const payroll = calculateEmployeeGrossPay({
    regularHours,
    specialHours,
    travelHours,
    overtimeHours,
    regularRate: baseRate,
    specialAdjustment,
    overtimeMultiplier: 1.5,
    travelRateType: deriveTravelRateType(context),
    customTravelRate: context.customTravelRate,
  });

  const regularCost = round2(payroll.regularPay);
  const specialCost = round2(payroll.specialPay);
  const travelCost = round2(payroll.travelPay);
  const overtimeCost = round2(payroll.overtimePay);
  const totalCost = round2(regularCost + specialCost + travelCost + overtimeCost);

  const rate =
    payType === "special"
      ? payroll.specialRate
      : payType === "travel"
        ? payroll.travelRate
        : payType === "overtime"
          ? payroll.overtimeRate
          : payroll.regularRate;

  return {
    payType,
    hours,
    rate: round2(rate),
    totalCost,
    regularCost,
    specialCost,
    travelCost,
    overtimeCost,
  };
}

export function calculateLaborVerificationReport(
  context: JobFinancialContext,
  entries: JobTimeEntryRecord[]
): JobLaborVerificationReport {
  const rows: JobLaborVerificationRow[] = [];

  for (const entry of entries) {
    if (!isApproved(entry) && !isPending(entry)) continue;

    const status = isApproved(entry) ? "approved" : "pending";
    const derived = deriveEntryLaborCost(context, entry);

    rows.push({
      timeEntryId: entry.id,
      employee: entry.userName || `Employee #${entry.userId}`,
      hours: derived.hours,
      rate: derived.rate,
      payType: derived.payType,
      regular: derived.regularCost,
      island: entry.rateType === "island" ? derived.totalCost : 0,
      travel: derived.travelCost,
      special: derived.specialCost,
      cost: derived.totalCost,
      status,
    });
  }

  const actualTotal = round2(rows.filter((row) => row.status === "approved").reduce((sum, row) => sum + row.cost, 0));
  const pendingTotal = round2(rows.filter((row) => row.status === "pending").reduce((sum, row) => sum + row.cost, 0));

  return {
    actualTotal,
    pendingTotal,
    rows,
  };
}

export function calculateLaborCost(
  context: JobFinancialContext,
  entries: JobTimeEntryRecord[]
): LaborCostSummary {
  const report = calculateLaborVerificationReport(context, entries);

  const totals: Record<LaborBucket, LaborAccumulator> = {
    actual: { total: report.actualTotal, hours: 0 },
    pending: { total: report.pendingTotal, hours: 0 },
  };

  for (const entry of entries) {
    const hours = deriveWorkedHours(entry);
    if (isApproved(entry)) totals.actual.hours += hours;
    if (isPending(entry)) totals.pending.hours += hours;
  }

  return {
    actualLaborCost: round2(totals.actual.total),
    pendingLaborCost: round2(totals.pending.total),
    actualLaborHours: round2(totals.actual.hours),
    pendingLaborHours: round2(totals.pending.hours),
  };
}
