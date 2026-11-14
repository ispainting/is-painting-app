import { describe, expect, it } from "vitest";
import { attributionFromLeadNote, attributionFromMetadata, compactAttribution, mergeAttribution } from "./orion-attribution";

describe("ORION attribution", () => {
  it("removes empty values", () => {
    expect(compactAttribution({ campaignId: " 123 ", adName: " " })).toEqual({ campaignId: "123" });
  });

  it("fills missing attribution without overwriting historical values", () => {
    expect(mergeAttribution(
      { campaignId: "old", campaignName: "Cape Cod" },
      { campaignId: "retry", adId: "ad-9" },
    )).toEqual({ campaignId: "old", campaignName: "Cape Cod", adId: "ad-9" });
  });

  it("does not expose unrelated metadata", () => {
    expect(attributionFromMetadata({ campaignId: "1", email: "private@example.com", adName: "Exterior" }))
      .toEqual({ campaignId: "1", adName: "Exterior" });
  });

  it("extracts historical tracking lines without treating contact details as attribution", () => {
    expect(attributionFromLeadNote([
      "Name: TESTE Claude",
      "Email: teste.rastreamento@example.com",
      "Traffic source: Google Ads",
      "Utm source: google",
      "Utm medium: cpc",
      "Utm campaign: teste_rastreamento",
      "Utm content: claude",
      "Gclid: TESTE_gclid_1110",
      "Fbclid: TESTE_fbclid_1110",
      "Landing page: https://ispaintingcorp.com/painting-quote/",
      "Ideal timing: In 1–3 months",
    ].join("\n"))).toEqual({
      trafficSource: "Google Ads",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "teste_rastreamento",
      utmContent: "claude",
      gclid: "TESTE_gclid_1110",
      fbclid: "TESTE_fbclid_1110",
      landingPage: "https://ispaintingcorp.com/painting-quote/",
      idealTiming: "In 1–3 months",
    });
  });

  it("preserves click ids and landing-page data in structured metadata", () => {
    expect(attributionFromMetadata({
      platform: "Google", gclid: "click-1", landingPage: "https://example.com/quote", externalLeadId: "lead-7",
    })).toEqual({ platform: "Google", gclid: "click-1", landingPage: "https://example.com/quote", externalLeadId: "lead-7" });
  });
});
