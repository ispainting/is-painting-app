import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { hashPassword } from "@/lib/auth";
import { calculateEmployeeGrossPay } from "@/lib/employee-payroll";

const RoleZ = z.enum(["admin", "employee"]);
const StatusFilterZ = z.enum(["active", "inactive", "all"]);
const TravelRateTypeZ = z.enum(["regular", "special", "custom"]);
const DocumentTypeZ = z.enum(["driver_license", "osha_card", "contract", "w9", "i9", "insurance", "custom"]);
const CertificationStatusZ = z.enum(["active", "expiring_soon", "expired"]);

const profileInput = z.object({
  name: z.string().min(1),
  employeeRole: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  profilePhotoUrl: z.string().url().optional().or(z.literal("")),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  hireDate: z.coerce.date().optional().nullable(),
  employeeCode: z.string().optional(),
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  isActive: z.boolean().optional(),
});

const payrollInput = z.object({
  hourlyRate: z.number().min(0),
  specialJobAdjustment: z.number().min(0).default(0),
  overtimeMultiplier: z.number().min(1).default(1.5),
  overtimeRate: z.number().min(0).optional().nullable(),
  travelPayEnabled: z.boolean().default(false),
  defaultTravelHours: z.number().min(0).default(0),
  travelRateType: TravelRateTypeZ.default("regular"),
  customTravelRate: z.number().min(0).optional().nullable(),
  payrollNotes: z.string().optional(),
});

const certificationInput = z.object({
  userId: z.number(),
  name: z.string().min(1),
  issuingAuthority: z.string().optional(),
  issueDate: z.coerce.date().optional().nullable(),
  expirationDate: z.coerce.date().optional().nullable(),
  reminderDays: z.number().int().min(1).max(365).default(30),
  status: CertificationStatusZ.default("active"),
  notes: z.string().optional(),
});

const documentInput = z.object({
  userId: z.number(),
  type: DocumentTypeZ.default("custom"),
  title: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().url().optional(),
  mimeType: z.string().optional(),
  notes: z.string().optional(),
});

const noteInput = z.object({
  userId: z.number(),
  note: z.string().min(1),
});

function textOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function logEmployeeActivity(
  ctx: any,
  input: {
    userId: number;
    actorId?: number | null;
    type:
      | "created"
      | "updated"
      | "payroll_updated"
      | "job_assigned"
      | "job_unassigned"
      | "archived"
      | "restored"
      | "deleted"
      | "duplicated"
      | "certification_added"
      | "certification_updated"
      | "certification_removed"
      | "document_uploaded"
      | "document_removed"
      | "note_added";
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  return ctx.prisma.employeeActivity.create({
    data: {
      userId: input.userId,
      actorId: input.actorId ?? null,
      type: input.type,
      description: input.description,
      metadata: input.metadata,
    },
  });
}

export const employeesRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          visibility: StatusFilterZ.optional(),
          search: z.string().optional(),
          position: z.string().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(25),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const visibility = input?.visibility ?? "active";
      const where: any = {};
      if (visibility === "active") where.isActive = true;
      if (visibility === "inactive") where.isActive = false;

      if (input?.search?.trim()) {
        const search = input.search.trim();
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { employeeRole: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
        ];
      }

      if (input?.position?.trim()) {
        where.employeeRole = { contains: input.position.trim(), mode: "insensitive" };
      }

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 25;

      const [total, rows] = await Promise.all([
        ctx.prisma.user.count({ where }),
        ctx.prisma.user.findMany({
          where,
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            hourlyRate: true,
            isActive: true,
            createdAt: true,
            employeeRole: true,
            hireDate: true,
            employeeCode: true,
            _count: {
              select: {
                jobAssignments: {
                  where: {
                    job: {
                      deletedAt: null,
                      status: { in: ["estimate", "sent", "approved", "active", "on_hold"] },
                    },
                  },
                },
              },
            },
          },
        }),
      ]);

      return {
        rows,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      };
    }),

  byIdWorkspace: adminProcedure
    .input(
      z.object({
        id: z.number(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        include: {
          employeeCertifications: { orderBy: { expirationDate: "asc" } },
          employeeDocuments: { orderBy: { createdAt: "desc" } },
          employeeNotes: {
            include: { author: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
            take: 200,
          },
          jobAssignments: {
            include: {
              job: {
                include: {
                  customer: { select: { name: true } },
                  timeEntries: {
                    where: { userId: input.id },
                    select: { paidHours: true, grossHours: true, hoursWorked: true, clockIn: true },
                  },
                },
              },
            },
            orderBy: { assignedAt: "desc" },
          },
          employeeActivities: {
            include: { actor: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
            take: 300,
          },
        },
      });

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const start = input.startDate ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
      const end = input.endDate ?? new Date();

      const timeEntries = await ctx.prisma.timeEntry.findMany({
        where: {
          userId: input.id,
          clockIn: { gte: start, lte: end },
        },
        include: {
          job: { select: { id: true, name: true, customer: { select: { name: true } } } },
        },
        orderBy: { clockIn: "desc" },
        take: 1000,
      });

      const ninetyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
      const performanceEntries = await ctx.prisma.timeEntry.findMany({
        where: { userId: input.id, clockIn: { gte: ninetyDaysAgo } },
        include: { job: { select: { status: true } } },
      });

      const defaultRate = numberOrZero(user.hourlyRate);
      const specialAdjustment = numberOrZero(user.specialJobAdjustment);
      const overtimeMultiplier = numberOrZero(user.overtimeMultiplier || 1.5);
      const overtimeRate = user.overtimeRate == null ? null : numberOrZero(user.overtimeRate);
      const defaultTravelHours = numberOrZero(user.defaultTravelHours);
      const weeklyHours = groupByWeekHours(
        performanceEntries.map((entry) => ({
          clockIn: entry.clockIn,
          hours: numberOrZero(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked),
        }))
      );

      const averageHoursPerWeek = weeklyHours.length
        ? weeklyHours.reduce((sum, value) => sum + value, 0) / weeklyHours.length
        : 0;

      const lateArrivals = performanceEntries.filter((entry) => entry.clockIn.getHours() > 9).length;
      const missedPunches = performanceEntries.filter((entry) => !entry.clockOut).length;
      const jobsCompleted = user.jobAssignments.filter((assignment) => assignment.job.status === "completed").length;
      const attendanceScore = Math.max(0, Math.min(100, 100 - lateArrivals * 2 - missedPunches * 5));
      const productivityScore = Math.max(
        0,
        Math.min(100, averageHoursPerWeek > 0 ? Math.min(100, (averageHoursPerWeek / 40) * 100) : 0)
      );

      const assignedJobs = user.jobAssignments.map((assignment) => {
        const hoursWorked = assignment.job.timeEntries.reduce(
          (sum, entry) => sum + numberOrZero(entry.paidHours ?? entry.grossHours ?? entry.hoursWorked),
          0
        );
        const laborCost = hoursWorked * defaultRate;
        const completionPercent =
          assignment.job.status === "completed"
            ? 100
            : assignment.job.status === "active"
              ? 60
              : assignment.job.status === "approved"
                ? 40
                : assignment.job.status === "sent"
                  ? 20
                  : 10;

        return {
          id: assignment.job.id,
          name: assignment.job.name,
          customerName: assignment.job.customer.name,
          status: assignment.job.status,
          startDate: assignment.job.startDate,
          endDate: assignment.job.endDate,
          hoursWorked,
          laborCost,
          completionPercent,
        };
      });

      const jobsByBucket = {
        current: assignedJobs.filter((job) => ["active", "approved", "on_hold"].includes(job.status)),
        completed: assignedJobs.filter((job) => job.status === "completed"),
        upcoming: assignedJobs.filter((job) => ["estimate", "sent"].includes(job.status)),
      };

      const payrollPreview = calculateEmployeeGrossPay({
        regularHours: 32,
        specialHours: 4,
        travelHours: defaultTravelHours,
        overtimeHours: 8,
        regularRate: defaultRate,
        specialAdjustment,
        overtimeMultiplier,
        overtimeRate,
        travelRateType: user.travelRateType,
        customTravelRate: user.customTravelRate == null ? null : numberOrZero(user.customTravelRate),
      });

      const timeline = [
        {
          id: `created-${user.id}`,
          at: user.createdAt,
          title: "Employee created",
          description: `${user.name} profile was created`,
        },
        ...user.employeeActivities.map((activity) => ({
          id: `activity-${activity.id}`,
          at: activity.createdAt,
          title: activity.type.replace(/_/g, " "),
          description: activity.description,
        })),
        ...timeEntries.slice(0, 120).map((entry) => ({
          id: `clock-${entry.id}`,
          at: entry.clockIn,
          title: "Clock event",
          description: `${entry.job?.name || "No job"} • ${entry.clockOut ? "Clocked out" : "Clocked in"}`,
        })),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      return {
        employee: user,
        timeEntries,
        jobsByBucket,
        performance: {
          attendanceScore,
          averageHoursPerWeek,
          lateArrivals,
          missedPunches,
          productivityScore,
          jobsCompleted,
          averageReviewScore: null,
        },
        payrollPreview,
        timeline,
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        role: RoleZ.default("employee"),
        employeeRole: z.string().optional(),
        phone: z.string().optional(),
        hourlyRate: z.number().min(0).optional(),
        employeeCode: z.string().optional(),
        hireDate: z.coerce.date().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const password = await hashPassword(input.password);
      const user = await ctx.prisma.user.create({
        data: {
          ...input,
          password,
          employeeRole: textOrNull(input.employeeRole),
          phone: textOrNull(input.phone),
          employeeCode: textOrNull(input.employeeCode),
          hireDate: input.hireDate || null,
        },
      });
      await logEmployeeActivity(ctx, {
        userId: user.id,
        actorId: ctx.session.userId,
        type: "created",
        description: "Employee profile created",
      });
      return user;
    }),

  duplicate: adminProcedure
    .input(z.object({ id: z.number(), email: z.string().email(), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.user.findUnique({ where: { id: input.id } });
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const password = await hashPassword("temp1234");
      const duplicated = await ctx.prisma.user.create({
        data: {
          name: input.name?.trim() || `${source.name} (Copy)`,
          email: input.email,
          password,
          role: source.role,
          phone: source.phone,
          hourlyRate: source.hourlyRate,
          employeeRole: source.employeeRole,
          profilePhotoUrl: source.profilePhotoUrl,
          address: source.address,
          emergencyContactName: source.emergencyContactName,
          emergencyContactPhone: source.emergencyContactPhone,
          hireDate: source.hireDate,
          specialJobAdjustment: source.specialJobAdjustment,
          overtimeMultiplier: source.overtimeMultiplier,
          overtimeRate: source.overtimeRate,
          travelPayEnabled: source.travelPayEnabled,
          defaultTravelHours: source.defaultTravelHours,
          travelRateType: source.travelRateType,
          customTravelRate: source.customTravelRate,
          payrollNotes: source.payrollNotes,
          skills: source.skills,
          languages: source.languages,
          isActive: source.isActive,
        },
      });

      await logEmployeeActivity(ctx, {
        userId: duplicated.id,
        actorId: ctx.session.userId,
        type: "duplicated",
        description: `Duplicated from employee #${source.id}`,
      });

      return duplicated;
    }),

  updateProfile: adminProcedure
    .input(z.object({ id: z.number(), data: profileInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.user.update({
        where: { id: input.id },
        data: {
          ...input.data,
          employeeRole: input.data.employeeRole === undefined ? undefined : textOrNull(input.data.employeeRole),
          phone: input.data.phone === undefined ? undefined : textOrNull(input.data.phone),
          email: input.data.email === undefined ? undefined : input.data.email.trim(),
          address: input.data.address === undefined ? undefined : textOrNull(input.data.address),
          profilePhotoUrl:
            input.data.profilePhotoUrl === undefined ? undefined : textOrNull(input.data.profilePhotoUrl),
          emergencyContactName:
            input.data.emergencyContactName === undefined
              ? undefined
              : textOrNull(input.data.emergencyContactName),
          emergencyContactPhone:
            input.data.emergencyContactPhone === undefined
              ? undefined
              : textOrNull(input.data.emergencyContactPhone),
          employeeCode: input.data.employeeCode === undefined ? undefined : textOrNull(input.data.employeeCode),
          skills: input.data.skills === undefined ? undefined : input.data.skills.filter((skill) => skill.trim()),
          languages:
            input.data.languages === undefined
              ? undefined
              : input.data.languages.filter((language) => language.trim()),
        },
      });

      await logEmployeeActivity(ctx, {
        userId: input.id,
        actorId: ctx.session.userId,
        type: "updated",
        description: "Employee overview was updated",
      });

      return updated;
    }),

  updatePayroll: adminProcedure
    .input(z.object({ id: z.number(), data: payrollInput }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.user.findUnique({ where: { id: input.id } });
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const updated = await ctx.prisma.user.update({
        where: { id: input.id },
        data: {
          hourlyRate: input.data.hourlyRate,
          specialJobAdjustment: input.data.specialJobAdjustment,
          overtimeMultiplier: input.data.overtimeMultiplier,
          overtimeRate: input.data.overtimeRate,
          travelPayEnabled: input.data.travelPayEnabled,
          defaultTravelHours: input.data.defaultTravelHours,
          travelRateType: input.data.travelRateType,
          customTravelRate: input.data.customTravelRate,
          payrollNotes: textOrNull(input.data.payrollNotes),
        },
      });

      await logEmployeeActivity(ctx, {
        userId: input.id,
        actorId: ctx.session.userId,
        type: "payroll_updated",
        description: "Payroll settings were updated",
        metadata: {
          before: {
            hourlyRate: before.hourlyRate,
            specialJobAdjustment: before.specialJobAdjustment,
            overtimeMultiplier: before.overtimeMultiplier,
            overtimeRate: before.overtimeRate,
            travelPayEnabled: before.travelPayEnabled,
            defaultTravelHours: before.defaultTravelHours,
            travelRateType: before.travelRateType,
            customTravelRate: before.customTravelRate,
          },
          after: {
            hourlyRate: input.data.hourlyRate,
            specialJobAdjustment: input.data.specialJobAdjustment,
            overtimeMultiplier: input.data.overtimeMultiplier,
            overtimeRate: input.data.overtimeRate,
            travelPayEnabled: input.data.travelPayEnabled,
            defaultTravelHours: input.data.defaultTravelHours,
            travelRateType: input.data.travelRateType,
            customTravelRate: input.data.customTravelRate,
          },
        },
      });

      return updated;
    }),

  payrollPreview: adminProcedure
    .input(
      payrollInput.extend({
        regularHours: z.number(),
        specialHours: z.number(),
        travelHours: z.number(),
        overtimeHours: z.number(),
      })
    )
    .query(({ input }) => {
      return calculateEmployeeGrossPay({
        regularHours: input.regularHours,
        specialHours: input.specialHours,
        travelHours: input.travelHours,
        overtimeHours: input.overtimeHours,
        regularRate: input.hourlyRate,
        specialAdjustment: input.specialJobAdjustment,
        overtimeMultiplier: input.overtimeMultiplier,
        overtimeRate: input.overtimeRate,
        travelRateType: input.travelRateType,
        customTravelRate: input.customTravelRate,
      });
    }),

  addCertification: adminProcedure.input(certificationInput).mutation(async ({ ctx, input }) => {
    const certification = await ctx.prisma.employeeCertification.create({
      data: {
        userId: input.userId,
        name: input.name,
        issuingAuthority: textOrNull(input.issuingAuthority),
        issueDate: input.issueDate || null,
        expirationDate: input.expirationDate || null,
        reminderDays: input.reminderDays,
        status: input.status,
        notes: textOrNull(input.notes),
      },
    });

    await logEmployeeActivity(ctx, {
      userId: input.userId,
      actorId: ctx.session.userId,
      type: "certification_added",
      description: `Added certification: ${input.name}`,
    });

    return certification;
  }),

  updateCertification: adminProcedure
    .input(z.object({ id: z.number(), data: certificationInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.employeeCertification.update({
        where: { id: input.id },
        data: {
          ...input.data,
          issuingAuthority:
            input.data.issuingAuthority === undefined ? undefined : textOrNull(input.data.issuingAuthority),
          notes: input.data.notes === undefined ? undefined : textOrNull(input.data.notes),
        },
      });

      await logEmployeeActivity(ctx, {
        userId: updated.userId,
        actorId: ctx.session.userId,
        type: "certification_updated",
        description: `Updated certification: ${updated.name}`,
      });

      return updated;
    }),

  removeCertification: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.employeeCertification.findUnique({ where: { id: input.id } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Certification not found" });

    await ctx.prisma.employeeCertification.delete({ where: { id: input.id } });
    await logEmployeeActivity(ctx, {
      userId: existing.userId,
      actorId: ctx.session.userId,
      type: "certification_removed",
      description: `Removed certification: ${existing.name}`,
    });

    return { ok: true };
  }),

  addDocument: adminProcedure.input(documentInput).mutation(async ({ ctx, input }) => {
    const document = await ctx.prisma.employeeDocument.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        fileName: input.fileName,
        fileUrl: textOrNull(input.fileUrl),
        mimeType: textOrNull(input.mimeType),
        notes: textOrNull(input.notes),
      },
    });

    await logEmployeeActivity(ctx, {
      userId: input.userId,
      actorId: ctx.session.userId,
      type: "document_uploaded",
      description: `Uploaded document: ${input.title}`,
    });

    return document;
  }),

  removeDocument: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.employeeDocument.findUnique({ where: { id: input.id } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });

    await ctx.prisma.employeeDocument.delete({ where: { id: input.id } });
    await logEmployeeActivity(ctx, {
      userId: existing.userId,
      actorId: ctx.session.userId,
      type: "document_removed",
      description: `Removed document: ${existing.title}`,
    });

    return { ok: true };
  }),

  addNote: adminProcedure.input(noteInput).mutation(async ({ ctx, input }) => {
    const note = await ctx.prisma.employeeNote.create({
      data: {
        userId: input.userId,
        authorId: ctx.session.userId,
        note: input.note,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    await logEmployeeActivity(ctx, {
      userId: input.userId,
      actorId: ctx.session.userId,
      type: "note_added",
      description: "Added a private manager note",
    });

    return note;
  }),

  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.update({ where: { id: input.id }, data: { isActive: false } });
    await logEmployeeActivity(ctx, {
      userId: input.id,
      actorId: ctx.session.userId,
      type: "archived",
      description: "Employee archived",
    });
    return user;
  }),

  restore: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.update({ where: { id: input.id }, data: { isActive: true } });
    await logEmployeeActivity(ctx, {
      userId: input.id,
      actorId: ctx.session.userId,
      type: "restored",
      description: "Employee restored",
    });
    return user;
  }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const [assignments, entries, expenses, approvals, invoices] = await Promise.all([
      ctx.prisma.employeeJobAssignment.count({ where: { userId: input.id } }),
      ctx.prisma.timeEntry.count({ where: { userId: input.id } }),
      ctx.prisma.expense.count({ where: { submittedById: input.id } }),
      ctx.prisma.timeEntry.count({ where: { approvedById: input.id } }),
      ctx.prisma.invoice.count({ where: { createdById: input.id } }),
    ]);

    if (assignments > 0 || entries > 0 || expenses > 0 || approvals > 0 || invoices > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This employee has linked records. Archive instead of delete to preserve history.",
      });
    }

    await ctx.prisma.user.delete({ where: { id: input.id } });
    return { ok: true };
  }),

  bulkArchive: adminProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.user.updateMany({ where: { id: { in: input.ids } }, data: { isActive: false } });
    await Promise.all(
      input.ids.map((id) =>
        logEmployeeActivity(ctx, {
          userId: id,
          actorId: ctx.session.userId,
          type: "archived",
          description: "Employee archived via bulk action",
        })
      )
    );
    return { ok: true, count: input.ids.length };
  }),

  bulkRestore: adminProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.user.updateMany({ where: { id: { in: input.ids } }, data: { isActive: true } });
    await Promise.all(
      input.ids.map((id) =>
        logEmployeeActivity(ctx, {
          userId: id,
          actorId: ctx.session.userId,
          type: "restored",
          description: "Employee restored via bulk action",
        })
      )
    );
    return { ok: true, count: input.ids.length };
  }),

  bulkDelete: adminProcedure.input(z.object({ ids: z.array(z.number()).min(1) })).mutation(async ({ ctx, input }) => {
    const blocked = await ctx.prisma.user.findMany({
      where: {
        id: { in: input.ids },
        OR: [
          { timeEntries: { some: {} } },
          { jobAssignments: { some: {} } },
          { expenses: { some: {} } },
          { invoicesCreated: { some: {} } },
        ],
      },
      select: { id: true, name: true },
    });

    if (blocked.length) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Cannot delete ${blocked.length} selected employee(s) because they have linked records.`,
      });
    }

    const deleted = await ctx.prisma.user.deleteMany({ where: { id: { in: input.ids } } });
    return { ok: true, count: deleted.count };
  }),

  bulkAssignJob: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await Promise.all(
        input.ids.map(async (userId) => {
          await ctx.prisma.employeeJobAssignment.upsert({
            where: { userId_jobId: { userId, jobId: input.jobId } },
            update: {},
            create: { userId, jobId: input.jobId },
          });
          await logEmployeeActivity(ctx, {
            userId,
            actorId: ctx.session.userId,
            type: "job_assigned",
            description: `Assigned to job #${input.jobId} via bulk action`,
          });
        })
      );

      return { ok: true, count: input.ids.length };
    }),
});

function groupByWeekHours(entries: Array<{ clockIn: Date; hours: number }>) {
  const grouped = new Map<string, number>();
  for (const entry of entries) {
    const d = new Date(entry.clockIn);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    start.setHours(0, 0, 0, 0);
    const key = start.toISOString().slice(0, 10);
    grouped.set(key, (grouped.get(key) || 0) + entry.hours);
  }
  return Array.from(grouped.values());
}
