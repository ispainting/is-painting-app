import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { computeEntry } from "../../../lib/payroll";
import { router, protectedProcedure, adminProcedure } from "../trpc";

function buildPayrollPayload(input: {
  clockIn: Date;
  clockOut: Date | null;
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
  breakStartedAt?: Date | null;
  breakEndedAt?: Date | null;
  isManual?: boolean;
}) {
  const computed = computeEntry({
    clockIn: input.clockIn,
    clockOut: input.clockOut,
    breakStartedAt: input.breakStartedAt ?? null,
    breakEndedAt: input.breakEndedAt ?? null,
    clockInLatitude: input.clockInLatitude,
    clockInLongitude: input.clockInLongitude,
    clockOutLatitude: input.clockOutLatitude,
    clockOutLongitude: input.clockOutLongitude,
    isManual: input.isManual ?? false,
  });

  return {
    grossHours: computed.grossHours,
    paidHours: computed.paidHours,
    roundedClockIn: computed.roundedClockIn,
    roundedClockOut: computed.roundedClockOut,
    roundedBreakStartedAt: computed.roundedBreakStartedAt,
    roundedBreakEndedAt: computed.roundedBreakEndedAt,
    breakDurationMinutes: computed.breakDurationMinutes,
    breakDeductionMinutes: computed.breakDeductionMinutes,
    lateBreakMinutes: computed.lateBreakMinutes,
    attendanceFlags: computed.flags,
    calcVersion: computed.calcVersion,
  };
}

const TimeReviewStatusZ = z.enum(["pending", "approved", "rejected"]);
const WorkTypeInputZ = z.enum(["job_site", "shop", "office", "travel", "meeting", "training", "other"]);

const timeEntryFiltersInput = z
  .object({
    days: z.number().default(30),
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    employeeId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    reviewStatus: TimeReviewStatusZ.optional(),
    manualEntries: z.boolean().optional(),
    islandJobs: z.boolean().optional(),
    search: z.string().optional(),
  })
  .optional();

const timeEntryUpsertInput = z.object({
  userId: z.number().int().positive(),
  jobId: z.number().int().positive().nullable().optional(),
  clockIn: z.string().min(1),
  clockOut: z.string().nullable().optional(),
  totalHours: z.number().min(0).nullable().optional(),
  breakMinutes: z.number().min(0).default(0),
  notes: z.string().optional(),
  managerNotes: z.string().optional(),
  notAtJobsiteReason: z.string().optional(),
  isManual: z.boolean().default(true),
  isIslandJob: z.boolean().default(false),
  overtimeOverride: z.boolean().default(false),
  workType: WorkTypeInputZ.nullable().optional(),
  reviewStatus: TimeReviewStatusZ.default("pending"),
  clockInLatitude: z.number().nullable().optional(),
  clockInLongitude: z.number().nullable().optional(),
  clockOutLatitude: z.number().nullable().optional(),
  clockOutLongitude: z.number().nullable().optional(),
  clockInAccuracy: z.number().nullable().optional(),
  clockOutAccuracy: z.number().nullable().optional(),
});

const timeBulkReviewInput = z.object({
  ids: z.array(z.number().int().positive()).default([]),
  reviewStatus: TimeReviewStatusZ,
  employeeId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
  manualEntries: z.boolean().optional(),
  islandJobs: z.boolean().optional(),
  managerNotes: z.string().optional(),
});

const timeBulkToolsInput = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  action: z.enum(["assign_note", "move_project", "duplicate", "delete"]),
  managerNotes: z.string().optional(),
  projectId: z.number().int().positive().optional(),
});

function getDateRange(input?: { days?: number; weekStart?: string }) {
  if (input?.weekStart) {
    const start = new Date(`${input.weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  const since = new Date(Date.now() - (input?.days ?? 30) * 86400000);
  return { start: since, end: new Date() };
}

type TimeEntryWhereFilters = {
  days?: number;
  weekStart?: string;
  employeeId?: number;
  projectId?: number;
  reviewStatus?: z.infer<typeof TimeReviewStatusZ>;
  manualEntries?: boolean;
  islandJobs?: boolean;
  search?: string;
};

function buildTimeEntryWhere(filters?: TimeEntryWhereFilters) {
  const { start, end } = getDateRange(filters);
  const and: any[] = [{ clockIn: { gte: start, lt: end } }];

  if (filters?.employeeId) and.push({ userId: filters.employeeId });
  if (filters?.projectId) and.push({ jobId: filters.projectId });
  if (filters?.reviewStatus) and.push({ reviewStatus: filters.reviewStatus });
  if (filters?.manualEntries !== undefined) and.push({ isManual: filters.manualEntries });
  if (filters?.islandJobs !== undefined) and.push({ isIslandJob: filters.islandJobs });

  if (filters?.search?.trim()) {
    const search = filters.search.trim();
    and.push({
      OR: [
        { notes: { contains: search, mode: "insensitive" } },
        { managerNotes: { contains: search, mode: "insensitive" } },
        { notAtJobsiteReason: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { job: { name: { contains: search, mode: "insensitive" } } },
        { job: { address: { contains: search, mode: "insensitive" } } },
        { job: { customer: { name: { contains: search, mode: "insensitive" } } } },
      ],
    });
  }

  return { AND: and };
}

function parseDate(value: string) {
  return new Date(value);
}

function buildManualPayroll(input: {
  clockIn: Date;
  clockOut: Date | null;
  breakMinutes: number;
  isManual: boolean;
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
}) {
  const payload = buildPayrollPayload({
    clockIn: input.clockIn,
    clockOut: input.clockOut,
    clockInLatitude: input.clockInLatitude,
    clockInLongitude: input.clockInLongitude,
    clockOutLatitude: input.clockOutLatitude,
    clockOutLongitude: input.clockOutLongitude,
    isManual: input.isManual,
  });

  if (input.clockOut) {
    const grossHours = Math.max(0, Math.round(((input.clockOut.getTime() - input.clockIn.getTime()) / 3600000) * 100) / 100);
    payload.grossHours = grossHours;
    payload.breakDurationMinutes = input.breakMinutes;
    payload.breakDeductionMinutes = input.breakMinutes;
    payload.lateBreakMinutes = Math.max(0, input.breakMinutes - 35);
    payload.paidHours = Math.max(0, Math.round((grossHours - input.breakMinutes / 60) * 100) / 100);
  }

  return payload;
}

function applyReviewState(status: z.infer<typeof TimeReviewStatusZ>, approvedById: number | null, managerNotes?: string | null) {
  return {
    reviewStatus: status,
    approvedById: status === "approved" ? approvedById : null,
    managerNotes: managerNotes?.trim() || null,
  };
}

export const timeRouter = router({
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
        jobId: z.number().int().positive().optional(),
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

      const selectedJobId = input.jobId ?? null;

      if (selectedJobId) {
        const job = await ctx.prisma.job.findUnique({
          where: { id: selectedJobId },
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

      const clockIn = new Date();
      const payroll = buildPayrollPayload({
        clockIn,
        clockOut: null,
        clockInLatitude: input.lat,
        clockInLongitude: input.lng,
        clockOutLatitude: null,
        clockOutLongitude: null,
        isManual: false,
      });

      return ctx.prisma.timeEntry.create({
        data: {
          userId: ctx.session!.userId,
          jobId: selectedJobId,
          clockIn,
          clockInLatitude: input.lat,
          clockInLongitude: input.lng,
          clockInAccuracy: input.accuracy,
          isIslandJob: false,
          overtimeOverride: false,
          reviewStatus: "pending",
          approvedById: null,
          ...payroll,
        },
      });
    }),

  clockOut: protectedProcedure
    .input(
      z.object({
        lat: z.number().optional(),
        lng: z.number().optional(),
        accuracy: z.number().optional(),
        notes: z.string().optional(),
        breakMinutes: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const open = await ctx.prisma.timeEntry.findFirst({
        where: { userId: ctx.session!.userId, clockOut: null },
      });
      if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "Not clocked in" });
      const now = new Date();
      const ms = now.getTime() - open.clockIn.getTime();
      const hours = Math.max(0, ms / 3600000 - input.breakMinutes / 60);
      const payroll = buildPayrollPayload({
        clockIn: open.clockIn,
        clockOut: now,
        clockInLatitude: open.clockInLatitude?.toNumber() ?? null,
        clockInLongitude: open.clockInLongitude?.toNumber() ?? null,
        clockOutLatitude: input.lat ?? open.clockOutLatitude?.toNumber() ?? null,
        clockOutLongitude: input.lng ?? open.clockOutLongitude?.toNumber() ?? null,
        breakStartedAt: open.breakStartedAt ?? null,
        breakEndedAt: open.breakEndedAt ?? null,
      });
      return ctx.prisma.timeEntry.update({
        where: { id: open.id },
        data: {
          clockOut: now,
          hoursWorked: Math.round(hours * 100) / 100,
          clockOutLatitude: input.lat ?? open.clockOutLatitude ?? null,
          clockOutLongitude: input.lng ?? open.clockOutLongitude ?? null,
          clockOutAccuracy: input.accuracy,
          notes: input.notes,
          breakMinutes: input.breakMinutes,
          reviewStatus: "pending",
          approvedById: null,
          ...payroll,
        },
      });
    }),

  startBreak: protectedProcedure.mutation(async ({ ctx }) => {
    const open = await ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.session!.userId, clockOut: null },
    });
    if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "Not clocked in" });
    if (open.breakStartedAt && !open.breakEndedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Already on break" });
    }

    const now = new Date();
    const payroll = buildPayrollPayload({
      clockIn: open.clockIn,
      clockOut: null,
      clockInLatitude: open.clockInLatitude?.toNumber() ?? null,
      clockInLongitude: open.clockInLongitude?.toNumber() ?? null,
      clockOutLatitude: open.clockOutLatitude?.toNumber() ?? null,
      clockOutLongitude: open.clockOutLongitude?.toNumber() ?? null,
      breakStartedAt: now,
      breakEndedAt: null,
    });

    return ctx.prisma.timeEntry.update({
      where: { id: open.id },
      data: {
        breakStartedAt: now,
        breakEndedAt: null,
        ...payroll,
      },
    });
  }),

  endBreak: protectedProcedure.mutation(async ({ ctx }) => {
    const open = await ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.session!.userId, clockOut: null },
    });
    if (!open) throw new TRPCError({ code: "BAD_REQUEST", message: "Not clocked in" });
    if (!open.breakStartedAt || open.breakEndedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Not currently on break" });
    }

    const now = new Date();
    const payroll = buildPayrollPayload({
      clockIn: open.clockIn,
      clockOut: null,
      clockInLatitude: open.clockInLatitude?.toNumber() ?? null,
      clockInLongitude: open.clockInLongitude?.toNumber() ?? null,
      clockOutLatitude: open.clockOutLatitude?.toNumber() ?? null,
      clockOutLongitude: open.clockOutLongitude?.toNumber() ?? null,
      breakStartedAt: open.breakStartedAt,
      breakEndedAt: now,
    });

    return ctx.prisma.timeEntry.update({
      where: { id: open.id },
      data: {
        breakEndedAt: now,
        ...payroll,
      },
    });
  }),

  listAll: adminProcedure
    .input(timeEntryFiltersInput)
    .query(({ ctx, input }) => {
      return ctx.prisma.timeEntry.findMany({
        where: buildTimeEntryWhere(input),
        include: {
          user: true,
          approvedBy: { select: { id: true, name: true } },
          job: { include: { customer: true } },
        },
        orderBy: { clockIn: "desc" },
        take: 1000,
      });
    }),

  saveEntry: adminProcedure.input(z.object({ id: z.number().optional(), data: timeEntryUpsertInput })).mutation(async ({ ctx, input }) => {
    const clockIn = parseDate(input.data.clockIn);
    const explicitClockOut = input.data.clockOut ? parseDate(input.data.clockOut) : null;
    const clockOut = explicitClockOut ?? (input.data.totalHours != null ? new Date(clockIn.getTime() + input.data.totalHours * 3_600_000) : null);
    const payroll = buildManualPayroll({
      clockIn,
      clockOut,
      breakMinutes: input.data.breakMinutes,
      isManual: input.data.isManual,
      clockInLatitude: input.data.clockInLatitude ?? null,
      clockInLongitude: input.data.clockInLongitude ?? null,
      clockOutLatitude: input.data.clockOutLatitude ?? null,
      clockOutLongitude: input.data.clockOutLongitude ?? null,
    });

    const reviewState = applyReviewState(input.data.reviewStatus, ctx.session!.userId, input.data.managerNotes);

    const baseData = {
      userId: input.data.userId,
      jobId: input.data.jobId ?? null,
      workType: input.data.workType ?? null,
      clockIn,
      clockOut,
      breakMinutes: input.data.breakMinutes,
      notes: input.data.notes?.trim() || null,
      managerNotes: reviewState.managerNotes,
      notAtJobsiteReason: input.data.notAtJobsiteReason?.trim() || null,
      clockInLatitude: input.data.clockInLatitude ?? null,
      clockInLongitude: input.data.clockInLongitude ?? null,
      clockOutLatitude: input.data.clockOutLatitude ?? null,
      clockOutLongitude: input.data.clockOutLongitude ?? null,
      clockInAccuracy: input.data.clockInAccuracy ?? null,
      clockOutAccuracy: input.data.clockOutAccuracy ?? null,
      isManual: input.data.isManual,
      isIslandJob: input.data.isIslandJob,
      overtimeOverride: input.data.overtimeOverride,
      ...payroll,
    };

    if (input.id) {
      const existing = await ctx.prisma.timeEntry.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found" });
      }

      return ctx.prisma.timeEntry.update({
        where: { id: input.id },
        data: {
          ...baseData,
          ...reviewState,
        },
      });
    }

    return ctx.prisma.timeEntry.create({
      data: {
        ...baseData,
        ...reviewState,
      },
    });
  }),

  duplicateEntry: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.timeEntry.findUnique({ where: { id: input.id } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found" });

    return ctx.prisma.timeEntry.create({
      data: {
        userId: existing.userId,
        jobId: existing.jobId,
        workType: existing.workType,
        clockIn: existing.clockIn,
        clockOut: existing.clockOut,
        breakMinutes: existing.breakMinutes,
        notes: existing.notes,
        notAtJobsiteReason: existing.notAtJobsiteReason,
        clockInLatitude: existing.clockInLatitude,
        clockInLongitude: existing.clockInLongitude,
        clockOutLatitude: existing.clockOutLatitude,
        clockOutLongitude: existing.clockOutLongitude,
        clockInAccuracy: existing.clockInAccuracy,
        clockOutAccuracy: existing.clockOutAccuracy,
        isManual: true,
        isIslandJob: existing.isIslandJob,
        overtimeOverride: existing.overtimeOverride,
        ...buildManualPayroll({
          clockIn: existing.clockIn,
          clockOut: existing.clockOut,
          breakMinutes: existing.breakMinutes,
          isManual: true,
          clockInLatitude: existing.clockInLatitude?.toNumber() ?? null,
          clockInLongitude: existing.clockInLongitude?.toNumber() ?? null,
          clockOutLatitude: existing.clockOutLatitude?.toNumber() ?? null,
          clockOutLongitude: existing.clockOutLongitude?.toNumber() ?? null,
        }),
        ...applyReviewState("pending", ctx.session!.userId),
      },
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
      data: applyReviewState("approved", ctx.session!.userId),
    })
  ),

  reject: adminProcedure.input(z.object({ id: z.number(), managerNotes: z.string().optional() })).mutation(({ ctx, input }) =>
    ctx.prisma.timeEntry.update({
      where: { id: input.id },
      data: applyReviewState("rejected", ctx.session!.userId, input.managerNotes),
    })
  ),

  bulkReview: adminProcedure.input(timeBulkReviewInput).mutation(async ({ ctx, input }) => {
    const targets = input.ids.length
      ? input.ids
      : (await ctx.prisma.timeEntry.findMany({ where: buildTimeEntryWhere(input), select: { id: true } })).map((entry) => entry.id);

    if (!targets.length) return { count: 0 };

    await ctx.prisma.timeEntry.updateMany({
      where: { id: { in: targets } },
      data: {
        reviewStatus: input.reviewStatus,
        approvedById: input.reviewStatus === "approved" ? ctx.session!.userId : null,
        managerNotes: input.managerNotes?.trim() || null,
      },
    });

    return { count: targets.length };
  }),

  bulkTools: adminProcedure.input(timeBulkToolsInput).mutation(async ({ ctx, input }) => {
    if (input.action === "assign_note") {
      const note = input.managerNotes?.trim() || null;
      await ctx.prisma.timeEntry.updateMany({
        where: { id: { in: input.ids } },
        data: { managerNotes: note },
      });
      return { count: input.ids.length };
    }

    if (input.action === "move_project") {
      if (!input.projectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Project is required" });
      }

      await ctx.prisma.timeEntry.updateMany({
        where: { id: { in: input.ids } },
        data: {
          jobId: input.projectId,
          reviewStatus: "pending",
          approvedById: null,
        },
      });
      return { count: input.ids.length };
    }

    if (input.action === "duplicate") {
      const rows = await ctx.prisma.timeEntry.findMany({ where: { id: { in: input.ids } } });
      if (!rows.length) return { count: 0 };

      await Promise.all(
        rows.map((existing) =>
          ctx.prisma.timeEntry.create({
            data: {
              userId: existing.userId,
              jobId: existing.jobId,
              workType: existing.workType,
              clockIn: existing.clockIn,
              clockOut: existing.clockOut,
              breakMinutes: existing.breakMinutes,
              notes: existing.notes,
              notAtJobsiteReason: existing.notAtJobsiteReason,
              clockInLatitude: existing.clockInLatitude,
              clockInLongitude: existing.clockInLongitude,
              clockOutLatitude: existing.clockOutLatitude,
              clockOutLongitude: existing.clockOutLongitude,
              clockInAccuracy: existing.clockInAccuracy,
              clockOutAccuracy: existing.clockOutAccuracy,
              isManual: true,
              isIslandJob: existing.isIslandJob,
              overtimeOverride: existing.overtimeOverride,
              ...buildManualPayroll({
                clockIn: existing.clockIn,
                clockOut: existing.clockOut,
                breakMinutes: existing.breakMinutes,
                isManual: true,
                clockInLatitude: existing.clockInLatitude?.toNumber() ?? null,
                clockInLongitude: existing.clockInLongitude?.toNumber() ?? null,
                clockOutLatitude: existing.clockOutLatitude?.toNumber() ?? null,
                clockOutLongitude: existing.clockOutLongitude?.toNumber() ?? null,
              }),
              ...applyReviewState("pending", ctx.session!.userId),
            },
          })
        )
      );

      return { count: rows.length };
    }

    await ctx.prisma.timeEntry.deleteMany({ where: { id: { in: input.ids } } });
    return { count: input.ids.length };
  }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.timeEntry.delete({ where: { id: input.id } })
  ),
});
