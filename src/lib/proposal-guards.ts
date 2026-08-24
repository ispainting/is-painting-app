/**
 * Draft-without-client guard logic for Proposals.
 *
 * A Proposal may exist and be estimated indefinitely without a linked Customer
 * ("unlinked draft"). A Customer is only required before actions that require
 * an actual counterparty: sending, approving/signing, or converting to a Job.
 */

export type ProposalGuardStatus = "draft" | "ready" | "sent" | "viewed" | "approved" | "declined" | "follow_up" | "converted";

export interface ProposalLinkState {
  customerId: number | null;
  status: ProposalGuardStatus;
}

export type ProposalCustomerRequiredAction = "send" | "approve" | "convert_to_job";

const ACTION_LABELS: Record<ProposalCustomerRequiredAction, string> = {
  send: "send",
  approve: "approve/sign",
  convert_to_job: "convert to a Job",
};

export function isProposalLinked(proposal: Pick<ProposalLinkState, "customerId">): boolean {
  return proposal.customerId != null;
}

export class ProposalNotLinkedError extends Error {
  constructor(action: ProposalCustomerRequiredAction) {
    super(`Client not linked. Link a customer before you can ${ACTION_LABELS[action]} this proposal.`);
    this.name = "ProposalNotLinkedError";
  }
}

/**
 * Throws ProposalNotLinkedError if the proposal has no linked customer.
 * Call before executing any of ProposalCustomerRequiredAction.
 */
export function assertCustomerLinked(
  proposal: Pick<ProposalLinkState, "customerId">,
  action: ProposalCustomerRequiredAction
): void {
  if (!isProposalLinked(proposal)) {
    throw new ProposalNotLinkedError(action);
  }
}

export function canPerformAction(
  proposal: Pick<ProposalLinkState, "customerId">,
  action: ProposalCustomerRequiredAction
): boolean {
  return isProposalLinked(proposal);
}
