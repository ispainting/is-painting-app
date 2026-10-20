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
import { latestOpportunityProposal, opportunityValues } from "./opportunity-values";

export type LeadSourceQualityOpportunity = {
  id: number;
  source?: string | null;
  stage: string;
  status: string;
  leadReceivedAt?: Date | string | null;
  createdAt: Date | string;
  leadValue?: unknown;
  lostValue?: unknown;
  archivedAt?: Date | string | null;
  outcomeAt?: Date | string | null;
  followUpAt?: Date | string | null;
  stageHistory?: Array<{ newStage: string; effectiveAt: Date | string }>;
  customer?: { leadSource?: string | null; source?: string | null } | null;
  proposals?: Array<{
    id: number;
    status: string;
    totalAmount: unknown;
    createdAt: Date | string;
    sentAt?: Date | string | null;
    approvedAt?: Date | string | null;
    deletedAt?: Date | string | null;
  }>;
  job?: { id: number; contractAmount: unknown; totalEstimate: unknown; approvedAt?: Date | string | null } | null;
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
  onHold: number;
  completed: number;
  archived: number;
  initialEstimatedValue: number;
  pipelineExpectedValue: number;
  lostValue: number;
  followUpsOverdue: number;
  avgDaysToProposal: number | null;
  avgDaysToOutcome: number | null;
  avgDaysToWon: number | null;
  avgDaysToLost: number | null;
  proposalDays: number;
  proposalTimingCount: number;
  outcomeDays: number;
  outcomeTimingCount: number;
  wonDays: number;
  wonTimingCount: number;
  lostDays: number;
  lostTimingCount: number;
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
    onHold: 0, completed: 0, archived: 0, initialEstimatedValue: 0,
    pipelineExpectedValue: 0, lostValue: 0, followUpsOverdue: 0,
    avgDaysToProposal: null, avgDaysToOutcome: null, avgDaysToWon: null, avgDaysToLost: null,
    proposalDays: 0, proposalTimingCount: 0, outcomeDays: 0, outcomeTimingCount: 0,
    wonDays: 0, wonTimingCount: 0, lostDays: 0, lostTimingCount: 0,
  };
}

function finalizeRates(row: LeadSourceQualityRow, wonWithJobs: number): LeadSourceQualityRow {
  row.qualificationRate = row.validLeads > 0 ? row.qualifiedLeads / row.validLeads : null;
  row.proposalRate = row.validLeads > 0 ? row.proposalsSent / row.validLeads : null;
  row.closeRate = row.qualifiedLeads > 0 ? row.won / row.qualifiedLeads : null;
  row.avgWonJobValue = wonWithJobs > 0 ? row.wonJobValue / wonWithJobs : null;
  row.avgDaysToProposal = row.proposalTimingCount ? row.proposalDays / row.proposalTimingCount : null;
  row.avgDaysToOutcome = row.outcomeTimingCount ? row.outcomeDays / row.outcomeTimingCount : null;
  row.avgDaysToWon = row.wonTimingCount ? row.wonDays / row.wonTimingCount : null;
  row.avgDaysToLost = row.lostTimingCount ? row.lostDays / row.lostTimingCount : null;
  return row;
}

export function buildLeadSourceQualityReport(input: {
  opportunities: LeadSourceQualityOpportunity[];
  payments: LeadSourceQualityPayment[];
  cohortStart: Date;
  cohortEnd: Date;
  cashStart: Date;
  cashEnd: Date;
  now?: Date;
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
    if (opportunity.status === "open" && !isTerminalStage(opportunity.stage) && !opportunity.archivedAt) row.openOpportunities += 1;
    if (opportunity.stage === "lost") row.lostCancelled += 1;
    if (opportunity.stage === "on_hold") row.onHold += 1;
    if (opportunity.stage === "completed") row.completed += 1;
    if (opportunity.archivedAt) row.archived += 1;
    const values = opportunityValues(opportunity);
    row.initialEstimatedValue += values.initial;
    if (opportunity.status === "open" && !isTerminalStage(opportunity.stage)) row.pipelineExpectedValue += values.expected;
    if (opportunity.stage === "lost") row.lostValue += values.lost;
    const followUp = toDate(opportunity.followUpAt);
    if (followUp && followUp < (input.now ?? new Date()) && !opportunity.archivedAt && opportunity.status === "open" && !isTerminalStage(opportunity.stage)) row.followUpsOverdue += 1;

    const proposals = opportunity.proposals ?? [];
    // One authoritative quoted value: the latest linked Proposal, never a sum
    // of revisions.
    const latestProposal = latestOpportunityProposal(proposals);
    row.quotedValue += money(latestProposal?.totalAmount);

    if (proposals.some((proposal) => toDate(proposal.sentAt) != null)) row.proposalsSent += 1;

    const won = opportunity.stage === "completed" || (
      !isTerminalStage(opportunity.stage) && (proposals.some((proposal) => proposal.status === "converted") || opportunity.job != null)
    );
    if (won) row.won += 1;
    if (opportunity.job && won) {
      const value = jobCanonicalTotal(opportunity.job);
      row.wonJobValue += value;
      wonJobsBySource.set(row.source, (wonJobsBySource.get(row.source) ?? 0) + 1);
      jobIdToSource.set(opportunity.job.id, row.source);
    }
    const lead = toDate(opportunity.leadReceivedAt) ?? toDate(opportunity.createdAt);
    const sentDates = [
      ...proposals.map((p) => toDate(p.sentAt)),
      ...(opportunity.stageHistory ?? []).filter((h) => h.newStage === "estimate_sent").map((h) => toDate(h.effectiveAt)),
    ].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    const wonDate = toDate(opportunity.outcomeAt) ?? toDate(opportunity.job?.approvedAt) ??
      toDate(proposals.find((p) => p.status === "converted")?.approvedAt);
    const closedDate = won || opportunity.stage === "lost" ? toDate(opportunity.outcomeAt) ?? (won ? wonDate : null) : null;
    if (lead && sentDates[0] && sentDates[0] >= lead) {
      row.proposalDays += (sentDates[0].getTime() - lead.getTime()) / 86_400_000;
      row.proposalTimingCount += 1;
    }
    if (lead && closedDate && closedDate >= lead) {
      const days = (closedDate.getTime() - lead.getTime()) / 86_400_000;
      row.outcomeDays += days; row.outcomeTimingCount += 1;
      if (won) { row.wonDays += days; row.wonTimingCount += 1; }
      if (opportunity.stage === "lost") { row.lostDays += days; row.lostTimingCount += 1; }
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
    for (const key of [
      "onHold", "completed", "archived", "initialEstimatedValue", "pipelineExpectedValue", "lostValue", "followUpsOverdue",
      "proposalDays", "proposalTimingCount", "outcomeDays", "outcomeTimingCount", "wonDays", "wonTimingCount", "lostDays", "lostTimingCount",
    ] as const) totals[key] += row[key];
    totalWonWithJobs += wonJobsBySource.get(row.source) ?? 0;
  }
  finalizeRates(totals, totalWonWithJobs);

  return { rows, totals };
}
