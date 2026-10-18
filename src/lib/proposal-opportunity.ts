/**
 * Shared opportunity resolution rules for Proposal linking. Used by the
 * proposal create UI and by convertToJob's legacy fallback. Never guesses:
 * exactly one valid open opportunity auto-resolves; multiple require an
 * explicit admin selection; none leaves the proposal unlinked.
 */
import { TERMINAL_PIPELINE_STAGES } from "./pipeline-stages";

export type LinkableOpportunity = {
  id: number;
  status: string;
  stage: string;
};

export function isOpenNonTerminalOpportunity(opportunity: { status: string; stage: string }): boolean {
  return opportunity.status === "open" && !(TERMINAL_PIPELINE_STAGES as string[]).includes(opportunity.stage);
}

export type OpportunityResolution<T extends LinkableOpportunity> =
  | { kind: "none" }
  | { kind: "single"; opportunity: T }
  | { kind: "multiple"; opportunities: T[] };

export function resolveOpportunityForProposal<T extends LinkableOpportunity>(opportunities: T[]): OpportunityResolution<T> {
  const valid = opportunities.filter(isOpenNonTerminalOpportunity);
  if (valid.length === 0) return { kind: "none" };
  if (valid.length === 1) return { kind: "single", opportunity: valid[0] };
  return { kind: "multiple", opportunities: valid };
}
