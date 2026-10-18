import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TERMINAL_PIPELINE_STAGES } from "@/lib/pipeline-stages";
import { isReferralSource } from "@/lib/lead-source";

const PipelineZ = z.enum(["sales", "not_interested"]);
const StageZ = z.enum([
  "new_lead", "onboarding", "not_answered", "follow_up",
  "estimate_sent", "approval", "service_delivery", "review",
  "no_reply", "lost", "not_qualified",
]);
const StatusZ = z.enum(["open", "won", "lost"]);

export const opportunitiesRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.opportunity.findMany({
      include: {
        customer: true,
        assignedTo: true,
        job: { select: { id: true, name: true } },
        proposals: {
          select: { id: true, proposalNumber: true, status: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    })
  ),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.opportunity.findUnique({
      where: { id: input.id },
      include: { customer: true, assignedTo: true, automationRuns: true, job: true },
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

        const { referralSource, ...opportunityData } = input;
        const opportunity = await tx.opportunity.create({ data: opportunityData });

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
    .input(z.object({ id: z.number(), pipeline: PipelineZ, stage: StageZ, status: StatusZ.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.opportunity.update({
        where: { id: input.id },
        data: {
          pipeline: input.pipeline,
          stage: input.stage,
          status: input.status,
          lastStageChangedAt: new Date(),
        },
      })
    ),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        name: z.string().optional(),
        leadValue: z.number().optional(),
        source: z.string().optional(),
        assignedToId: z.number().optional(),
        notes: z.string().optional(),
        leadReceivedAt: z.coerce.date().nullable().optional(),
      }),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.opportunity.update({ where: { id: input.id }, data: input.data })
    ),

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
        message: `Cannot delete this opportunity: it has ${blockers.join(", ")}. Remove those links first.`,
      });
    }

    await ctx.prisma.opportunity.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
