import { describe, expect, it } from "vitest";
import { calculateEmployeePayroll } from "@/lib/employee-payroll";
import { buildPayrollSummaries, type PayrollEntry } from "@/lib/payroll-preview";

function entry(id: number, hours: number, rateType: PayrollEntry["rateType"] = "regular"): PayrollEntry {
  return {
    id,
    userId: 44,
    clockIn: `2026-11-0${id}T08:00:00-05:00`,
    clockOut: `2026-11-0${id}T17:00:00-05:00`,
    hoursWorked: hours,
    grossHours: hours,
    paidHours: hours,
    breakMinutes: 0,
    rateType,
    travelHours: 0,
    specialPayEnabled: false,
    notes: null,
    workType: null,
    user: { name: "Employee", hourlyRate: 20 },
    job: null,
  };
}

describe("straight-time payroll", () => {
  it("pays every hour at straight time even above 40 hours", () => {
    const result = buildPayrollSummaries(
      [entry(2, 9), entry(3, 9), entry(4, 9), entry(5, 9), entry(6, 9)],
      [{ id: 44, name: "Employee", hourlyRate: 20 }],
    )[0];

    expect(result.totalHours).toBe(45);
    expect(result.regularHours).toBe(45);
    expect(result.overtimeHours).toBe(0);
    expect(result.estimatedCheck).toBe(900);
  });

  it("preserves legacy overtime entries as normal paid hours", () => {
    const result = buildPayrollSummaries(
      [entry(2, 5, "overtime")],
      [{ id: 44, name: "Employee", hourlyRate: 20 }],
    )[0];

    expect(result.totalHours).toBe(5);
    expect(result.regularHours).toBe(5);
    expect(result.overtimeHours).toBe(0);
    expect(result.estimatedCheck).toBe(100);
    expect(result.details[0].rateLabel).toBe("Regular $20.00");
  });

  it("ignores legacy overtime configuration in employee previews", () => {
    const result = calculateEmployeePayroll({
      regularHours: 40,
      specialHours: 0,
      travelHours: 0,
      overtimeHours: 10,
      regularRate: 20,
      specialAdjustment: 0,
      overtimeMultiplier: 2,
      overtimeRate: 50,
      travelPayEnabled: false,
      travelRateType: "regular",
      customTravelRate: null,
    });

    expect(result.regularPay).toBe(800);
    expect(result.overtimePay).toBe(0);
    expect(result.estimatedGrossPay).toBe(800);
  });
});
