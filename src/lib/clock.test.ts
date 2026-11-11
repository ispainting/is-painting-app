import { describe, expect, it } from "vitest";
import { CLOCK_IN_NOT_AT_JOBSITE, formatClockDuration, isWithinLiveShiftWindow, liveShiftCutoff, MAX_LIVE_SHIFT_HOURS, normalizeClockInJobId } from "./clock";

describe("formatClockDuration", () => {
  it("formats hours, minutes, and seconds clearly", () => {
    expect(formatClockDuration(0)).toBe("00:00:00");
    expect(formatClockDuration(65)).toBe("00:01:05");
    expect(formatClockDuration(3661)).toBe("01:01:01");
  });
});

describe("normalizeClockInJobId", () => {
  it("maps the not-at-jobsite sentinel to undefined", () => {
    expect(normalizeClockInJobId(CLOCK_IN_NOT_AT_JOBSITE)).toBeUndefined();
  });

  it("maps numeric job ids to numbers", () => {
    expect(normalizeClockInJobId("123")).toBe(123);
  });

  it("treats empty input as invalid", () => {
    expect(normalizeClockInJobId("")).toBeUndefined();
  });
});

describe("live shift window", () => {
  it("defines a 16-hour maximum live shift", () => {
    expect(MAX_LIVE_SHIFT_HOURS).toBe(16);
  });

  it("liveShiftCutoff is exactly 16 hours before now", () => {
    const now = new Date("2026-10-17T20:00:00.000Z");
    expect(liveShiftCutoff(now).toISOString()).toBe("2026-10-17T04:00:00.000Z");
  });

  it("includes entries inside the window and excludes older ones", () => {
    const now = new Date("2026-10-17T20:00:00.000Z");
    expect(isWithinLiveShiftWindow(new Date("2026-10-17T19:00:00.000Z"), now)).toBe(true);
    expect(isWithinLiveShiftWindow(new Date("2026-10-17T04:00:00.000Z"), now)).toBe(true); // exactly 16h
    expect(isWithinLiveShiftWindow(new Date("2026-10-17T03:59:00.000Z"), now)).toBe(false);
    expect(isWithinLiveShiftWindow("2026-02-23T02:12:19.000Z", now)).toBe(false); // Luis-style stale entry
  });
});
