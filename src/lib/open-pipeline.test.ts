import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOpenPipelineProposal, openPipelineMetrics, selectOpenProposals } from "./open-pipeline";

function proposal(overrides: Record<string, unknown>) {
  return {
    id: 1,
    status: "sent",
    deletedAt: null,
    opportunityId: null,
    totalAmount: 1000,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    opportunity: null,
    ...overrides,
  };
}

describe("isOpenPipelineProposal", () => {
  it("accepts one valid open proposal", () => {
    expect(isOpenPipelineProposal(proposal({}))).toBe(true);
  });

  it("excludes converted proposals", () => {
    expect(isOpenPipelineProposal(proposal({ status: "converted" }))).toBe(false);
  });

  it("excludes declined proposals", () => {
    expect(isOpenPipelineProposal(proposal({ status: "declined" }))).toBe(false);
  });

  it("excludes archived/deleted proposals", () => {
    expect(isOpenPipelineProposal(proposal({ deletedAt: new Date() }))).toBe(false);
  });

  it("excludes proposals whose opportunity already has a job", () => {
    expect(isOpenPipelineProposal(proposal({ opportunityId: 7, opportunity: { job: { id: 42 } } }))).toBe(false);
  });
});

describe("selectOpenProposals", () => {
  it("counts multiple revisions of one opportunity once, keeping the latest", () => {
    const revisions = selectOpenProposals([
      proposal({ id: 1, opportunityId: 7, totalAmount: 5000, createdAt: new Date("2026-10-01T00:00:00Z") }),
      proposal({ id: 2, opportunityId: 7, totalAmount: 6500, createdAt: new Date("2026-10-09T00:00:00Z") }),
    ]);
    expect(revisions.map((p) => p.id)).toEqual([2]);
  });

  it("keeps legitimate unlinked proposals, each once", () => {
    const result = selectOpenProposals([proposal({ id: 1 }), proposal({ id: 2 })]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty set when nothing qualifies", () => {
    expect(selectOpenProposals([proposal({ status: "converted" }), proposal({ deletedAt: new Date() })])).toEqual([]);
  });
});

describe("openPipelineMetrics", () => {
  it("likely revenue sums the canonical totals of exactly the qualifying set", () => {
    const metrics = openPipelineMetrics([
      proposal({ id: 1, totalAmount: 1000 }),
      proposal({ id: 2, totalAmount: 2500, status: "converted" }),
      proposal({ id: 3, opportunityId: 7, totalAmount: 4000, createdAt: new Date("2026-10-01T00:00:00Z") }),
      proposal({ id: 4, opportunityId: 7, totalAmount: 4500, createdAt: new Date("2026-10-05T00:00:00Z") }),
      proposal({ id: 5, totalAmount: 900, deletedAt: new Date() }),
    ]);
    expect(metrics.openProposals).toBe(2);
    expect(metrics.likelyRevenue).toBe(5500); // 1000 + latest revision 4500
  });

  it("zero qualifying proposals returns 0 and $0", () => {
    expect(openPipelineMetrics([])).toEqual({ openProposals: 0, likelyRevenue: 0 });
  });

  it("is the single shared definition consumed by every screen via business.analytics", () => {
    const source = readFileSync(new URL("../server/api/routers/business.ts", import.meta.url), "utf8");
    expect(source).toContain("selectOpenProposals");
  });
});
