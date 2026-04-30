import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../trpc";

export const configRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return (
      (await ctx.prisma.config.findUnique({ where: { id: 1 } })) ??
      (await ctx.prisma.config.create({ data: { id: 1 } }))
    );
  }),

  update: adminProcedure
    .input(
      z.object({
        companyName: z.string().optional(),
        companyPhone: z.string().optional(),
        companyEmail: z.string().email().optional().or(z.literal("")),
        companyAddress: z.string().optional(),
        googleReviewUrl: z.string().url().optional().or(z.literal("")),
        defaultWcPercent: z.number().min(0).optional(),
        defaultGlPercent: z.number().min(0).optional(),
        defaultOverhead: z.number().min(0).optional(),
        defaultMarkup: z.number().min(0).optional(),
        defaultTaxPercent: z.number().min(0).optional(),
        twilioFromNumber: z.string().optional(),
        reminderEmailTo: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.prisma.config.upsert({
        where: { id: 1 },
        update: input,
        create: { id: 1, ...input },
      })
    ),
});
