import { z } from "zod";
import { router, publicProcedure } from "../trpc";

export const reviewsRouter = router({
  byToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.reviewSubmission.findUnique({
        where: { token: input.token },
        include: { customer: true },
      })
    ),

  submit: publicProcedure
    .input(z.object({
      token: z.string(),
      rating: z.number().int().min(1).max(5),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const submission = await ctx.prisma.reviewSubmission.update({
        where: { token: input.token },
        data: {
          rating: input.rating,
          feedback: input.feedback,
          submittedAt: new Date(),
          redirectedToGoogle: input.rating >= 4,
        },
      });
      const cfg = await ctx.prisma.config.findUnique({ where: { id: 1 } });
      return {
        ...submission,
        googleUrl: input.rating >= 4 ? cfg?.googleReviewUrl ?? null : null,
      };
    }),
});
