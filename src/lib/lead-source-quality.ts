/**
 * Lead Source Quality analytics. Pure builder over plain data so it is fully
 * testable with synthetic fixtures.
 *
 * Rules:
 * - One Opportunity = one lead; cohort timeframe uses leadReceivedAt ?? createdAt.
 * - Invalid/Duplicate and Spam/Fraud are reported separately, never silently dropped.
 * - A lost opportunity remains a qualified lead.
 * - Won/converted = a linked converted Proposal OR a linked Job (not stage-based).
 * - Quoted value = one authoritative latest linked Proposal value per Opportunity.
 * - Won job value = canonical Job total from the one linked Job.
 * - Cash collected = payments in the cash timeframe via linked Jobs, counted once
 *   by payment id, grouped by originating source.
 */
import { jobCanonicalTotal } from "./job-total";
import { normalizeLeadSourceForReport } from "./lead-source";
import { isQualifiedLead, isSpamLead, isInvalidLead, isValidLead, isTerminalStage } from "./pipeline-sync";

export type LeadSourceQualityOpportunity = {
  id: number;
  source?: string | null;
  stage: string;
  status: string;
  leadReceivedAt?: Date | string | null;
  createdAt: Date | string;
  leadValue?: unknown;
  customer?: { leadSource?: string | null; source?: string | null } | null;
  proposals?: Array<{
    id: number;
    status: string;
    totalAmount: unknown;
    createdAt: Date | string;
    sentAt?: Date | string | null;
  }>;
  job?: { id: number; contractAmount: unknown; totalEstimate: unknown } | null;
};

export type LeadSourceQualityPayment = {
  id: number;
  jobId: number | null;
  amount: unknown;
  dateReceived: Date | string;
};

export type LeadSourceQualityRow = {
  source: string;
  totalLeads: number;
  invalidDuplicate: number;
  spamFraud: number;
  validLeads: number;
  notQualified: number;
  qualifiedLeads: number;
  qualificationRate: number | null;
  proposalsSent: number;
  proposalRate: number | null;
  won: number;
  closeRate: number | null;
  openOpportunities: number;
  lostCancelled: number;
  quotedValue: number;
  wonJobValue: number;
  avgWonJobValue: number | null;
  cashCollected: number;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(date: Date | null, start: Date, end: Date): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time >= start.getTime() && time < end.getTime();
}

function money(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function resolveOpportunityLeadSource(opportunity: LeadSourceQualityOpportunity): string {
  return normalizeLeadSourceForReport(
    opportunity.source ?? opportunity.customer?.leadSource ?? opportunity.customer?.source
  );
}

function emptyBucket(source: string): LeadSourceQualityRow {
  return {
    source,
    totalLeads: 0,
    invalidDuplicate: 0,
    spamFraud: 0,
    validLeads: 0,
    notQualified: 0,
    qualifiedLeads: 0,
    qualificationRate: null,
    proposalsSent: 0,
    proposalRate: null,
    won: 0,
    closeRate: null,
    openOpportunities: 0,
    lostCancelled: 0,
    quotedValue: 0,
    wonJobValue: 0,
    avgWonJobValue: null,
    cashCollected: 0,
  };
}

function finalizeRates(row: LeadSourceQualityRow, wonWithJobs: number): LeadSourceQualityRow {
  row.qualificationRate = row.validLeads > 0 ? row.qualifiedLeads / row.validLeads : null;
  row.proposalRate = row.validLeads > 0 ? row.proposalsSent / row.validLeads : null;
  row.closeRate = row.qualifiedLeads > 0 ? row.won / row.qualifiedLeads : null;
  row.avgWonJobValue = wonWithJobs > 0 ? row.wonJobValue / wonWithJobs : null;
  return row;
}

export function buildLeadSourceQualityReport(input: {
  opportunities: LeadSourceQualityOpportunity[];
  payments: LeadSourceQualityPayment[];
  cohortStart: Date;
  cohortEnd: Date;
  cashStart: Date;
  cashEnd: Date;
}): { rows: LeadSourceQualityRow[]; totals: LeadSourceQualityRow } {
  const buckets = new Map<string, LeadSourceQualityRow>();
  const wonJobsBySource = new Map<string, number>();
  const ensure = (source: string) => {
    if (!buckets.has(source)) buckets.set(source, emptyBucket(source));
    return buckets.get(source)!;
  };

  // Cohort: opportunities grouped by lead-received business date.
  const cohort = input.opportunities.filter((opportunity) =>
    inRange(toDate(opportunity.leadReceivedAt) ?? toDate(opportunity.createdAt), input.cohortStart, input.cohortEnd)
  );

  const jobIdToSource = new Map<number, string>();
  for (const opportunity of cohort) {
    const row = ensure(resolveOpportunityLeadSource(opportunity));
    row.totalLeads += 1;

    if (isInvalidLead(opportunity.stage)) row.invalidDuplicate += 1;
    if (isSpamLead(opportunity.stage)) row.spamFraud += 1;
    if (isValidLead(opportunity.stage)) row.validLeads += 1;
    if (opportunity.stage === "not_qualified") row.notQualified += 1;
    if (isQualifiedLead(opportunity.stage)) row.qualifiedLeads += 1;
    if (opportunity.status === "open" && !isTerminalStage(opportunity.stage)) row.openOpportunities += 1;
    if (opportunity.stage === "lost") row.lostCancelled += 1;

    const proposals = opportunity.proposals ?? [];
    // One authoritative quoted value: the latest linked Proposal, never a sum
    // of revisions.
    const latestProposal = proposals.length
      ? [...proposals].sort((a, b) => toDate(b.createdAt)!.getTime() - toDate(a.createdAt)!.getTime())[0]
      : null;
    row.quotedValue += money(latestProposal?.totalAmount);

    if (proposals.some((proposal) => toDate(proposal.sentAt) != null)) row.proposalsSent += 1;

    const won = proposals.some((proposal) => proposal.status === "converted") || opportunity.job != null;
    if (won) row.won += 1;
    if (opportunity.job) {
      const value = jobCanonicalTotal(opportunity.job);
      row.wonJobValue += value;
      wonJobsBySource.set(row.source, (wonJobsBySource.get(row.source) ?? 0) + 1);
      jobIdToSource.set(opportunity.job.id, row.source);
    }
  }

  // Cash: grouped by payment dateReceived, counted once per payment id.
  const seenPaymentIds = new Set<number>();
  for (const payment of input.payments) {
    if (seenPaymentIds.has(payment.id)) continue;
    seenPaymentIds.add(payment.id);
    if (!inRange(toDate(payment.dateReceived), input.cashStart, input.cashEnd)) continue;
    if (payment.jobId == null) continue;
    const source = jobIdToSource.get(payment.jobId);
    if (!source) continue;
    ensure(source).cashCollected += money(payment.amount);
  }

  const rows = [...buckets.values()]
    .map((row) => finalizeRates(row, wonJobsBySource.get(row.source) ?? 0))
    .sort((a, b) => b.totalLeads - a.totalLeads || a.source.localeCompare(b.source));

  const totals = emptyBucket("All sources");
  let totalWonWithJobs = 0;
  for (const row of rows) {
    totals.totalLeads += row.totalLeads;
    totals.invalidDuplicate += row.invalidDuplicate;
    totals.spamFraud += row.spamFraud;
    totals.validLeads += row.validLeads;
    totals.notQualified += row.notQualified;
    totals.qualifiedLeads += row.qualifiedLeads;
    totals.proposalsSent += row.proposalsSent;
    totals.won += row.won;
    totals.openOpportunities += row.openOpportunities;
    totals.lostCancelled += row.lostCancelled;
    totals.quotedValue += row.quotedValue;
    totals.wonJobValue += row.wonJobValue;
    totals.cashCollected += row.cashCollected;
    totalWonWithJobs += wonJobsBySource.get(row.source) ?? 0;
  }
  finalizeRates(totals, totalWonWithJobs);

  return { rows, totals };
}
