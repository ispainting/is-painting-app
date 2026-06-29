import { describe, expect, it } from "vitest";
import { formatClockDuration, isValidClockInSelection } from "./clock";

describe("formatClockDuration", () => {
  it("formats hours, minutes, and seconds clearly", () => {
    expect(formatClockDuration(0)).toBe("00:00:00");
    expect(formatClockDuration(65)).toBe("00:01:05");
    expect(formatClockDuration(3661)).toBe("01:01:01");
  });
});

describe("isValidClockInSelection", () => {
  it("accepts the non-job option and selected job ids", () => {
    expect(isValidClockInSelection("")).toBe(true);
    expect(isValidClockInSelection(12)).toBe(true);
  });
});
