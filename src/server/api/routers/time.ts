import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";

export const timeRouter = router({
  // For mobile employee clock screen
  myActive: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.session!.userId, clockOut: null },
   include: {
  job: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      customer: { select: { name: true } },
    },
  },
},
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
  .input(
    z.object({
      jobId: z.number().int().positive(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0).optional(),
    })
  )
    .mutation(async ({ ctx, input }) => {
      const open = await ctx.prisma.timeEntry.findFirst({
        where: { userId: ctx.session!.userId, clockOut: null },
      });
if (open) throw new TRPCError({ code: "BAD_REQUEST", message: "Already clocked in" });

// Anti-typo guard: refuse to clock into a soft-deleted or non-active job
if (input.jobId) {
  const job = await ctx.prisma.job.findUnique({
    where: { id: input.jobId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!job || job.deletedAt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }
  if (!["active", "approved"].includes(job.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This job is not currently active",
    });
  }
}

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
  today: adminProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional())
    .query(({ ctx, input }) => {
      const base = input?.date ? new Date(input.date + "T00:00:00") : new Date();
      const start = new Date(base);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return ctx.prisma.timeEntry.findMany({
        where: { clockIn: { gte: start, lt: end } },
        include: { user: true, job: { include: { customer: true } } },
        orderBy: { clockIn: "desc" },
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
