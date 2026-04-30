import { z } from "zod";
import { router, adminProcedure } from "../trpc";

const ChannelZ = z.enum(["sms", "email"]);

export const automationsRouter = router({
  templates: adminProcedure.query(({ ctx }) =>
    ctx.prisma.automationTemplate.findMany({
      include: { steps: { orderBy: { stepNumber: "asc" } } },
      orderBy: { name: "asc" },
    })
  ),

  toggle: adminProcedure
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.automationTemplate.update({
        where: { id: input.id },
        data: { isEnabled: input.enabled },
      })
    ),

  updateStep: adminProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        channel: ChannelZ.optional(),
        delayMinutes: z.number().min(0).optional(),
        messageContent: z.string().optional(),
        emailSubject: z.string().optional(),
        isEnabled: z.boolean().optional(),
      }),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.automationStep.update({ where: { id: input.id }, data: input.data })
    ),

  addStep: adminProcedure
    .input(z.object({
      templateId: z.number(),
      stepNumber: z.number(),
      channel: ChannelZ.default("sms"),
      delayMinutes: z.number().min(0),
      messageContent: z.string().min(1),
      emailSubject: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => ctx.prisma.automationStep.create({ data: input })),

  removeStep: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => ctx.prisma.automationStep.delete({ where: { id: input.id } })),

  runs: adminProcedure.query(({ ctx }) =>
    ctx.prisma.automationRun.findMany({
      include: { opportunity: { include: { customer: true } }, template: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  ),

  pauseRun: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.automationRun.update({ where: { id: input.id }, data: { status: "paused" } })
  ),
});
