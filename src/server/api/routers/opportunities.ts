import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";

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
      include: { customer: true, assignedTo: true },
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
      assignedToId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => ctx.prisma.opportunity.create({ data: input })),

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
      }),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.opportunity.update({ where: { id: input.id }, data: input.data })
    ),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.opportunity.delete({ where: { id: input.id } })
  ),
});
