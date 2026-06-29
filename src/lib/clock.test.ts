import { describe, expect, it } from "vitest";
import { formatClockDuration } from "./clock";

describe("formatClockDuration", () => {
  it("formats hours, minutes, and seconds clearly", () => {
    expect(formatClockDuration(0)).toBe("00:00:00");
    expect(formatClockDuration(65)).toBe("00:01:05");
    expect(formatClockDuration(3661)).toBe("01:01:01");
  });
});
