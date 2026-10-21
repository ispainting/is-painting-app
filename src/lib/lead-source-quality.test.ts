import { describe, expect, it } from "vitest";
import { buildLeadSourceQualityReport, resolveOpportunityLeadSource } from "./lead-source-quality";
import { businessRangeInMassachusetts, startOfBusinessDayInMassachusetts } from "./employee-rate-resolver";
import { formatOpportunityDate, opportunityDateInput } from "./opportunity-values";

const OCT_2026 = businessRangeInMassachusetts(new Date("2026-10-01T12:00:00Z"), new Date("2026-10-31T12:00:00Z"));
const JUL_2026 = businessRangeInMassachusetts(new Date("2026-07-01T12:00:00Z"), new Date("2026-07-31T12:00:00Z"));

function opp(overrides: Record<string, unknown>) {
  return {
    id: 1,
    source: null,
    stage: "new_lead",
    status: "open",
    leadReceivedAt: null,
    createdAt: new Date("2026-10-10T12:00:00Z"),
    customer: null,
    proposals: [],
    job: null,
    ...overrides,
  } as never;
}

function report(opportunities: never[], payments: never[] = [], range = OCT_2026) {
  return buildLeadSourceQualityReport({
    opportunities,
    payments,
    cohortStart: range.start,
    cohortEnd: range.end,
    cashStart: range.start,
    cashEnd: range.end,
  });
}

describe("lead source resolution order", () => {
  it("prefers Opportunity.source, then Customer.leadSource, then Customer.source, then Unknown", () => {
    expect(resolveOpportunityLeadSource(opp({ source: "Google", customer: { leadSource: "Website", source: "Legacy" } }) as never)).toBe("Google Ads");
    expect(resolveOpportunityLeadSource(opp({ customer: { leadSource: "referral", source: "Legacy" } }) as never)).toBe("Referral");
    expect(resolveOpportunityLeadSource(opp({ customer: { source: "Home Show 2024" } }) as never)).toBe("Home Show 2024"); // legacy value stays visible
    expect(resolveOpportunityLeadSource(opp({}) as never)).toBe("Unknown");
  });
});

describe("cohort timeframe", () => {
  it("uses leadReceivedAt over createdAt", () => {
    const inCohort = report([opp({ leadReceivedAt: new Date("2026-10-05T04:00:00Z"), createdAt: new Date("2026-01-01T00:00:00Z") }) as never]);
    expect(inCohort.totals.totalLeads).toBe(1);
  });

  it("reports an old lead in its received month, not its entry month", () => {
    const oldLead = opp({
      leadReceivedAt: new Date("2026-07-10T04:00:00.000Z"),
      createdAt: new Date("2026-10-21T14:30:00.000Z"),
      recordedAt: new Date("2026-10-21T14:30:00.000Z"),
      stageHistory: [{
        newStage: "estimate_sent",
        effectiveAt: new Date("2026-07-18T04:00:00.000Z"),
        recordedAt: new Date("2026-10-21T14:45:00.000Z"),
      }],
    }) as never;
    const july = report([oldLead], [], JUL_2026);
    const october = report([oldLead], [], OCT_2026);

    expect(july.totals.totalLeads).toBe(1);
    expect(july.totals.avgDaysToProposal).toBe(8);
    expect(october.totals.totalLeads).toBe(0);
  });

  it("falls back to createdAt when leadReceivedAt is null", () => {
    const inCohort = report([opp({ createdAt: new Date("2026-10-05T04:00:00Z") }) as never]);
    expect(inCohort.totals.totalLeads).toBe(1);
  });

  it("keeps late-night October 31 records in October (MA boundary)", () => {
    // 2026-10-31T23:30 EDT = 2026-11-01T03:30:00Z — UTC month says November, MA says October.
    const result = report([opp({ leadReceivedAt: new Date("2026-11-01T03:30:00Z") }) as never]);
    expect(result.totals.totalLeads).toBe(1);
  });

  it("round-trips a Massachusetts business date without shifting its calendar day", () => {
    const receivedAt = startOfBusinessDayInMassachusetts("2026-07-10");
    expect(receivedAt.toISOString()).toBe("2026-07-10T04:00:00.000Z");
    expect(opportunityDateInput(receivedAt)).toBe("2026-07-10");
    expect(formatOpportunityDate(receivedAt)).toBe("Jul 10, 2026");
  });

  it("excludes records after the MA month ends", () => {
    const result = report([opp({ leadReceivedAt: new Date("2026-11-01T05:30:00Z") }) as never]); // Nov 1 01:30 EDT
    expect(result.totals.totalLeads).toBe(0);
  });
});

describe("quality classification", () => {
  it("separates invalid/spam, keeps lost qualified, keeps Unknown visible", () => {
    const { rows, totals } = report([
      opp({ id: 1, stage: "invalid_duplicate", source: "Google" }) as never,
      opp({ id: 2, stage: "spam_fraud", source: "Google" }) as never,
      opp({ id: 3, stage: "lost", source: "Google" }) as never,
      opp({ id: 4, stage: "not_qualified", source: "Google" }) as never,
      opp({ id: 5, stage: "follow_up", source: "Google" }) as never,
      opp({ id: 6, stage: "new_lead" }) as never,
    ]);

    const google = rows.find((row) => row.source === "Google Ads")!;
    expect(google.totalLeads).toBe(5);
    expect(google.invalidDuplicate).toBe(1);
    expect(google.spamFraud).toBe(1);
    expect(google.validLeads).toBe(3);
    expect(google.notQualified).toBe(1);
    expect(google.qualifiedLeads).toBe(2); // lost + follow_up
    expect(google.lostCancelled).toBe(1);
    expect(totals.qualifiedLeads).toBe(3); // Google lost + follow_up + Unknown new_lead
    expect(rows.some((row) => row.source === "Unknown")).toBe(true);
  });
});

describe("double-count protection and value rules", () => {
  it("counts one opportunity as one lead and uses only the latest proposal value", () => {
    const { totals } = report([
      opp({
        id: 1,
        source: "Website",
        stage: "approval",
        proposals: [
          { id: 1, status: "sent", totalAmount: 5000, createdAt: new Date("2026-10-02T00:00:00Z"), sentAt: new Date("2026-10-02T01:00:00Z") },
          { id: 2, status: "converted", totalAmount: 6500, createdAt: new Date("2026-10-09T00:00:00Z"), sentAt: new Date("2026-10-09T01:00:00Z") },
        ],
      }) as never,
    ]);
    expect(totals.totalLeads).toBe(1);
    expect(totals.quotedValue).toBe(6500); // latest revision only
    expect(totals.proposalsSent).toBe(1);
    expect(totals.won).toBe(1); // converted proposal
  });

  it("uses the canonical job total for won value and averages over jobs only", () => {
    const { totals } = report([
      opp({ id: 1, source: "Referral", stage: "service_delivery", job: { id: 50, contractAmount: 8000, totalEstimate: 7000 } }) as never,
      opp({ id: 2, source: "Referral", stage: "review", job: { id: 51, contractAmount: 0, totalEstimate: 4000 } }) as never,
    ]);
    expect(totals.wonJobValue).toBe(12000); // contract-first canonical total
    expect(totals.avgWonJobValue).toBe(6000);
    expect(totals.won).toBe(2);
  });

  it("groups cash by payment dateReceived and source, counted once per payment", () => {
    const opportunities = [
      opp({ id: 1, source: "Google", stage: "review", job: { id: 50, contractAmount: 8000, totalEstimate: 8000 } }) as never,
    ];
    const payments = [
      { id: 900, jobId: 50, amount: 3000, dateReceived: new Date("2026-10-15T12:00:00Z") },
      { id: 900, jobId: 50, amount: 3000, dateReceived: new Date("2026-10-15T12:00:00Z") }, // duplicate row protection
      { id: 901, jobId: 50, amount: 2000, dateReceived: new Date("2026-11-05T12:00:00Z") }, // outside timeframe
      { id: 902, jobId: 999, amount: 5000, dateReceived: new Date("2026-10-15T12:00:00Z") }, // unlinked job
    ] as never[];
    const { totals } = report(opportunities, payments);
    expect(totals.cashCollected).toBe(3000);
  });

  it("keeps canonical sources as row keys", () => {
    const { rows } = report([opp({ id: 1, source: "LSA", stage: "new_lead" }) as never]);
    expect(rows[0]?.source).toBe("LSA");
  });
});
