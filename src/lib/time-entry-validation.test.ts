import { describe, expect, it } from "vitest";
import { timeEntryRangeError, timeRangesOverlap } from "./time-entry-validation";

describe("timeEntryRangeError", () => {
  const now = new Date("2026-11-12T15:00:00.000Z");

  it("allows a retroactive open clock-in", () => {
    expect(timeEntryRangeError(new Date("2026-11-12T13:00:00.000Z"), null, now)).toBeNull();
  });

  it("rejects future starts and exits before starts", () => {
    expect(timeEntryRangeError(new Date("2026-11-12T16:00:00.000Z"), null, now)).toBe("Clock-in cannot be in the future");
    expect(timeEntryRangeError(new Date("2026-11-12T13:00:00.000Z"), new Date("2026-11-12T12:00:00.000Z"), now)).toBe("Clock-out must be after clock-in");
  });
});

describe("timeRangesOverlap", () => {
  it("detects overlap with an open shift", () => {
    expect(timeRangesOverlap(
      { clockIn: new Date("2026-11-12T13:00:00.000Z"), clockOut: null },
      { clockIn: new Date("2026-11-12T14:00:00.000Z"), clockOut: new Date("2026-11-12T17:00:00.000Z") },
    )).toBe(true);
  });

  it("allows adjacent completed shifts", () => {
    expect(timeRangesOverlap(
      { clockIn: new Date("2026-11-12T13:00:00.000Z"), clockOut: new Date("2026-11-12T14:00:00.000Z") },
      { clockIn: new Date("2026-11-12T14:00:00.000Z"), clockOut: new Date("2026-11-12T17:00:00.000Z") },
    )).toBe(false);
  });
});
