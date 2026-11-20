import { describe, expect, it } from "vitest";
import { funnelMove, leadRates, periodStart, startOfBusinessDay, startOfBusinessWeek } from "./status";

describe("funnelMove", () => {
  it("moves an early card with the quick statuses", () => {
    expect(funnelMove("REAL", "new_lead")).toEqual({ pipeline: "sales", stage: "follow_up", status: "open" });
    expect(funnelMove("NO_ANSWER", "new_lead")).toEqual({ pipeline: "sales", stage: "not_answered", status: "open" });
  });

  it("never pulls back a card where work has started", () => {
    for (const stage of ["estimate_sent", "approval", "service_delivery", "review"] as const) {
      expect(funnelMove("REAL", stage)).toBeNull();
      expect(funnelMove("NO_ANSWER", stage)).toBeNull();
      expect(funnelMove("CONTACTED", stage)).toBeNull();
    }
  });

  it("closes the card as lost, from anywhere", () => {
    expect(funnelMove("NOT_REAL", "estimate_sent")).toEqual({ pipeline: "not_interested", stage: "not_qualified", status: "lost" });
    expect(funnelMove("LOST", "approval")).toEqual({ pipeline: "not_interested", stage: "lost", status: "lost" });
  });

  it("reopens a card marked lost by mistake", () => {
    expect(funnelMove("REAL", "not_qualified")).toEqual({ pipeline: "sales", stage: "follow_up", status: "open" });
  });

  it("marks a win without undoing later stages", () => {
    expect(funnelMove("WON", "new_lead")).toEqual({ pipeline: "sales", stage: "service_delivery", status: "won" });
    expect(funnelMove("WON", "review")).toEqual({ pipeline: "sales", stage: "review", status: "won" });
  });

  it("brings the card back when a win is corrected", () => {
    expect(funnelMove("REAL", "service_delivery", "WON")).toEqual({ pipeline: "sales", stage: "follow_up", status: "open" });
    expect(funnelMove("REAL", "service_delivery", "NO_ANSWER")).toBeNull();
  });

  it("leaves the card alone for a new lead", () => {
    expect(funnelMove("NEW", "follow_up")).toBeNull();
  });
});

describe("leadRates", () => {
  it("counts only leads someone already judged", () => {
    expect(leadRates({ NEW: 50, CONTACTED: 5, REAL: 2, WON: 1, LOST: 1, NOT_REAL: 4, NO_ANSWER: 2 })).toEqual({ judged: 10, realPct: 40, noAnswerPct: 20 });
  });

  it("says nothing rather than 0% with nothing judged", () => {
    expect(leadRates({ NEW: 3 })).toEqual({ judged: 0, realPct: null, noAnswerPct: null });
  });
});

describe("business calendar", () => {
  it("starts the day at midnight in Massachusetts", () => {
    // 01:00 UTC on Nov 3 is still the evening of Nov 2 there, an hour after standard time began.
    expect(startOfBusinessDay(new Date("2026-11-03T01:00:00Z")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(startOfBusinessDay(new Date("2026-07-15T18:00:00Z")).toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("gets the days the clocks change right", () => {
    // Nov 1 2026, clocks went back at 2am: that midnight was still on summer time.
    expect(startOfBusinessDay(new Date("2026-11-01T20:00:00Z")).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    // Mar 14 2027, clocks go forward at 2am: that midnight is still on winter time.
    expect(startOfBusinessDay(new Date("2027-03-14T20:00:00Z")).toISOString()).toBe("2027-03-14T05:00:00.000Z");
  });

  it("starts the week on Monday", () => {
    // Sunday Nov 1 2026 belongs to the week of Monday Oct 26.
    expect(startOfBusinessWeek(new Date("2026-11-01T20:00:00Z")).toISOString()).toBe("2026-10-26T04:00:00.000Z");
    // Monday itself, and across a month boundary.
    expect(startOfBusinessWeek(new Date("2026-11-02T20:00:00Z")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(startOfBusinessWeek(new Date("2026-12-02T20:00:00Z")).toISOString()).toBe("2026-11-30T05:00:00.000Z");
  });

  it("reads the periods on the screen", () => {
    const now = new Date("2026-11-02T20:00:00Z");
    expect(periodStart("all", now)).toBeNull();
    expect(periodStart("today", now)?.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(periodStart("7d", now)?.toISOString()).toBe("2026-10-26T20:00:00.000Z");
    expect(periodStart("90d", now)?.toISOString()).toBe("2026-08-04T20:00:00.000Z");
  });
});
