import { describe, expect, it } from "vitest";
import { buildLeadOutcomes, type OpportunityRow, type ProposalRow } from "./orion-lead-outcomes";

const opp = (over: Partial<OpportunityRow> = {}): OpportunityRow => ({
  id: 1,
  customerId: 10,
  stage: "new_lead",
  status: "open",
  source: "Meta",
  createdAt: new Date("2026-10-10T12:00:00Z"),
  lastStageChangedAt: null,
  city: "Falmouth",
  job: null,
  ...over,
});

const proposal = (over: Partial<ProposalRow> = {}): ProposalRow => ({
  customerId: 10,
  status: "sent",
  totalAmount: "4800.00",
  sentAt: new Date("2026-10-12T12:00:00Z"),
  approvedAt: null,
  createdAt: new Date("2026-10-11T12:00:00Z"),
  ...over,
});

describe("buildLeadOutcomes", () => {
  it("joins a lead to its stage, the customer's later proposals and its job", () => {
    const [row] = buildLeadOutcomes(
      [{ legacyId: "meta:123", newId: 1 }],
      [opp({ stage: "service_delivery", job: { status: "active", contractAmount: "5200.00", totalEstimate: "4800.00" } })],
      [proposal(), proposal({ status: "approved", approvedAt: new Date("2026-10-15T12:00:00Z"), totalAmount: "5200" })]
    );
    expect(row.leadKey).toBe("meta:123");
    expect(row.stage).toBe("service_delivery");
    expect(row.proposals).toMatchObject({ count: 2, sent: 2, approved: 1, sentAmount: 10000, approvedAmount: 5200 });
    expect(row.proposals.firstApprovedAt).toBe("2026-10-15T12:00:00.000Z");
    expect(row.job).toEqual({ status: "active", value: 5200 });
  });

  it("leaves out proposals made for the same customer well before the lead", () => {
    const [row] = buildLeadOutcomes([{ legacyId: "tally:1", newId: 1 }], [opp()], [proposal({ createdAt: new Date("2026-03-01T00:00:00Z") })]);
    expect(row.proposals.count).toBe(0);
  });

  it("uses the estimate when a job has no contract amount yet, and drafts are not 'sent'", () => {
    const [row] = buildLeadOutcomes(
      [{ legacyId: "google:9", newId: 1 }],
      [opp({ job: { status: "estimate", contractAmount: "0", totalEstimate: "3100" } })],
      [proposal({ status: "draft", sentAt: null })]
    );
    expect(row.job).toEqual({ status: "estimate", value: 3100 });
    expect(row.proposals).toMatchObject({ count: 1, sent: 0, sentAmount: 0 });
  });

  it("skips map entries whose opportunity is gone and returns newest first", () => {
    const rows = buildLeadOutcomes(
      [
        { legacyId: "a", newId: 1 },
        { legacyId: "b", newId: 2 },
        { legacyId: "c", newId: 99 },
      ],
      [opp({ id: 1 }), opp({ id: 2, createdAt: new Date("2026-10-20T00:00:00Z") })],
      []
    );
    expect(rows.map((r) => r.leadKey)).toEqual(["b", "a"]);
  });
});
