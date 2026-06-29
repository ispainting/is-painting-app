import { describe, expect, it } from "vitest";
import { formatClockDuration, getWorkTypeLabel } from "./clock";

describe("formatClockDuration", () => {
  it("formats hours, minutes, and seconds clearly", () => {
    expect(formatClockDuration(0)).toBe("00:00:00");
    expect(formatClockDuration(65)).toBe("00:01:05");
    expect(formatClockDuration(3661)).toBe("01:01:01");
  });
});

describe("getWorkTypeLabel", () => {
  it("maps work-type values to readable labels", () => {
    expect(getWorkTypeLabel("job_site")).toBe("Job Site");
    expect(getWorkTypeLabel("shop")).toBe("Shop");
    expect(getWorkTypeLabel("office")).toBe("Office");
    expect(getWorkTypeLabel("travel")).toBe("Travel");
    expect(getWorkTypeLabel("meeting")).toBe("Meeting");
    expect(getWorkTypeLabel("training")).toBe("Training");
    expect(getWorkTypeLabel("other")).toBe("Other");
  });
});
