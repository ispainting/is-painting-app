export const JOB_STATUS_VALUES = [
  "estimate",
  "sent",
  "approved",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export type JobStatusValue = (typeof JOB_STATUS_VALUES)[number];
export type JobVisibility = "active" | "archived" | "all";

export interface JobsListFilterInput {
  status?: JobStatusValue;
  visibility?: JobVisibility;
}

export interface JobsAccessContext {
  isEmployee: boolean;
  employeeUserId?: number | null;
}

/** Restricts a query to only jobs assigned to the requesting employee. */
export function employeeAssignmentFilter(ctx: JobsAccessContext): Record<string, unknown> {
  return ctx.isEmployee ? { assignments: { some: { userId: ctx.employeeUserId } } } : {};
}

/**
 * Builds the Prisma where clause for jobs.list. visibility "active" means
 * "not archived" (deletedAt null), independent of status; an explicit status
 * filter narrows further. visibility "all" applies no deletedAt filter.
 */
export function buildJobsListWhere(input: JobsListFilterInput | undefined, ctx: JobsAccessContext): Record<string, unknown> {
  const where: Record<string, unknown> = { ...employeeAssignmentFilter(ctx) };
  if (input?.status) where.status = input.status;

  const visibility = input?.visibility ?? "active";
  if (visibility === "active") where.deletedAt = null;
  if (visibility === "archived") where.deletedAt = { not: null };

  return where;
}

/** Every filter chip shown on the Jobs page. */
export type JobsPageFilter = "all" | JobStatusValue | "archived";

export const JOBS_PAGE_FILTERS: JobsPageFilter[] = ["all", ...JOB_STATUS_VALUES, "archived"];

/** Maps a Jobs-page filter chip to the exact jobs.list query input. */
export function buildJobsListInputForPageFilter(filter: JobsPageFilter): JobsListFilterInput {
  if (filter === "all") return { visibility: "all" };
  if (filter === "archived") return { visibility: "archived" };
  return { status: filter, visibility: "active" };
}
