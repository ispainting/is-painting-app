import { z } from "zod";
import { adminProcedure, router } from "../trpc";

export const notificationsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.userId;
    const [items, unreadCount] = await Promise.all([
      ctx.prisma.appNotification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      ctx.prisma.appNotification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unreadCount };
  }),

  markRead: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.appNotification.updateMany({
        where: { id: input.id, userId: ctx.session!.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true };
    }),

  markAllRead: adminProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.prisma.appNotification.updateMany({
      where: { userId: ctx.session!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }),
});
