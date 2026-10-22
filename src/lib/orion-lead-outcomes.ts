// What became of each lead ORION (or Make) delivered: its pipeline stage, the proposals sent to
// that customer afterwards, and the job it turned into. Feeds /api/orion/lead-outcomes, which lets
// the marketing platform tie an ad to a lead to a proposal to a signed job. Only ids, stages,
// cities, dates and amounts — never a customer's name, phone, email or address.

export interface OpportunityRow {
  id: number;
  customerId: number;
  stage: string;
  status: string;
  source: string | null;
  createdAt: Date;
  lastStageChangedAt: Date | null;
  city: string | null;
  job: { status: string; contractAmount: unknown; totalEstimate: unknown } | null;
}

export interface ProposalRow {
  customerId: number | null;
  status: string;
  totalAmount: unknown;
  sentAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
}

export interface LeadOutcome {
  leadKey: string;
  opportunityId: number;
  receivedAt: string;
  stage: string;
  status: string;
  lastStageChangedAt: string | null;
  source: string | null;
  city: string | null;
  proposals: {
    count: number;
    sent: number;
    approved: number;
    sentAmount: number;
    approvedAmount: number;
    firstSentAt: string | null;
    firstApprovedAt: string | null;
  };
  job: { status: string; value: number } | null;
}

// A proposal has no link to an opportunity, only to a customer. One made for the same customer
// from a day before the lead onwards is counted as this lead's — a customer whose older work
// predates the lead keeps that older work out.
const PROPOSAL_GRACE_MS = 86_400_000;
const SENT = new Set(["sent", "viewed", "approved", "declined", "follow_up", "converted"]);
const APPROVED = new Set(["approved", "converted"]);

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function buildLeadOutcomes(maps: { legacyId: string; newId: number }[], opportunities: OpportunityRow[], proposals: ProposalRow[]): LeadOutcome[] {
  const byOpportunity = new Map(opportunities.map((o) => [o.id, o]));
  const proposalsByCustomer = new Map<number, ProposalRow[]>();
  for (const p of proposals) {
    if (p.customerId == null) continue;
    proposalsByCustomer.set(p.customerId, [...(proposalsByCustomer.get(p.customerId) ?? []), p]);
  }

  const out: LeadOutcome[] = [];
  for (const map of maps) {
    const o = byOpportunity.get(map.newId);
    if (!o) continue;
    const mine = (proposalsByCustomer.get(o.customerId) ?? []).filter((p) => p.createdAt.getTime() >= o.createdAt.getTime() - PROPOSAL_GRACE_MS);
    const sent = mine.filter((p) => SENT.has(p.status) || p.sentAt);
    const approved = mine.filter((p) => APPROVED.has(p.status) || p.approvedAt);
    const firstOf = (dates: (Date | null)[]) => {
      const ms = dates.filter((d): d is Date => !!d).map((d) => d.getTime());
      return ms.length ? new Date(Math.min(...ms)).toISOString() : null;
    };
    const jobValue = o.job ? (money(o.job.contractAmount) > 0 ? money(o.job.contractAmount) : money(o.job.totalEstimate)) : 0;
    out.push({
      leadKey: map.legacyId,
      opportunityId: o.id,
      receivedAt: o.createdAt.toISOString(),
      stage: o.stage,
      status: o.status,
      lastStageChangedAt: o.lastStageChangedAt?.toISOString() ?? null,
      source: o.source,
      city: o.city,
      proposals: {
        count: mine.length,
        sent: sent.length,
        approved: approved.length,
        sentAmount: sent.reduce((s, p) => s + money(p.totalAmount), 0),
        approvedAmount: approved.reduce((s, p) => s + money(p.totalAmount), 0),
        firstSentAt: firstOf(sent.map((p) => p.sentAt ?? p.createdAt)),
        firstApprovedAt: firstOf(approved.map((p) => p.approvedAt ?? p.createdAt)),
      },
      job: o.job ? { status: o.job.status, value: jobValue } : null,
    });
  }
  return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
