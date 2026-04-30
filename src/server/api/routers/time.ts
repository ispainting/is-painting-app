import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";

export const timeRouter = router({
  // For mobile employee clock screen
  myActive: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.session!.userId, clockOut: null },
      include: { job: true },
    });
  }),

  myEntries: protectedProcedure
    .input(z.object({ days: z.number().default(14) }).optional())
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - (input?.days ?? 14) * 86400000);
      return ctx.prisma.timeEntry.findMany({
        where: { userId: ctx.session!.userId, clockIn: { gte: since } },
        include: { job: true },
        orderBy: { clockIn: "desc" },
      });
    }),

  clockIn: protectedProcedure
    .input(z.object({
      jobId: z.number().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      accuracy: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const open = await ctx.prisma.timeEntry.findFirst({
        where: { userId: ctx.session!.userId, clockOut: null },
      });
      if (open) throw new TRPCError({ code: "BAD_REQUEST", message: "Already clocked in" });
      return ctx.prisma.timeEntry.create({
        data: {
          userId: ctx.session!.userId,
          jobId: input.jobId,
          clockIn: new Date(),
          clockInLatitude: input.lat,
          clockInLongitude: input.lng,
          clockInAccuracy: input.accuracy,
        },
      });
    }),

  clockOut: protectedProcedure
    .input(z.object({
      lat: z.number().optional(),
      lng: z.number().optional(),
      accuracy: z.number().optional(),
      notes: z.string().optional(),
      breakMinutes: z.number().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const open = await ctx.prisma.timeEntry.findFirst({
        where: { userId: ctx.session!.userId, clockOut: null },
      });
      if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "Not clocked in" });
      const now = new Date();
      const ms = now.getTime() - open.clockIn.getTime();
      const hours = Math.max(0, ms / 3600000 - input.breakMinutes / 60);
      return ctx.prisma.timeEntry.update({
        where: { id: open.id },
        data: {
          clockOut: now,
          hoursWorked: Math.round(hours * 100) / 100,
          clockOutLatitude: input.lat,
          clockOutLongitude: input.lng,
          clockOutAccuracy: input.accuracy,
          notes: input.notes,
          breakMinutes: input.breakMinutes,
        },
      });
    }),

  // Admin
  listAll: adminProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(({ ctx, input }) => {
      const since = new Date(Date.now() - (input?.days ?? 30) * 86400000);
      return ctx.prisma.timeEntry.findMany({
        where: { clockIn: { gte: since } },
        include: { user: true, job: true },
        orderBy: { clockIn: "desc" },
        take: 500,
      });
    }),

  approve: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.timeEntry.update({
      where: { id: input.id },
      data: { approvedById: ctx.session!.userId },
    })
  ),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.timeEntry.delete({ where: { id: input.id } })
  ),
});
