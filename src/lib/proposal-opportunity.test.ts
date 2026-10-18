import { describe, expect, it } from "vitest";
import { isOpenNonTerminalOpportunity, resolveOpportunityForProposal } from "./proposal-opportunity";

const base = { id: 1, status: "open", stage: "follow_up" };

describe("resolveOpportunityForProposal", () => {
  it("auto-selects exactly one open, non-terminal opportunity", () => {
    const result = resolveOpportunityForProposal([base]);
    expect(result).toEqual({ kind: "single", opportunity: base });
  });

  it("requires explicit selection when multiple valid opportunities exist", () => {
    const result = resolveOpportunityForProposal([base, { ...base, id: 2 }]);
    expect(result.kind).toBe("multiple");
    if (result.kind === "multiple") expect(result.opportunities).toHaveLength(2);
  });

  it("returns none when nothing valid exists", () => {
    expect(resolveOpportunityForProposal([]).kind).toBe("none");
  });

  it("excludes lost and not_qualified opportunities", () => {
    expect(isOpenNonTerminalOpportunity({ status: "open", stage: "lost" })).toBe(false);
    expect(isOpenNonTerminalOpportunity({ status: "open", stage: "not_qualified" })).toBe(false);
    expect(isOpenNonTerminalOpportunity({ status: "won", stage: "review" })).toBe(false);
    const result = resolveOpportunityForProposal([
      { id: 1, status: "open", stage: "lost" },
      { id: 2, status: "open", stage: "not_qualified" },
    ]);
    expect(result.kind).toBe("none");
  });
});
