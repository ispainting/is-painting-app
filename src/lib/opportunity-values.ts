import { jobCanonicalTotal } from "./job-total";
import { todayDateInputValueInMassachusetts } from "./employee-rate-resolver";

type ProposalValue = { id: number; createdAt: Date | string; totalAmount: unknown; deletedAt?: Date | string | null; status: string };

export function latestOpportunityProposal<T extends ProposalValue>(proposals: T[]): T | null {
  return [...proposals].filter((p) => !p.deletedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id)[0] ?? null;
}

export function opportunityValues(opportunity: {
  leadValue?: unknown;
  lostValue?: unknown;
  stage?: string;
  status?: string;
  proposals?: ProposalValue[];
  job?: { contractAmount: unknown; totalEstimate: unknown } | null;
}) {
  const latest = latestOpportunityProposal(opportunity.proposals ?? []);
  const active = latest && !["declined", "expired"].includes(latest.status) ? latest : null;
  const initial = Number(opportunity.leadValue ?? 0);
  const quoted = Number(latest?.totalAmount ?? 0);
  const expected = Number(active?.totalAmount ?? initial);
  const valueAtOutcome = Number(latest?.totalAmount ?? initial);
  const contract = opportunity.job ? jobCanonicalTotal(opportunity.job) : 0;
  const won = opportunity.stage === "completed" || opportunity.status === "won" ? contract : 0;
  const lost = opportunity.stage === "lost"
    ? Number(opportunity.lostValue ?? valueAtOutcome)
    : 0;
  return {
    initial,
    quoted,
    expected: opportunity.status === "open" && opportunity.stage !== "completed" ? expected : 0,
    valueAtOutcome,
    contract,
    won,
    lost,
  };
}

export function opportunityLeadDate(opportunity: { leadReceivedAt?: Date | string | null; createdAt: Date | string }) {
  return new Date(opportunity.leadReceivedAt ?? opportunity.createdAt);
}

export function formatOpportunityDate(value: Date | string | null | undefined): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export function opportunityDateInput(value: Date | string | null | undefined): string {
  return value ? todayDateInputValueInMassachusetts(new Date(value)) : "";
}

export function shouldRecordOpportunityStageHistory(input: {
  previousStage: string;
  nextStage: string;
  previousReason: string;
  nextReason: string;
  historyNote: string;
}): boolean {
  return input.previousStage !== input.nextStage ||
    input.previousReason !== input.nextReason ||
    input.historyNote.trim().length > 0;
}
