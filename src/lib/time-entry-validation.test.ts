import { describe, expect, it } from "vitest";
import { roundHoursToFiveMinutes, roundToFiveMinutes, timeEntryRangeError, timeRangesOverlap } from "./time-entry-validation";

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

describe("five-minute manual time increments", () => {
  it("rounds timestamps to the nearest five minutes", () => {
    expect(roundToFiveMinutes(new Date("2026-11-12T13:22:00.000Z")).toISOString()).toBe("2026-11-12T13:20:00.000Z");
    expect(roundToFiveMinutes(new Date("2026-11-12T13:23:00.000Z")).toISOString()).toBe("2026-11-12T13:25:00.000Z");
  });

  it("rounds decimal hours to five-minute increments", () => {
    expect(roundHoursToFiveMinutes(82 / 60)).toBeCloseTo(80 / 60);
    expect(roundHoursToFiveMinutes(83 / 60)).toBeCloseTo(85 / 60);
  });
});
