import { describe, expect, it } from "vitest";
import {
  calculateEntryMinutes,
  calculateEntryHours,
  calculateJobTracking,
  formatMinutesToHours,
  type TimeEntryLike,
} from "./job-tracking";
import { shouldRecomputeHourlyRateSnapshot } from "./employee-rate-resolver";

describe("Job Tracking Calculations", () => {
  it("preserves exact minutes and formats as 42h 30m / 42.50 hours", () => {
    const { formatted, decimalHours } = formatMinutesToHours(2550); // 42 * 60 + 30 = 2550
    expect(formatted).toBe("42h 30m");
    expect(decimalHours).toBe(42.5);
  });

  it("calculates exact minutes from clockIn and clockOut with break deduction", () => {
    const entry: TimeEntryLike = {
      userId: 1,
      clockIn: new Date("2026-09-10T08:00:00Z"),
      clockOut: new Date("2026-09-10T16:30:00Z"), // 8.5 hours = 510 minutes
      breakDeductionMinutes: 30, // 510 - 30 = 480 minutes (8.0 hours)
    };

    expect(calculateEntryMinutes(entry)).toBe(480);
  });

  it("handles overnight entries correctly", () => {
    const overnightEntry: TimeEntryLike = {
      userId: 1,
      clockIn: new Date("2026-09-10T22:00:00Z"),
      clockOut: new Date("2026-09-11T06:00:00Z"), // 8 hours = 480 minutes
    };

    expect(calculateEntryMinutes(overnightEntry)).toBe(480);
  });

  it("prioritizes authoritative explicit hours fields when present", () => {
    const manualEntry: TimeEntryLike = {
      userId: 1,
      clockIn: new Date("2026-09-10T08:00:00Z"),
      hoursWorked: 7.25, // 7h 15m = 435 minutes
    };

    expect(calculateEntryMinutes(manualEntry)).toBe(435);
  });

  it("includes all qualifying entries for target job and excludes other jobs", () => {
    const entries: TimeEntryLike[] = [
      {
        id: 1,
        jobId: 100,
        userId: 1,
        clockIn: "2026-09-10T08:00:00Z",
        hoursWorked: 8,
        user: { name: "Alice", hourlyRate: 25 },
      },
      {
        id: 2,
        jobId: 100,
        userId: 2,
        clockIn: "2026-09-10T08:00:00Z",
        hoursWorked: 4.5,
        user: { name: "Bob", hourlyRate: 20 },
      },
      {
        id: 3,
        jobId: 200, // Different job
        userId: 1,
        clockIn: "2026-09-10T08:00:00Z",
        hoursWorked: 10,
        user: { name: "Alice", hourlyRate: 25 },
      },
    ];

    const result = calculateJobTracking(entries, 100);
    expect(result.entriesCount).toBe(2);
    expect(result.totalHours).toBe(12.5);
    expect(result.formattedHours).toBe("12h 30m");
    expect(result.totalLaborCost).toBe(8 * 25 + 4.5 * 20); // 200 + 90 = 290
    expect(result.isLaborCostPending).toBe(false);

    expect(result.byEmployee).toHaveLength(2);
    expect(result.byEmployee[0]?.userName).toBe("Alice");
    expect(result.byEmployee[0]?.totalHours).toBe(8);
    expect(result.byEmployee[1]?.userName).toBe("Bob");
    expect(result.byEmployee[1]?.totalHours).toBe(4.5);
  });

  it("handles clock-generated, manual, and edited entries in one unified calculation", () => {
    const entries: TimeEntryLike[] = [
      // Clock-generated
      {
        jobId: 10,
        userId: 1,
        clockIn: new Date("2026-09-01T08:00:00Z"),
        clockOut: new Date("2026-09-01T12:15:00Z"), // 4h 15m = 255m
        user: { name: "Alice", hourlyRate: 30 },
      },
      // Manual entry
      {
        jobId: 10,
        userId: 1,
        clockIn: new Date("2026-09-01T13:00:00Z"),
        hoursWorked: 3.75, // 3h 45m = 225m
        user: { name: "Alice", hourlyRate: 30 },
      },
    ];

    const result = calculateJobTracking(entries, 10);
    expect(result.totalMinutes).toBe(255 + 225); // 480m = 8h
    expect(result.formattedHours).toBe("8h 0m");
    expect(result.totalHours).toBe(8);
    expect(result.totalLaborCost).toBe(240);
  });

  it("updates totals when an entry is edited", () => {
    const initialEntry: TimeEntryLike = {
      id: 1,
      jobId: 5,
      userId: 1,
      clockIn: "2026-09-05T08:00:00Z",
      hoursWorked: 5,
      user: { hourlyRate: 20 },
    };
    const initial = calculateJobTracking([initialEntry], 5);
    expect(initial.totalHours).toBe(5);
    expect(initial.totalLaborCost).toBe(100);

    // Edited entry with updated hours and rate
    const editedEntry: TimeEntryLike = {
      ...initialEntry,
      hoursWorked: 6.5,
      user: { hourlyRate: 25 },
    };
    const updated = calculateJobTracking([editedEntry], 5);
    expect(updated.totalHours).toBe(6.5);
    expect(updated.formattedHours).toBe("6h 30m");
    expect(updated.totalLaborCost).toBe(162.5);
  });

  it("calculates authoritative totals independently of client pagination", () => {
    // 60 entries (more than typical 50-item page limit)
    const allEntries: TimeEntryLike[] = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      jobId: 42,
      userId: 1,
      clockIn: new Date(2026, 8, 1, 8 + (i % 8), 0).toISOString(),
      hoursWorked: 1,
      user: { name: "Worker", hourlyRate: 20 },
    }));

    const result = calculateJobTracking(allEntries, 42);
    expect(result.entriesCount).toBe(60);
    expect(result.totalHours).toBe(60);
    expect(result.totalLaborCost).toBe(1200);
  });

  it("aggregates 29 decimal-hour entries before rounding to minutes", () => {
    const entries: TimeEntryLike[] = Array.from({ length: 29 }, (_, index) => ({
      id: index + 1,
      jobId: 253,
      userId: 1,
      clockIn: "2026-09-01T08:00:00Z",
      paidHours: index === 28 ? 3.43 : 7.43,
      user: { name: "Worker", hourlyRate: 25 },
    }));

    const result = calculateJobTracking(entries, 253);

    expect(result.totalHours).toBe(211.47);
    expect(result.totalMinutes).toBe(12688);
    expect(result.formattedHours).toBe("211h 28m");
  });

  it("keeps precise hours consistent across mixed sources and subtotals", () => {
    const entries: TimeEntryLike[] = [
      { jobId: 1, userId: 1, clockIn: "2026-09-01T08:00:00Z", paidHours: 1.01, user: { name: "Alice", hourlyRate: 20 } },
      { jobId: 1, userId: 1, clockIn: "2026-09-01T10:00:00Z", clockOut: "2026-09-01T11:00:00Z", user: { name: "Alice", hourlyRate: 20 } },
      { jobId: 1, userId: 2, clockIn: "2026-09-02T08:00:00Z", clockOut: "2026-09-02T09:00:00Z", breakMinutes: 15, user: { name: "Bob", hourlyRate: 30 } },
    ];

    const result = calculateJobTracking(entries, 1);

    expect(result.totalHours).toBe(2.76);
    expect(result.totalMinutes).toBe(166);
    expect(result.formattedHours).toBe("2h 46m");
    expect(result.byEmployee.reduce((sum, row) => sum + row.totalMinutes, 0)).toBe(result.totalMinutes);
    expect(result.byDate.reduce((sum, row) => sum + row.totalMinutes, 0)).toBe(result.totalMinutes);
    expect(result.totalLaborCost).toBe(62.7);
  });

  it("uses the authoritative hours field without per-entry minute inflation", () => {
    const entries: TimeEntryLike[] = Array.from({ length: 29 }, (_, index) => ({
      jobId: 253,
      userId: 1,
      clockIn: "2026-09-01T08:00:00Z",
      paidHours: index === 28 ? 3.43 : 7.43,
      user: { hourlyRate: 25 },
    }));

    expect(entries.reduce((sum, entry) => sum + calculateEntryHours(entry), 0)).toBeCloseTo(211.47);
    expect(calculateJobTracking(entries, 253).totalLaborCost).toBe(5286.75);
  });

  it("flags labor cost as pending if any employee hourly rate is missing", () => {
    const entries: TimeEntryLike[] = [
      {
        jobId: 1,
        userId: 1,
        clockIn: "2026-09-01T08:00:00Z",
        hoursWorked: 4,
        user: { name: "Alice", hourlyRate: 25 },
      },
      {
        jobId: 1,
        userId: 2,
        clockIn: "2026-09-01T08:00:00Z",
        hoursWorked: 4,
        user: { name: "Bob", hourlyRate: null }, // Missing rate
      },
    ];

    const result = calculateJobTracking(entries, 1);
    expect(result.totalHours).toBe(8);
    expect(result.isLaborCostPending).toBe(true);
    expect(result.totalLaborCost).toBe(100); // 4 * 25
  });
});

describe("Effective-dated hourly rate snapshots", () => {
  it("keeps entries before an effective date at the historical $21 rate", () => {
    const entries: TimeEntryLike[] = [
      { jobId: 1, userId: 1, clockIn: "2026-08-01T08:00:00Z", hoursWorked: 8, hourlyRateSnapshot: 21, user: { hourlyRate: 22 } },
      { jobId: 1, userId: 1, clockIn: "2026-08-10T08:00:00Z", hoursWorked: 8, hourlyRateSnapshot: 21, user: { hourlyRate: 22 } },
    ];

    const result = calculateJobTracking(entries, 1);
    expect(result.totalLaborCost).toBe(16 * 21);
  });

  it("uses the $22 rate for entries on or after the effective date", () => {
    const entries: TimeEntryLike[] = [
      { jobId: 1, userId: 1, clockIn: "2026-08-16T00:00:00Z", hoursWorked: 8, hourlyRateSnapshot: 22, user: { hourlyRate: 22 } },
      { jobId: 1, userId: 1, clockIn: "2026-08-20T08:00:00Z", hoursWorked: 8, hourlyRateSnapshot: 22, user: { hourlyRate: 22 } },
    ];

    const result = calculateJobTracking(entries, 1);
    expect(result.totalLaborCost).toBe(16 * 22);
  });

  it("does not let a later raise alter already-snapshotted historical costs", () => {
    const before: TimeEntryLike = { jobId: 1, userId: 1, clockIn: "2026-08-01T08:00:00Z", hoursWorked: 10, hourlyRateSnapshot: 21, user: { hourlyRate: 22 } };
    const after: TimeEntryLike = { jobId: 1, userId: 1, clockIn: "2026-09-01T08:00:00Z", hoursWorked: 10, hourlyRateSnapshot: 22, user: { hourlyRate: 22 } };

    const result = calculateJobTracking([before, after], 1);
    expect(result.totalLaborCost).toBe(10 * 21 + 10 * 22);
    expect(result.totalLaborCost).not.toBe(20 * 22);
  });

  it("computes correct mixed-rate job totals and flags the employee as mixed", () => {
    const entries: TimeEntryLike[] = [
      { jobId: 1, userId: 1, clockIn: "2026-08-01T08:00:00Z", hoursWorked: 5, hourlyRateSnapshot: 21, user: { name: "Alonso", hourlyRate: 22 } },
      { jobId: 1, userId: 1, clockIn: "2026-08-20T08:00:00Z", hoursWorked: 5, hourlyRateSnapshot: 22, user: { name: "Alonso", hourlyRate: 22 } },
    ];

    const result = calculateJobTracking(entries, 1);
    expect(result.totalLaborCost).toBe(5 * 21 + 5 * 22);
    expect(result.byEmployee).toHaveLength(1);
    expect(result.byEmployee[0]?.hasMixedRates).toBe(true);
    expect(result.byEmployee[0]?.hourlyRate).toBeNull();
  });

  it("reports a single consistent rate when an employee's entries all share one snapshot", () => {
    const entries: TimeEntryLike[] = [
      { jobId: 1, userId: 1, clockIn: "2026-08-20T08:00:00Z", hoursWorked: 5, hourlyRateSnapshot: 22, user: { hourlyRate: 22 } },
      { jobId: 1, userId: 1, clockIn: "2026-08-21T08:00:00Z", hoursWorked: 5, hourlyRateSnapshot: 22, user: { hourlyRate: 22 } },
    ];

    const result = calculateJobTracking(entries, 1);
    expect(result.byEmployee[0]?.hasMixedRates).toBe(false);
    expect(result.byEmployee[0]?.hourlyRate).toBe(22);
  });

  it("falls back safely to the current user rate when a snapshot is missing (legacy rows)", () => {
    const entries: TimeEntryLike[] = [
      { jobId: 1, userId: 1, clockIn: "2026-01-01T08:00:00Z", hoursWorked: 4, hourlyRateSnapshot: null, user: { hourlyRate: 20 } },
    ];

    const result = calculateJobTracking(entries, 1);
    expect(result.totalLaborCost).toBe(80);
  });

  it("preserves the snapshot when only notes or review status change (same user and clockIn)", () => {
    const existing = { userId: 1, clockIn: new Date("2026-08-20T08:00:00Z") };
    const next = { userId: 1, clockIn: new Date("2026-08-20T08:00:00Z") };
    expect(shouldRecomputeHourlyRateSnapshot(existing, next)).toBe(false);
  });

  it("recomputes the snapshot when the employee or clock-in date changes", () => {
    const existing = { userId: 1, clockIn: new Date("2026-08-20T08:00:00Z") };
    expect(shouldRecomputeHourlyRateSnapshot(existing, { userId: 2, clockIn: existing.clockIn })).toBe(true);
    expect(shouldRecomputeHourlyRateSnapshot(existing, { userId: 1, clockIn: new Date("2026-08-21T08:00:00Z") })).toBe(true);
  });

  it("always recomputes for a brand-new entry with no existing snapshot", () => {
    expect(shouldRecomputeHourlyRateSnapshot(null, { userId: 1, clockIn: new Date("2026-08-20T08:00:00Z") })).toBe(true);
  });
});
