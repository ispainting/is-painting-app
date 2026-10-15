import { describe, expect, it } from "vitest";
import { getLifecycleDate, getMonthKey, parseLifecycleDateInput, toDateInputValue } from "./job-lifecycle";

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

describe("edit job lifecycle date inputs", () => {
  it("populates date inputs from existing job values", () => {
    const job = {
      leadReceivedAt: new Date("2026-08-15T04:00:00.000Z"),
      proposalSentAt: new Date("2026-08-20T04:00:00.000Z"),
      workStartedAt: null,
    };
    expect(toDateInputValue(getLifecycleDate(job, "leadReceivedAt"))).toBe("2026-08-15");
    expect(toDateInputValue(getLifecycleDate(job, "proposalSentAt"))).toBe("2026-08-20");
    expect(toDateInputValue(getLifecycleDate(job, "workStartedAt"))).toBe("");
  });

  it("parses a changed date to midnight in the business timezone", () => {
    const parsed = parseLifecycleDateInput("2026-08-16");
    expect(parsed).not.toBeNull();
    expect(parsed!.getTime()).toBe(new Date("2026-08-16T04:00:00.000Z").getTime());
  });

  it("saving a cleared field produces null", () => {
    expect(parseLifecycleDateInput("")).toBeNull();
  });

  it("round-trips without a one-day shift in summer or winter", () => {
    for (const day of ["2026-08-15", "2026-01-15"]) {
      const parsed = parseLifecycleDateInput(day)!;
      expect(toDateInputValue(parsed)).toBe(day);
    }
  });
});
