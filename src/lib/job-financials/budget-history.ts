import type { Prisma } from "@prisma/client";
import type { JobBudgetChangeHistoryItem } from "./types";

export const BUDGET_FIELDS = [
  "laborBudget",
  "materialsBudget",
  "equipmentBudget",
  "subcontractorBudget",
  "travelBudget",
  "otherBudget",
] as const;

export type BudgetField = (typeof BUDGET_FIELDS)[number];

export type BudgetMap = Record<BudgetField, number>;

interface BuildBudgetAuditRowsArgs {
  userId: number;
  jobId: number;
  previousBudgets: BudgetMap;
  nextBudgets: BudgetMap;
  changeSetId: string;
}

function toMoneyString(value: number): string {
  return Number(value).toFixed(2);
}

export function buildBudgetAuditRows(args: BuildBudgetAuditRowsArgs): Array<{
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  before: Prisma.InputJsonValue;
  after: Prisma.InputJsonValue;
}> {
  return BUDGET_FIELDS
    .filter((field) => args.previousBudgets[field] !== args.nextBudgets[field])
    .map((field) => ({
      userId: args.userId,
      action: "job_budget_updated",
      entityType: "job",
      entityId: args.jobId,
      before: {
        field,
        value: toMoneyString(args.previousBudgets[field]),
        changeSetId: args.changeSetId,
      } as Prisma.InputJsonValue,
      after: {
        field,
        value: toMoneyString(args.nextBudgets[field]),
        changeSetId: args.changeSetId,
      } as Prisma.InputJsonValue,
    }));
}

export function parseBudgetHistoryItem(log: {
  id: number;
  userId: number;
  createdAt: Date;
  before: unknown;
  after: unknown;
  user?: { name?: string | null } | null;
}): JobBudgetChangeHistoryItem | null {
  const before = (log.before && typeof log.before === "object") ? log.before as Record<string, unknown> : null;
  const after = (log.after && typeof log.after === "object") ? log.after as Record<string, unknown> : null;
  const candidateField = String(after?.field ?? before?.field ?? "");
  if (!BUDGET_FIELDS.includes(candidateField as BudgetField)) return null;

  const previousValue = Number(before?.value);
  const newValue = Number(after?.value);
  if (!Number.isFinite(previousValue) || !Number.isFinite(newValue)) return null;

  const changeSetId = String(after?.changeSetId ?? before?.changeSetId ?? `job-budget-${log.id}`);

  return {
    id: `audit:${log.id}`,
    at: log.createdAt,
    changedBy: log.user?.name || `User #${log.userId}`,
    changeSetId,
    field: candidateField as BudgetField,
    previousValue,
    newValue,
  };
}
