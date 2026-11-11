import { describe, expect, it } from "vitest";
import { opportunityValues, shouldRecordOpportunityStageHistory } from "./opportunity-values";

const proposals = [
  { id: 1, status: "sent", totalAmount: 1800, createdAt: "2026-10-01T00:00:00.000Z" },
];

describe("Opportunity stage value labels", () => {
  it("uses expected value for open pipeline, contract for production, won only when completed, and lost only when lost", () => {
    const active = opportunityValues({ stage: "estimate_sent", status: "open", leadValue: 1200, proposals });
    expect(active.expected).toBe(1800);
    expect(active.contract).toBe(0);
    expect(active.won).toBe(0);
    expect(active.lost).toBe(0);

    const production = opportunityValues({ stage: "service_delivery", status: "open", leadValue: 1200, proposals, job: { contractAmount: 2500, totalEstimate: 2200 } });
    expect(production.expected).toBe(1800);
    expect(production.contract).toBe(2500);
    expect(production.won).toBe(0);

    const completed = opportunityValues({ stage: "completed", status: "won", leadValue: 1200, proposals, job: { contractAmount: 2500, totalEstimate: 2200 } });
    expect(completed.expected).toBe(0);
    expect(completed.won).toBe(2500);
    expect(completed.contract).toBe(2500);

    const lost = opportunityValues({ stage: "lost", status: "lost", leadValue: 1200, proposals });
    expect(lost.expected).toBe(0);
    expect(lost.lost).toBe(1800);
  });

  it("preserves the latest quote as value at outcome even when that Proposal was declined", () => {
    const lost = opportunityValues({
      stage: "lost",
      status: "lost",
      leadValue: 1000,
      proposals: [{ id: 2, status: "declined", totalAmount: 2100, createdAt: "2026-10-02T00:00:00.000Z" }],
    });
    expect(lost.expected).toBe(0);
    expect(lost.lost).toBe(2100);
  });
});

describe("stage history event detection", () => {
  it("does not record history for unrelated edits or an unchanged effective date", () => {
    expect(shouldRecordOpportunityStageHistory({
      previousStage: "follow_up",
      nextStage: "follow_up",
      previousReason: "",
      nextReason: "",
      historyNote: "",
    })).toBe(false);
  });

  it("records history for a stage change, outcome reason change, or explicit history note", () => {
    expect(shouldRecordOpportunityStageHistory({
      previousStage: "follow_up", nextStage: "lost", previousReason: "", nextReason: "", historyNote: "",
    })).toBe(true);
    expect(shouldRecordOpportunityStageHistory({
      previousStage: "lost", nextStage: "lost", previousReason: "Price", nextReason: "Scheduling", historyNote: "",
    })).toBe(true);
    expect(shouldRecordOpportunityStageHistory({
      previousStage: "lost", nextStage: "lost", previousReason: "Price", nextReason: "Price", historyNote: "Corrected date",
    })).toBe(true);
  });
});
