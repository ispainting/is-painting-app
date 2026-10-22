import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

type LinkClient = Pick<Prisma.TransactionClient, "opportunity" | "proposal" | "job">;

export async function validateOpportunityCustomer(tx: LinkClient, opportunityId: number, customerId: number | null) {
  const opportunity = await tx.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found." });
  if (!customerId || opportunity.customerId !== customerId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Opportunity does not belong to the selected customer." });
  }
  return opportunity;
}

export async function linkJobOpportunity(tx: LinkClient, jobId: number, opportunityId: number | null) {
  const job = await tx.job.findUnique({ where: { id: jobId } });
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });
  if (opportunityId !== null) {
    await validateOpportunityCustomer(tx, opportunityId, job.customerId);
    const occupied = await tx.job.findUnique({ where: { opportunityId } });
    if (occupied && occupied.id !== jobId) {
      throw new TRPCError({ code: "CONFLICT", message: "This opportunity already has a Job. Unlink it first." });
    }
    if (job.opportunityId && job.opportunityId !== opportunityId) {
      throw new TRPCError({ code: "CONFLICT", message: "This Job is linked to another Opportunity. Unlink it first." });
    }
  }
  return tx.job.update({ where: { id: jobId }, data: { opportunityId } });
}
