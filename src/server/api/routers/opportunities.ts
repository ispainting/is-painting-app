import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TERMINAL_PIPELINE_STAGES } from "@/lib/pipeline-stages";
import { isReferralSource, normalizeLeadSourceForReport } from "@/lib/lead-source";
import { startOfBusinessDayInMassachusetts } from "@/lib/employee-rate-resolver";
import { OpportunityStage, Prisma } from "@prisma/client";
import { isTerminalStage, opportunityStatusForStage } from "@/lib/pipeline-sync";
import { opportunityValues } from "@/lib/opportunity-values";
import { linkJobOpportunity } from "@/lib/opportunity-links";
import { synchronizeInitialOpportunityHistory } from "@/lib/opportunity-history";
import { attributionFromLeadNote, attributionFromMetadata, compactAttribution, leadAttributionFields, mergeAttribution, type LeadAttribution } from "@/lib/orion-attribution";

const PipelineZ = z.enum(["sales", "not_interested"]);
const StageZ = z.nativeEnum(OpportunityStage);
const StatusZ = z.enum(["open", "won", "lost"]);
const AttributionZ = z.object(Object.fromEntries(leadAttributionFields.map((field) => [field, z.string().trim().max(1000).optional()])) as Record<typeof leadAttributionFields[number], z.ZodOptional<z.ZodString>>);
const DateInputZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, { message: "Enter a valid calendar date." });
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
          lostValue: opportunityValues({ ...current, leadValue: input.leadValue === undefined ? current.leadValue : input.leadValue, proposals }).valueAtOutcome,
        } : {}),
        stageHistory: { create: {
          previousStage: current.stage, newStage: stage, effectiveAt: at, changedById: userId,
          reason: input.outcomeReason, note: historyNote,
        } },
      } : {}),
    },
  });
  await synchronizeInitialOpportunityHistory(tx, {
    opportunityId: id,
    leadReceivedAt: input.leadReceivedAt === undefined ? current.leadReceivedAt : input.leadReceivedAt,
    changedById: userId,
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
  leadSourceCounts: protectedProcedure
    .input(z.object({
      from: DateInputZ,
      to: DateInputZ,
    }).refine((range) => range.from <= range.to, { message: "Start date must be on or before end date." }))
    .query(async ({ ctx, input }) => {
      // Match the Opportunity board and monthly reports: use the lead-received
      // timestamp, falling back to creation time for older records without it.
      const dayAfterEnd = new Date(`${input.to}T12:00:00Z`);
      dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
      const range = {
        start: startOfBusinessDayInMassachusetts(input.from),
        end: startOfBusinessDayInMassachusetts(dayAfterEnd.toISOString().slice(0, 10)),
      };
      const leads = await ctx.prisma.opportunity.findMany({
        where: {
          OR: [
            { leadReceivedAt: { gte: range.start, lt: range.end } },
            { leadReceivedAt: null, createdAt: { gte: range.start, lt: range.end } },
          ],
        },
        select: {
          source: true,
          customer: { select: { leadSource: true, source: true } },
        },
      });
      const bySource = new Map<string, number>();
      for (const lead of leads) {
        const source = normalizeLeadSourceForReport(lead.source ?? lead.customer.leadSource ?? lead.customer.source);
        bySource.set(source, (bySource.get(source) ?? 0) + 1);
      }
      return {
        total: leads.length,
        bySource: [...bySource.entries()]
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
      };
    }),

  list: protectedProcedure
    .input(z.object({ visibility: z.enum(["active", "archived", "all"]) }).optional())
    .query(({ ctx, input }) =>
    ctx.prisma.opportunity.findMany({
      where: !input?.visibility || input.visibility === "all"
        ? undefined
        : { archivedAt: input.visibility === "archived" ? { not: null } : null },
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

  marketingAttribution: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const opportunity = await ctx.prisma.opportunity.findUnique({
      where: { id: input.id },
      select: { id: true, customerId: true, notes: true },
    });
    if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found." });
    const touchpoints = await ctx.prisma.customerTouchpoint.findMany({
      where: { customerId: opportunity.customerId, deletedAt: null, metadata: { path: ["opportunityId"], equals: opportunity.id } },
      orderBy: { createdAt: "asc" },
      select: { metadata: true },
    });
    let structured: LeadAttribution | null = null;
    for (const touchpoint of touchpoints) structured = mergeAttribution(structured, attributionFromMetadata(touchpoint.metadata));
    return mergeAttribution(structured, attributionFromLeadNote(opportunity.notes)) ?? {};
  }),

  updateMarketingAttribution: adminProcedure
    .input(z.object({ id: z.number().int().positive(), attribution: AttributionZ }))
    .mutation(async ({ ctx, input }) => ctx.prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.findUnique({ where: { id: input.id }, select: { id: true, customerId: true, leadReceivedAt: true, createdAt: true } });
      if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found." });
      const existing = await tx.customerTouchpoint.findFirst({
        where: { customerId: opportunity.customerId, deletedAt: null, metadata: { path: ["opportunityId"], equals: opportunity.id } },
        orderBy: { createdAt: "asc" },
        select: { id: true, metadata: true },
      });
      const attribution = compactAttribution(input.attribution);
      const base = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? { ...(existing.metadata as Prisma.JsonObject) }
        : {};
      for (const field of leadAttributionFields) delete base[field];
      const metadata = { ...base, type: "marketing_attribution", opportunityId: opportunity.id, ...(attribution ?? {}) };
      if (existing) {
        await tx.customerTouchpoint.update({ where: { id: existing.id }, data: { metadata } });
      } else {
        await tx.customerTouchpoint.create({ data: {
          customerId: opportunity.customerId,
          type: "note",
          subject: "Marketing attribution",
          body: "Marketing attribution entered or confirmed in the Opportunity editor.",
          occurredAt: opportunity.leadReceivedAt ?? opportunity.createdAt,
          metadata,
        } });
      }
      return attribution ?? {};
    })),

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
        const initialEffectiveAt = input.leadReceivedAt ?? new Date();
        const at = input.stage === "new_lead"
          ? initialEffectiveAt
          : effectiveAt ?? initialEffectiveAt;
        const initialHistory = {
          newStage: "new_lead" as const,
          effectiveAt: initialEffectiveAt,
          changedById: ctx.session.userId,
          reason: "Initial lead received",
        };
        const stageHistory = input.stage === "new_lead"
          ? [initialHistory]
          : [
              initialHistory,
              {
                previousStage: "new_lead" as const,
                newStage: input.stage,
                effectiveAt: at,
                changedById: ctx.session.userId,
                reason: input.outcomeReason ?? "Stage selected at creation",
              },
            ];
        const opportunity = await tx.opportunity.create({ data: {
          ...opportunityData,
          referralSource: isReferralSource(input.source) ? referralSource : undefined,
          status: opportunityStatusForStage(input.stage),
          lastStageChangedAt: at,
          outcomeAt: isTerminalStage(input.stage) ? at : null,
          lostValue: input.stage === "lost" ? input.leadValue : undefined,
          stageHistory: { create: stageHistory },
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
