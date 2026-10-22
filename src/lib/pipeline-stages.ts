/**
 * Initial pipeline stage options for opportunity creation.
 * Values come from the existing OpportunityStage Prisma enum; labels are
 * display-only. "Unqualified/Lost" maps to the existing terminal stages.
 */
export const PIPELINE_STAGE_OPTIONS = [
  { value: "new_lead", label: "New Lead" },
  { value: "onboarding", label: "Onboarding" },
  { value: "not_answered", label: "Not Answered" },
  { value: "follow_up", label: "Follow Up" },
  { value: "estimate_sent", label: "Estimate Sent" },
  { value: "approval", label: "Approval" },
  { value: "on_hold", label: "On Hold / Postponed" },
  { value: "service_delivery", label: "Service Delivery" },
  { value: "review", label: "Review" },
  { value: "completed", label: "Completed" },
  { value: "not_qualified", label: "Not Qualified" },
  { value: "lost", label: "Lost / Cancelled" },
  { value: "invalid_duplicate", label: "Invalid / Duplicate" },
  { value: "spam_fraud", label: "Spam / Fraud" },
] as const;

export type PipelineStageValue = (typeof PIPELINE_STAGE_OPTIONS)[number]["value"];

export const PIPELINE_STAGE_VALUES = PIPELINE_STAGE_OPTIONS.map((option) => option.value) as PipelineStageValue[];

/** Terminal stages: automation never moves an opportunity out of these; only an explicit admin action can. */
export const TERMINAL_PIPELINE_STAGES: PipelineStageValue[] = ["lost", "not_qualified", "invalid_duplicate", "spam_fraud", "completed"];
