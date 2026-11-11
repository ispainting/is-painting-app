import { describe, expect, it } from "vitest";
import type { LeadOutcome } from "./orion-lead-outcomes";
import { summarizeMarketingFunnel } from "./orion-marketing-funnel";

const lead = (over: Partial<LeadOutcome> = {}): LeadOutcome => ({
  leadKey: "meta:1",
  opportunityId: 1,
  receivedAt: "2026-10-10T12:00:00.000Z",
  stage: "completed",
  status: "won",
  lastStageChangedAt: "2026-10-20T12:00:00.000Z",
  source: "Meta Ads",
  city: "Falmouth",
  serviceType: "Interior Painting",
  attribution: { platform: "Meta", campaignId: "cmp-1", campaignName: "Cape Cod Interior", adId: "ad-1", adName: "Before and after" },
  classification: { valid: true, qualified: true, quoted: true, won: true },
  outcome: { at: "2026-10-20T12:00:00.000Z", reason: null, archived: false },
  stageHistory: [],
  proposals: { count: 1, sent: 1, approved: 1, sentAmount: 5000, approvedAmount: 5000, firstSentAt: null, firstApprovedAt: null },
  job: { status: "completed", value: 5200 },
  ...over,
});

describe("summarizeMarketingFunnel", () => {
  it("summarizes comparable funnel metrics by platform, campaign and ad", () => {
    const result = summarizeMarketingFunnel([
      lead(),
      lead({ leadKey: "meta:2", opportunityId: 2, classification: { valid: true, qualified: false, quoted: false, won: false }, proposals: { count: 0, sent: 0, approved: 0, sentAmount: 0, approvedAmount: 0, firstSentAt: null, firstApprovedAt: null }, job: null }),
    ]);
    expect(result.total).toMatchObject({ leads: 2, validLeads: 2, qualifiedLeads: 1, quotedLeads: 1, wonLeads: 1, wonValue: 5200, closeRate: 1 });
    expect(result.byCampaign[0]).toMatchObject({ key: "Meta:cmp-1", leads: 2, qualifiedLeads: 1 });
    expect(result.byAd[0]).toMatchObject({ key: "Meta:ad-1", wonLeads: 1 });
  });

  it("does not invent campaign groups when attribution is unavailable", () => {
    const result = summarizeMarketingFunnel([lead({ attribution: null, source: "Referral" })]);
    expect(result.byCampaign).toEqual([]);
    expect(result.byAd).toEqual([]);
    expect(result.byPlatform[0].name).toBe("Referral");
  });
});
