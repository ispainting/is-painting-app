/**
 * Shared open-pipeline definition used by Dashboard, Analytics, and Reports.
 *
 * "Open Proposals" = proposals that are still in play:
 * - not archived/deleted (deletedAt null)
 * - not converted
 * - not declined
 * - not connected to a created Job (via the linked Opportunity's Job)
 *
 * One opportunity counts at most once: multiple active revisions resolve to
 * the latest one. Legitimate unlinked proposals (no opportunityId) are kept
 * and each counts once.
 *
 * "Likely Revenue" sums the canonical total of exactly this qualifying set.
 */

export type PipelineProposal = {
  id: number;
  status: string;
  deletedAt?: Date | string | null;
  opportunityId?: number | null;
  totalAmount: unknown;
  createdAt?: Date | string;
  opportunity?: { job?: unknown } | null;
};

export function isOpenPipelineProposal(proposal: PipelineProposal): boolean {
  if (proposal.deletedAt != null) return false;
  if (proposal.status === "converted" || proposal.status === "declined") return false;
  if (proposal.opportunity?.job) return false;
  return true;
}

export function selectOpenProposals<T extends PipelineProposal>(proposals: T[]): T[] {
  const open = proposals.filter(isOpenPipelineProposal);

  const latestByOpportunity = new Map<number, T>();
  const unlinked: T[] = [];
  for (const proposal of open) {
    if (proposal.opportunityId == null) {
      unlinked.push(proposal);
      continue;
    }
    const existing = latestByOpportunity.get(proposal.opportunityId);
    const created = proposal.createdAt ? new Date(proposal.createdAt).getTime() : 0;
    const existingCreated = existing?.createdAt ? new Date(existing.createdAt).getTime() : 0;
    if (!existing || created > existingCreated) {
      latestByOpportunity.set(proposal.opportunityId, proposal);
    }
  }
  return [...latestByOpportunity.values(), ...unlinked];
}

function money(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function openPipelineMetrics(proposals: PipelineProposal[]): { openProposals: number; likelyRevenue: number } {
  const qualifying = selectOpenProposals(proposals);
  return {
    openProposals: qualifying.length,
    likelyRevenue: qualifying.reduce((sum, proposal) => sum + money(proposal.totalAmount), 0),
  };
}
