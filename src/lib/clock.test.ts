import { describe, expect, it } from "vitest";
import { CLOCK_IN_NOT_AT_JOBSITE, formatClockDuration, normalizeClockInJobId } from "./clock";

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
