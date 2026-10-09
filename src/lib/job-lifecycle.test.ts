import { describe, expect, it } from "vitest";
import { getLifecycleDate, getMonthKey, toDateInputValue } from "./job-lifecycle";

describe("job lifecycle dates", () => {
  it("returns null for a legacy job with no business dates", () => {
    expect(getLifecycleDate({ leadReceivedAt: null }, "leadReceivedAt")).toBeNull();
    expect(getLifecycleDate({}, "proposalSentAt")).toBeNull();
  });

  it("uses the business date instead of createdAt when present", () => {
    const date = getLifecycleDate({ leadReceivedAt: "2026-08-15T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" }, "leadReceivedAt");
    expect(date?.getUTCMonth()).toBe(7);
  });

  it("moving a lifecycle date changes the month key", () => {
    const original = getMonthKey(getLifecycleDate({ leadReceivedAt: "2026-08-15T00:00:00Z" }, "leadReceivedAt"));
    const updated = getMonthKey(getLifecycleDate({ leadReceivedAt: "2026-07-10T00:00:00Z" }, "leadReceivedAt"));
    expect(original).toBe("2026-08");
    expect(updated).toBe("2026-07");
  });

  it("excludes null dates from monthly grouping", () => {
    expect(getMonthKey(null)).toBeNull();
  });

  it("America/New_York midnight boundary does not shift the calendar day", () => {
    const utcMidnight = new Date("2026-08-15T04:00:00.000Z");
    expect(toDateInputValue(utcMidnight)).toBe("2026-08-15");
    const previousUtcDay = new Date("2026-08-14T23:00:00.000Z");
    expect(toDateInputValue(previousUtcDay)).toBe("2026-08-14");
  });
});
