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
  { value: "service_delivery", label: "Service Delivery" },
  { value: "review", label: "Review" },
  { value: "not_qualified", label: "Unqualified" },
  { value: "lost", label: "Lost" },
] as const;

export type PipelineStageValue = (typeof PIPELINE_STAGE_OPTIONS)[number]["value"];

export const PIPELINE_STAGE_VALUES = PIPELINE_STAGE_OPTIONS.map((option) => option.value) as PipelineStageValue[];

/** Terminal stages: a historical opportunity in one of these must not block a new lead. */
export const TERMINAL_PIPELINE_STAGES: PipelineStageValue[] = ["lost", "not_qualified"];
