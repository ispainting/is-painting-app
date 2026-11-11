import { describe, expect, it } from "vitest";
import { attributionFromMetadata, compactAttribution, mergeAttribution } from "./orion-attribution";

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
});
