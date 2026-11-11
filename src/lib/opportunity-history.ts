import type { Prisma } from "@prisma/client";

type HistoryClient = Pick<Prisma.TransactionClient, "opportunityStageHistory">;

export async function synchronizeInitialOpportunityHistory(
  tx: HistoryClient,
  input: {
    opportunityId: number;
    leadReceivedAt: Date | null;
    changedById: number;
  }
): Promise<"unchanged" | "updated" | "created"> {
  if (!input.leadReceivedAt) return "unchanged";

  const initial = await tx.opportunityStageHistory.findFirst({
    where: { opportunityId: input.opportunityId, previousStage: null },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    select: { id: true, effectiveAt: true },
  });
  if (initial) {
    if (initial.effectiveAt.getTime() === input.leadReceivedAt.getTime()) return "unchanged";
    await tx.opportunityStageHistory.update({
      where: { id: initial.id },
      data: { effectiveAt: input.leadReceivedAt },
    });
    return "updated";
  }

  await tx.opportunityStageHistory.create({
    data: {
      opportunityId: input.opportunityId,
      previousStage: null,
      newStage: "new_lead",
      effectiveAt: input.leadReceivedAt,
      changedById: input.changedById,
      reason: "Initial lead received",
    },
  });
  return "created";
}
