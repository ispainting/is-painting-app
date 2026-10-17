import { describe, expect, it } from "vitest";
import {
  isReferralSource,
  LEAD_SOURCE_OPTIONS,
  leadSourceOptionsWithLegacy,
  resolveReferralName,
} from "./lead-source";
import { PIPELINE_STAGE_OPTIONS, TERMINAL_PIPELINE_STAGES } from "./pipeline-stages";
import { startOfBusinessDayInMassachusetts, todayDateInputValueInMassachusetts } from "./employee-rate-resolver";

describe("lead source options", () => {
  it("includes the canonical sources used by analytics", () => {
    for (const source of ["Google", "Website", "Referral", "Builder", "Repeat Customer", "Other"]) {
      expect(LEAD_SOURCE_OPTIONS).toContain(source);
    }
  });

  it("preserves a historical free-text value as a legacy option", () => {
    const options = leadSourceOptionsWithLegacy("Home Show 2024");
    expect(options[0]).toBe("Home Show 2024");
    expect(options).toContain("Referral");
  });

  it("does not duplicate canonical values", () => {
    expect(leadSourceOptionsWithLegacy("Google")).toEqual([...LEAD_SOURCE_OPTIONS]);
    expect(leadSourceOptionsWithLegacy("")).toEqual([...LEAD_SOURCE_OPTIONS]);
    expect(leadSourceOptionsWithLegacy(null)).toEqual([...LEAD_SOURCE_OPTIONS]);
  });

  it("keeps Referral Name only when Lead Source is Referral", () => {
    expect(isReferralSource("Referral")).toBe(true);
    expect(resolveReferralName("Referral", " Jane D ")).toBe("Jane D");
    expect(resolveReferralName("Google", "Jane D")).toBeUndefined();
    expect(resolveReferralName("Referral", "  ")).toBeUndefined();
  });
});

describe("pipeline stage options", () => {
  it("covers every required stage with readable labels", () => {
    const values = PIPELINE_STAGE_OPTIONS.map((option) => option.value);
    expect(values).toEqual([
      "new_lead",
      "onboarding",
      "not_answered",
      "follow_up",
      "estimate_sent",
      "approval",
      "service_delivery",
      "review",
      "not_qualified",
      "lost",
    ]);
    const labels = PIPELINE_STAGE_OPTIONS.map((option) => option.label);
    expect(labels).toContain("New Lead");
    expect(labels).toContain("Unqualified");
    expect(labels).toContain("Lost");
  });

  it("treats lost and not_qualified as terminal", () => {
    expect(TERMINAL_PIPELINE_STAGES).toEqual(["lost", "not_qualified"]);
  });
});

describe("Massachusetts lead date helpers", () => {
  it("defaults to today's date in America/New_York", () => {
    expect(todayDateInputValueInMassachusetts(new Date("2026-10-17T02:00:00.000Z"))).toBe("2026-10-16"); // still Oct 16 in MA (EDT)
    expect(todayDateInputValueInMassachusetts(new Date("2026-10-17T05:00:00.000Z"))).toBe("2026-10-17");
  });

  it("anchors the selected lead date to the correct MA calendar date", () => {
    expect(startOfBusinessDayInMassachusetts("2026-10-17").toISOString()).toBe("2026-10-17T04:00:00.000Z");
  });
});
