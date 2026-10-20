import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TERMINAL_PIPELINE_STAGES } from "@/lib/pipeline-stages";
import { isReferralSource } from "@/lib/lead-source";
import { OpportunityStage, Prisma } from "@prisma/client";
import { isTerminalStage, opportunityStatusForStage } from "@/lib/pipeline-sync";
import { opportunityValues } from "@/lib/opportunity-values";
import { linkJobOpportunity } from "@/lib/opportunity-links";

const PipelineZ = z.enum(["sales", "not_interested"]);
const StageZ = z.nativeEnum(OpportunityStage);
const StatusZ = z.enum(["open", "won", "lost"]);
const editable = z.object({
  customerId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).optional(),
  leadValue: z.number().finite().min(0).nullable().optional(),
  source: z.string().max(100).nullable().optional(),
  serviceType: z.string().nullable().optional(),
  referralSource: z.string().nullable().optional(),
  assignedToId: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  leadReceivedAt: z.coerce.date().nullable().optional(),
  stage: StageZ.optional(),
  pipeline: PipelineZ.optional(),
  effectiveAt: z.coerce.date().optional(),
  outcomeReason: z.string().nullable().optional(),
  followUpAt: z.coerce.date().nullable().optional(),
  historyNote: z.string().optional(),
  proposalIds: z.array(z.number().int().positive()).optional(),
  jobId: z.number().int().positive().nullable().optional(),
});

async function editOpportunity(tx: Prisma.TransactionClient, id: number, input: z.infer<typeof editable>, userId: number) {
  const current = await tx.opportunity.findUnique({
    where: { id }, include: { proposals: true, job: true },
  });
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found." });
  const customerId = input.customerId ?? current.customerId;
  const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
  const { effectiveAt, historyNote, proposalIds, jobId, ...data } = input;
  const retainedProposals = proposalIds ?? current.proposals.map((p) => p.id);
  const proposals = await tx.proposal.findMany({ where: { id: { in: retainedProposals } } });
  if (proposals.length !== new Set(retainedProposals).size) throw new TRPCError({ code: "NOT_FOUND", message: "A selected Proposal no longer exists." });
  for (const proposal of proposals) {
    if (proposal.customerId !== customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Linked Proposals must belong to the same customer. Unlink them before changing customer." });
    if (proposal.opportunityId && proposal.opportunityId !== id) throw new TRPCError({ code: "CONFLICT", message: "Proposal already linked elsewhere. Unlink it first." });
  }
  const retainedJobId = jobId === undefined ? current.job?.id : jobId;
  if (retainedJobId) {
    const job = await tx.job.findUnique({ where: { id: retainedJobId } });
    if (!job || job.customerId !== customerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Linked Job must belong to the same customer. Unlink it before changing customer." });
  }
  const stage = input.stage ?? current.stage;
  const stageChanged = stage !== current.stage;
  const recordHistory = stageChanged || effectiveAt !== undefined || input.outcomeReason !== undefined || historyNote !== undefined;
  const at = effectiveAt ?? (stageChanged ? new Date() : current.lastStageChangedAt ?? new Date());
  const terminal = isTerminalStage(stage);
  const result = await tx.opportunity.update({
    where: { id },
    data: {
      ...data,
      ...(input.stage !== undefined ? { status: opportunityStatusForStage(stage) } : {}),
      ...(recordHistory ? {
        lastStageChangedAt: at,
        outcomeAt: terminal ? at : null,
        outcomeReason: terminal ? input.outcomeReason ?? current.outcomeReason : null,
        ...(stage === "lost" && (stageChanged || current.lostValue === null) ? {
          lostValue: opportunityValues({ ...current, leadValue: input.leadValue === undefined ? current.leadValue : input.leadValue, proposals }).expected,
        } : {}),
        stageHistory: { create: {
          previousStage: current.stage, newStage: stage, effectiveAt: at, changedById: userId,
          reason: input.outcomeReason, note: historyNote,
        } },
      } : {}),
    },
  });
  if (proposalIds !== undefined) {
    await tx.proposal.updateMany({ where: { opportunityId: id, id: { notIn: proposalIds } }, data: { opportunityId: null } });
    await tx.proposal.updateMany({ where: { id: { in: proposalIds } }, data: { opportunityId: id } });
  }
  if (jobId !== undefined) {
    if (current.job && current.job.id !== jobId) await linkJobOpportunity(tx, current.job.id, null);
    if (jobId !== null) await linkJobOpportunity(tx, jobId, id);
  }
  return result;
}

export const opportunitiesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.opportunity.findMany({
      include: {
        customer: true,
        assignedTo: true,
        job: true,
        _count: { select: { stageHistory: true, automationRuns: true } },
        proposals: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    })
  ),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.opportunity.findUnique({
      where: { id: input.id },
      include: { customer: true, assignedTo: true, automationRuns: true, job: true, proposals: true,
        stageHistory: { include: { changedBy: { select: { id: true, name: true } } }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] } },
    })
  ),

  create: adminProcedure
    .input(z.object({
      customerId: z.number(),
      name: z.string().min(1),
      pipeline: PipelineZ.default("sales"),
      stage: StageZ.default("new_lead"),
      leadValue: z.number().optional(),
      source: z.string().optional(),
      referralSource: z.string().optional(),
      assignedToId: z.number().optional(),
      notes: z.string().optional(),
      leadReceivedAt: z.coerce.date().optional(),
      serviceType: z.string().optional(),
      followUpAt: z.coerce.date().nullable().optional(),
      effectiveAt: z.coerce.date().optional(),
      outcomeReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });

        // Block an accidental duplicate: one open non-terminal opportunity per
        // customer. Terminal history never blocks a legitimate new lead.
        const existingOpen = await tx.opportunity.findFirst({
          where: {
            customerId: input.customerId,
            status: "open",
            archivedAt: null,
            stage: { notIn: TERMINAL_PIPELINE_STAGES },
          },
          select: { id: true, name: true },
        });
        if (existingOpen) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This customer already has an open opportunity ("${existingOpen.name}"). Close it as terminal before creating a new one.`,
          });
        }

        const { referralSource, effectiveAt, ...opportunityData } = input;
        const at = effectiveAt ?? input.leadReceivedAt ?? new Date();
        const opportunity = await tx.opportunity.create({ data: {
          ...opportunityData,
          referralSource: isReferralSource(input.source) ? referralSource : undefined,
          status: opportunityStatusForStage(input.stage),
          lastStageChangedAt: at,
          outcomeAt: isTerminalStage(input.stage) ? at : null,
          lostValue: input.stage === "lost" ? input.leadValue : undefined,
          stageHistory: { create: { newStage: input.stage, effectiveAt: at, changedById: ctx.session.userId, reason: input.outcomeReason } },
        } });

        // Preserve referral attribution on the customer without overwriting.
        if (referralSource?.trim() && isReferralSource(input.source)) {
          await tx.customer.updateMany({
            where: { id: input.customerId, OR: [{ referralSource: null }, { referralSource: "" }] },
            data: { referralSource: referralSource.trim() },
          });
          await tx.customer.updateMany({
            where: { id: input.customerId, OR: [{ leadSource: null }, { leadSource: "" }] },
            data: { leadSource: "Referral" },
          });
        }

        return opportunity;
      });
    }),

  setStage: adminProcedure
    .input(z.object({ id: z.number(), pipeline: PipelineZ, stage: StageZ, status: StatusZ.optional(), effectiveAt: z.coerce.date().optional(), outcomeReason: z.string().optional(), historyNote: z.string().optional() }))
    .mutation(({ ctx, input }) => ctx.prisma.$transaction(
      (tx) => editOpportunity(tx, input.id, input, ctx.session.userId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      data: editable,
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.$transaction((tx) => editOpportunity(tx, input.id, input.data, ctx.session.userId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    ),

  setArchived: adminProcedure.input(z.object({ id: z.number(), archived: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.prisma.opportunity.update({ where: { id: input.id }, data: { archivedAt: input.archived ? new Date() : null } })
  ),

  linkCandidates: adminProcedure.input(z.object({ customerId: z.number() })).query(async ({ ctx, input }) => {
    const [proposals, jobs] = await Promise.all([
      ctx.prisma.proposal.findMany({ where: { customerId: input.customerId, deletedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      ctx.prisma.job.findMany({ where: { customerId: input.customerId, deletedAt: null }, orderBy: { id: "desc" } }),
    ]);
    return { proposals, jobs };
  }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const opportunity = await ctx.prisma.opportunity.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        customer: { select: { name: true } },
        job: { select: { id: true } },
        _count: { select: { proposals: true, automationRuns: true } },
      },
    });
    if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found." });

    const blockers: string[] = [];
    if (opportunity._count.proposals > 0) blockers.push(`${opportunity._count.proposals} linked proposal(s)`);
    if (opportunity.job) blockers.push("a linked job");
    if (opportunity._count.automationRuns > 0) blockers.push("automation history");
    if (blockers.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Cannot delete this opportunity: it has ${blockers.join(", ")}. Archive it instead.`,
      });
    }

    await ctx.prisma.opportunity.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
