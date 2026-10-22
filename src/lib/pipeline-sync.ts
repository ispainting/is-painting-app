/**
 * Centralized pipeline synchronization rules. All Opportunity stage logic
 * lives here — routers call these helpers instead of scattering stage logic.
 */
import { TERMINAL_PIPELINE_STAGES } from "./pipeline-stages";
import { opportunityValues } from "./opportunity-values";

export const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  onboarding: "Onboarding",
  not_answered: "Not Answered",
  follow_up: "Follow Up",
  estimate_sent: "Estimate Sent",
  approval: "Approval",
  service_delivery: "Service Delivery",
  review: "Review",
  no_reply: "No Reply",
  lost: "Lost / Cancelled",
  not_qualified: "Not Qualified",
  invalid_duplicate: "Invalid / Duplicate",
  spam_fraud: "Spam / Fraud",
  on_hold: "On Hold / Postponed",
  completed: "Completed",
};

export function opportunityStageLabel(stage: string): string {
  return OPPORTUNITY_STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

/** Forward progression order for the forward-only guard. */
const STAGE_ORDER = [
  "new_lead",
  "onboarding",
  "not_answered",
  "follow_up",
  "estimate_sent",
  "approval",
  "service_delivery",
  "review",
] as const;

export function isTerminalStage(stage: string): boolean {
  return (TERMINAL_PIPELINE_STAGES as string[]).includes(stage);
}

export type ProposalPipelineEvent =
  | "created"
  | "edited"
  | "sent"
  | "approved"
  | "declined"
  | "converted"
  | "reopened";

/** Proposal event → target Opportunity stage (null = no change). */
export function resolveProposalEventStage(event: ProposalPipelineEvent): string | null {
  switch (event) {
    case "sent":
      return "estimate_sent";
    case "approved":
      return "approval";
    case "declined":
      return "follow_up";
    case "converted":
      return "approval";
    default:
      return null;
  }
}

/** Job status → target Opportunity stage (null = no change). */
export function resolveJobStatusStage(status: string): string | null {
  switch (status) {
    case "sent":
      return "estimate_sent";
    case "approved":
      return "approval";
    case "active":
      return "service_delivery";
    case "completed":
      return "completed";
    case "on_hold":
      return "on_hold";
    case "cancelled":
      return "lost"; // displayed as "Lost / Cancelled"
    default:
      return null; // estimate → no automatic change
  }
}

/** Terminal stages automation may enter (job cancelled → lost). */
const AUTO_ALLOWED_TERMINAL_TARGETS = new Set(["lost", "completed"]);

export function opportunityStatusForStage(stage: string): "open" | "won" | "lost" {
  return stage === "completed" ? "won" : isTerminalStage(stage) ? "lost" : "open";
}

/**
 * Decides whether an automatic transition applies. Rules:
 * - idempotent: same stage is a no-op
 * - only open opportunities are automated
 * - terminal stages are never moved by automation (admin-only escape)
 * - automation can only enter `lost`, never the other terminal stages
 * - forward-only along STAGE_ORDER, except the explicit on_hold exception
 */
export function shouldAutoTransition(
  current: { stage: string; status: string; archivedAt?: Date | null },
  targetStage: string | null,
  options?: { allowBackward?: boolean }
): boolean {
  if (!targetStage || current.stage === targetStage) return false;
  if (current.status !== "open") return false;
  if (current.archivedAt) return false;
  if (isTerminalStage(current.stage)) return false;
  if (isTerminalStage(targetStage)) return AUTO_ALLOWED_TERMINAL_TARGETS.has(targetStage);
  if (options?.allowBackward) return true;
  if (targetStage === "on_hold") return true;
  if (current.stage === "on_hold") return true;
  // A declined proposal returns the opportunity to follow_up from the
  // proposal-area stages; production stages never move backward.
  if (targetStage === "follow_up" && (current.stage === "estimate_sent" || current.stage === "approval")) return true;
  const currentIndex = STAGE_ORDER.indexOf(current.stage as (typeof STAGE_ORDER)[number]);
  const targetIndex = STAGE_ORDER.indexOf(targetStage as (typeof STAGE_ORDER)[number]);
  if (currentIndex === -1) return true; // e.g. no_reply → any forward stage
  return targetIndex > currentIndex;
}

type StageTransitionPrisma = {
  opportunity: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<{ id: number; stage: string; status: string; archivedAt?: Date | null; leadValue?: unknown; proposals?: Array<{ id: number; status: string; totalAmount: unknown; createdAt: Date; deletedAt?: Date | null }> } | null>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<unknown>;
  };
};

/**
 * Applies a guarded automatic transition for a linked opportunity. Used by the
 * proposals and jobs routers; returns what happened for logging/tests.
 */
export async function applyOpportunityTransition(
  prisma: StageTransitionPrisma,
  opportunityId: number | null | undefined,
  targetStage: string | null,
  options?: { allowBackward?: boolean; effectiveAt?: Date; changedById?: number; reason?: string }
): Promise<{ applied: boolean; stage: string | null }> {
  if (!opportunityId || !targetStage) return { applied: false, stage: null };
  const current = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, stage: true, status: true, archivedAt: true, leadValue: true, proposals: true },
  });
  if (!current) return { applied: false, stage: null };
  if (!shouldAutoTransition(current, targetStage, options)) {
    return { applied: false, stage: current.stage };
  }
  const effectiveAt = options?.effectiveAt ?? new Date();
  const terminal = isTerminalStage(targetStage);
  await prisma.opportunity.update({
    where: { id: current.id, stage: current.stage, status: "open", archivedAt: null },
    data: {
      stage: targetStage,
      status: opportunityStatusForStage(targetStage),
      lastStageChangedAt: effectiveAt,
      outcomeAt: terminal ? effectiveAt : null,
      outcomeReason: terminal ? options?.reason ?? "Job workflow" : null,
      ...(targetStage === "lost" ? { lostValue: opportunityValues(current).valueAtOutcome } : {}),
      stageHistory: { create: {
        previousStage: current.stage, newStage: targetStage, effectiveAt,
        changedById: options?.changedById, reason: options?.reason ?? "Workflow synchronization",
      } },
    },
  });
  return { applied: true, stage: targetStage };
}

// ─── Analytics classification ──────────────────────────────────────────────

export function isInvalidLead(stage: string): boolean {
  return stage === "invalid_duplicate";
}

export function isSpamLead(stage: string): boolean {
  return stage === "spam_fraud";
}

/** Valid = not invalid/duplicate and not spam/fraud. */
export function isValidLead(stage: string): boolean {
  return !isInvalidLead(stage) && !isSpamLead(stage);
}

/** Qualified = valid and not not_qualified. `lost` remains a qualified lead. */
export function isQualifiedLead(stage: string): boolean {
  return isValidLead(stage) && stage !== "not_qualified";
}
