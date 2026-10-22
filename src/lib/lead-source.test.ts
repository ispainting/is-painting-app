import { describe, expect, it } from "vitest";
import {
  isReferralSource,
  LEAD_SOURCE_OPTIONS,
  leadSourceOptionsWithLegacy,
  normalizeLeadSourceForReport,
  resolveReferralName,
  SERVICE_TYPE_OPTIONS,
  serviceTypeOptionsWithLegacy,
} from "./lead-source";
import { PIPELINE_STAGE_OPTIONS, TERMINAL_PIPELINE_STAGES } from "./pipeline-stages";
import { startOfBusinessDayInMassachusetts, todayDateInputValueInMassachusetts } from "./employee-rate-resolver";

describe("lead source options", () => {
  it("is exactly the canonical list", () => {
    expect([...LEAD_SOURCE_OPTIONS]).toEqual([
      "LSA",
      "Google Ads",
      "Google Search",
      "Meta Ads",
      "Angi Leads",
      "Website",
      "ChatGPT",
      "Builder",
      "Referral",
      "Repeated Customer",
      "Other",
      "Unknown",
    ]);
  });

  it("preserves a historical free-text value as a legacy option", () => {
    const options = leadSourceOptionsWithLegacy("Home Show 2024");
    expect(options[0]).toBe("Home Show 2024");
    expect(options).toContain("Referral");
  });

  it("does not duplicate canonical values", () => {
    expect(leadSourceOptionsWithLegacy("Google Ads")).toEqual([...LEAD_SOURCE_OPTIONS]);
    expect(leadSourceOptionsWithLegacy("")).toEqual([...LEAD_SOURCE_OPTIONS]);
    expect(leadSourceOptionsWithLegacy(null)).toEqual([...LEAD_SOURCE_OPTIONS]);
  });

  it("offers the complete canonical source list and preserves Google Ads/Search separately", () => {
    expect([...LEAD_SOURCE_OPTIONS]).toEqual([
      "LSA", "Google Ads", "Google Search", "Meta Ads", "Angi Leads", "Website",
      "ChatGPT", "Builder", "Referral", "Repeated Customer", "Other", "Unknown",
    ]);
    expect(normalizeLeadSourceForReport("Google Ads")).toBe("Google Ads");
    expect(normalizeLeadSourceForReport("Google Search")).toBe("Google Search");
  });

  it("offers all supported service types and retains a historical value", () => {
    expect([...SERVICE_TYPE_OPTIONS]).toEqual(["Interior", "Exterior", "Both", "Commercial", "Other"]);
    expect(serviceTypeOptionsWithLegacy("Cabinet Refinishing")).toEqual([
      "Cabinet Refinishing", ...SERVICE_TYPE_OPTIONS,
    ]);
  });

  it("keeps Referral Name only when Lead Source is Referral", () => {
    expect(isReferralSource("Referral")).toBe(true);
    expect(resolveReferralName("Referral", " Jane D ")).toBe("Jane D");
    expect(resolveReferralName("Google Ads", "Jane D")).toBeUndefined();
    expect(resolveReferralName("Referral", "  ")).toBeUndefined();
  });
});

describe("legacy source normalization", () => {
  it("maps historical aliases onto canonical labels", () => {
    expect(normalizeLeadSourceForReport("Google Local Services")).toBe("LSA");
    expect(normalizeLeadSourceForReport("Local Services Ads")).toBe("LSA");
    expect(normalizeLeadSourceForReport("LSA")).toBe("LSA");
    expect(normalizeLeadSourceForReport("Google")).toBe("Google Ads");
    expect(normalizeLeadSourceForReport("PPC")).toBe("Google Ads");
    expect(normalizeLeadSourceForReport("Facebook")).toBe("Meta Ads");
    expect(normalizeLeadSourceForReport("Instagram")).toBe("Meta Ads");
    expect(normalizeLeadSourceForReport("Meta")).toBe("Meta Ads");
    expect(normalizeLeadSourceForReport("ChatGPT")).toBe("ChatGPT");
    expect(normalizeLeadSourceForReport("OpenAI")).toBe("ChatGPT");
    expect(normalizeLeadSourceForReport("Google Business")).toBe("Google Search");
    expect(normalizeLeadSourceForReport("Angi")).toBe("Angi Leads");
    expect(normalizeLeadSourceForReport("Repeat Customer")).toBe("Repeated Customer");
    expect(normalizeLeadSourceForReport("Existing Customer")).toBe("Repeated Customer");
    expect(normalizeLeadSourceForReport("word of mouth referral")).toBe("Referral");
  });

  it("keeps unknown legacy values visible and never rewrites them", () => {
    expect(normalizeLeadSourceForReport("Home Show 2024")).toBe("Home Show 2024");
    expect(normalizeLeadSourceForReport("")).toBe("Unknown");
    expect(normalizeLeadSourceForReport(null)).toBe("Unknown");
  });
});

describe("pipeline stage options", () => {
  it("covers every required stage with readable labels", () => {
    const values = PIPELINE_STAGE_OPTIONS.map((option) => option.value);
    for (const stage of [
      "new_lead", "onboarding", "not_answered", "follow_up",
      "estimate_sent", "approval", "on_hold", "service_delivery", "review", "completed",
      "not_qualified", "lost", "invalid_duplicate", "spam_fraud",
    ]) {
      expect(values).toContain(stage);
    }
    const labels = PIPELINE_STAGE_OPTIONS.map((option) => option.label);
    expect(labels).toContain("New Lead");
    expect(labels).toContain("Not Qualified");
    expect(labels).toContain("Lost / Cancelled");
    expect(labels).toContain("Invalid / Duplicate");
    expect(labels).toContain("Spam / Fraud");
  });

  it("treats lost, not_qualified, invalid_duplicate, spam_fraud, and completed as terminal", () => {
    expect(TERMINAL_PIPELINE_STAGES).toEqual(["lost", "not_qualified", "invalid_duplicate", "spam_fraud", "completed"]);
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
