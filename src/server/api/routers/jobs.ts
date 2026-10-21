import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { computeEstimate, nextNumber } from "@/lib/utils";
import { calculateJobTracking } from "@/lib/job-tracking";
import { buildJobsListWhere, employeeAssignmentFilter, JOB_STATUS_VALUES, type JobStatusValue } from "@/lib/job-filters";
import { applyOpportunityTransition, resolveJobStatusStage } from "@/lib/pipeline-sync";
import { linkJobOpportunity, validateOpportunityCustomer } from "@/lib/opportunity-links";
import { synchronizeJobCompletion } from "@/lib/job-completion";
import { businessDateSchema } from "@/lib/job-lifecycle";
import { Prisma } from "@prisma/client";

const JobStatusZ = z.enum([
  "estimate", "sent", "approved", "active", "completed", "on_hold", "cancelled",
]);
const JobTypeZ = z.enum(["interior", "exterior", "both", "commercial", "other"]);
const JobTravelRateTypeZ = z.enum(["regular", "island", "special", "custom"]);
const JobVisibilityZ = z.enum(["active", "archived", "all"]);

const jobInput = z.object({
  customerId: z.number(),
  name: z.string().min(1),
  jobType: JobTypeZ.default("interior"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  scopeOfWork: z.string().optional(),
  notes: z.string().optional(),
  specialPayEnabled: z.boolean().default(false),
  hourlyRateAdjustment: z.number().min(0).default(0),
  travelPayEnabled: z.boolean().default(false),
  defaultTravelHours: z.number().min(0).default(0),
  travelRateType: JobTravelRateTypeZ.default("regular"),
  customTravelRate: z.number().min(0).optional(),
  materialsBudget: z.number().min(0).default(0),
  laborBudget: z.number().min(0).default(0),
  subcontractorBudget: z.number().min(0).optional(),
  wcPercent: z.number().min(0).default(0),
  glPercent: z.number().min(0).default(0),
  overheadPercent: z.number().min(0).default(0),
  markupPercent: z.number().min(0).default(0),
  taxPercent: z.number().min(0).default(0),
});

const jobUpdateInput = jobInput.partial().extend({
  contractAmount: z.number().min(0).optional(),
  totalEstimate: z.number().min(0).optional(),
  leadReceivedAt: z.coerce.date().nullable().optional(),
  proposalSentAt: z.coerce.date().nullable().optional(),
  workStartedAt: z.coerce.date().nullable().optional(),
});

const paintColorInput = z.object({
  jobId: z.number(),
  area: z.string().min(1),
  colorName: z.string().min(1),
  brand: z.string().optional(),
  finish: z.string().optional(),
  notes: z.string().optional(),
});

export const jobsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: JobStatusZ.optional(), visibility: JobVisibilityZ.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = buildJobsListWhere(input, {
        isEmployee: ctx.session?.role === "employee",
        employeeUserId: ctx.session?.userId,
      });
      return ctx.prisma.job.findMany({
        where,
        include: { customer: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    }),

  // Exact counts per status chip on the Jobs page; uses count/groupBy instead
  // of loading every job so counts stay cheap regardless of table size.
  statusCounts: protectedProcedure.query(async ({ ctx }) => {
    const accessCtx = { isEmployee: ctx.session?.role === "employee", employeeUserId: ctx.session?.userId };
    const restriction = employeeAssignmentFilter(accessCtx);

    const [all, archived, statusGroups] = await Promise.all([
      ctx.prisma.job.count({ where: { ...restriction, deletedAt: null } }),
      ctx.prisma.job.count({ where: { ...restriction, deletedAt: { not: null } } }),
      ctx.prisma.job.groupBy({
        by: ["status"],
        where: { ...restriction, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries(JOB_STATUS_VALUES.map((status) => [status, 0])) as Record<JobStatusValue, number>;
    for (const group of statusGroups) counts[group.status as JobStatusValue] = group._count._all;

    return { all, archived, ...counts };
  }),

  clockable: protectedProcedure.query(async ({ ctx }) => {
    // Exactly the Jobs → Active tab definition (status active, not archived),
    // intentionally WITHOUT the employee-assignment restriction: every active
    // employee sees every active job. The two screens can never disagree.
    const where = buildJobsListWhere(
      { status: "active", visibility: "active" },
      { isEmployee: false }
    );
    return ctx.prisma.job.findMany({
      where: where as never,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        specialPayEnabled: true,
        hourlyRateAdjustment: true,
          travelPayEnabled: true,
          defaultTravelHours: true,
          travelRateType: true,
          customTravelRate: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        scopeOfWork: true,
        notes: true,
        customer: { select: { name: true } },
      },
      take: 200,
    });
  }),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const job = await ctx.prisma.job.findUnique({
      where: { id: input.id },
      include: {
        customer: true,
        materials: true,
        labor: true,
        paintColors: { orderBy: { createdAt: "asc" } },
        assignments: { include: { user: true } },
        invoices: {
          include: {
            lineItems: { orderBy: { sortOrder: "asc" } },
            payments: { orderBy: { dateReceived: "desc" } },
          },
          orderBy: { createdAt: "desc" },
        },
        payments: { include: { invoice: { select: { invoiceNumber: true } } }, orderBy: { dateReceived: "desc" } },
        expenses: {
          include: {
            attachments: {
              orderBy: { uploadedAt: "desc" },
              select: { id: true, originalFilename: true, mimeType: true },
            },
          },
          orderBy: { expenseDate: "desc" },
        },
        timeEntries: { include: { user: true }, orderBy: { clockIn: "desc" } },
      },
    });
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (
      ctx.session?.role === "employee" &&
      !job.assignments.some((a) => a.userId === ctx.session!.userId)
    ) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const trackingSummary = calculateJobTracking(job.timeEntries, job.id);
    return {
      ...job,
      trackingSummary,
    };
  }),

  create: adminProcedure.input(jobInput).mutation(async ({ ctx, input }) => {
    const last = await ctx.prisma.job.findFirst({
      orderBy: { id: "desc" },
      select: { estimateNumber: true },
    });
    const estimateNumber = nextNumber("EST", last?.estimateNumber);
    const calc = computeEstimate({
      materials: input.materialsBudget,
      labor: input.laborBudget,
      wc: input.wcPercent,
      gl: input.glPercent,
      overhead: input.overheadPercent,
      markup: input.markupPercent,
      tax: input.taxPercent,
    });
    const effectiveSpecialPayEnabled = Boolean(input.specialPayEnabled);
    const effectiveHourlyRateAdjustment = effectiveSpecialPayEnabled
      ? (input.hourlyRateAdjustment > 0 ? input.hourlyRateAdjustment : 2)
      : 0;
    const effectiveTravelRateType = input.travelRateType === "island" ? "special" : input.travelRateType;

    return ctx.prisma.job.create({
      data: {
        ...input,
        isIslandJob: effectiveSpecialPayEnabled,
        specialPayEnabled: effectiveSpecialPayEnabled,
        hourlyRateAdjustment: effectiveHourlyRateAdjustment,
        travelRateType: effectiveTravelRateType,
        estimateNumber,
        subtotalBeforeMarkup: calc.subtotalBeforeMarkup,
        totalEstimate: calc.totalEstimate,
      },
    });
  }),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: jobUpdateInput }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.job.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.opportunityId && input.data.customerId !== undefined) {
        await validateOpportunityCustomer(ctx.prisma, existing.opportunityId, input.data.customerId);
      }

      const merged = { ...existing, ...input.data };
      const calc = computeEstimate({
        materials: Number(merged.materialsBudget),
        labor: Number(merged.laborBudget),
        wc: Number(merged.wcPercent),
        gl: Number(merged.glPercent),
        overhead: Number(merged.overheadPercent),
        markup: Number(merged.markupPercent),
        tax: Number(merged.taxPercent),
      });

      const effectiveSpecialPayEnabled = input.data.specialPayEnabled ?? existing.specialPayEnabled ?? existing.isIslandJob;
      const effectiveHourlyRateAdjustment = effectiveSpecialPayEnabled
        ? (
            input.data.hourlyRateAdjustment ??
            (Number(existing.hourlyRateAdjustment || 0) > 0
              ? Number(existing.hourlyRateAdjustment || 0)
              : (existing.isIslandJob ? 2 : 0))
          )
        : 0;
      const effectiveTravelRateType = (input.data.travelRateType || existing.travelRateType) === "island"
        ? "special"
        : (input.data.travelRateType || existing.travelRateType);

      const normalizedData: any = {
        ...input.data,
        isIslandJob: Boolean(effectiveSpecialPayEnabled),
        specialPayEnabled: Boolean(effectiveSpecialPayEnabled),
        hourlyRateAdjustment: Number(effectiveHourlyRateAdjustment),
        travelRateType: effectiveTravelRateType,
      };

      const shouldRecomputeTotal = !existing.budgetLocked && input.data.totalEstimate === undefined;
      return ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.job.update({
          where: { id: input.id },
          data: shouldRecomputeTotal
            ? { ...normalizedData, subtotalBeforeMarkup: calc.subtotalBeforeMarkup, totalEstimate: calc.totalEstimate }
            : normalizedData,
        });
        if (input.data.workStartedAt != null) {
          await applyOpportunityTransition(tx, existing.opportunityId, "service_delivery", { effectiveAt: input.data.workStartedAt, changedById: ctx.session.userId });
        }
        if (input.data.contractAmount !== undefined || input.data.totalEstimate !== undefined || shouldRecomputeTotal) {
          await synchronizeJobCompletion(tx, input.id, ctx.session.userId);
        }
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }),

  updateLifecycleDates: adminProcedure
    .input(z.object({
      id: z.number(),
      leadReceivedAt: z.coerce.date().nullable().optional(),
      proposalSentAt: z.coerce.date().nullable().optional(),
      workStartedAt: z.coerce.date().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.job.update({
          where: { id: input.id },
          data: {
            leadReceivedAt: input.leadReceivedAt,
            proposalSentAt: input.proposalSentAt,
            workStartedAt: input.workStartedAt,
          },
        });
        if (input.workStartedAt != null) {
          await applyOpportunityTransition(tx, updated.opportunityId, "service_delivery", { effectiveAt: input.workStartedAt, changedById: ctx.session.userId });
        }
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }),

  setStatus: adminProcedure
    .input(z.object({ id: z.number(), status: JobStatusZ, workStartedAt: z.coerce.date().optional(), completedAt: businessDateSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.job.findUnique({
          where: { id: input.id },
          select: { opportunityId: true, workStartedAt: true, totalEstimate: true, completedAt: true },
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        const data: Prisma.JobUpdateInput = { status: input.status };
        if (input.status === "sent") data.sentAt = new Date();
        if (input.status === "approved") {
          data.approvedAt = new Date();
          data.contractAmount = existing.totalEstimate;
          data.budgetLocked = true;
        }
        if (input.status === "active" && !existing.workStartedAt && input.workStartedAt) data.workStartedAt = input.workStartedAt;
        if (input.status === "completed") {
          data.completedAt = input.completedAt ?? existing.completedAt ?? new Date();
          data.completionSource = "manual";
          data.completionPreviousStatus = null;
        } else {
          data.completedAt = null;
          data.completionSource = null;
          data.completionPreviousStatus = null;
        }
        const updated = await tx.job.update({ where: { id: input.id }, data });
        await applyOpportunityTransition(tx, existing.opportunityId, resolveJobStatusStage(input.status), {
          allowBackward: input.status === "on_hold",
          changedById: ctx.session.userId,
          effectiveAt: input.status === "active" ? input.workStartedAt : input.status === "completed" ? updated.completedAt ?? undefined : undefined,
        });
        if (input.status === "approved") await synchronizeJobCompletion(tx, input.id, ctx.session.userId);
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }),

  setCompletionDate: adminProcedure
    .input(z.object({ id: z.number(), completedAt: businessDateSchema }))
    .mutation(({ ctx, input }) => ctx.prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: input.id }, select: { status: true } });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only a completed Job can have its completion date edited." });
      return tx.job.update({
        where: { id: input.id },
        data: { completedAt: input.completedAt, completionSource: "manual", completionPreviousStatus: null },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })),

  assignEmployee: adminProcedure
    .input(z.object({ jobId: z.number(), userId: z.number() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.employeeJobAssignment.upsert({
        where: { userId_jobId: { userId: input.userId, jobId: input.jobId } },
        update: {},
        create: { userId: input.userId, jobId: input.jobId },
      })
    ),

  setOpportunity: adminProcedure
    .input(z.object({ id: z.number(), opportunityId: z.number().int().positive().nullable() }))
    .mutation(({ ctx, input }) => ctx.prisma.$transaction(
      (tx) => linkJobOpportunity(tx, input.id, input.opportunityId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )),

  unassignEmployee: adminProcedure
    .input(z.object({ jobId: z.number(), userId: z.number() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.employeeJobAssignment.deleteMany({
        where: { userId: input.userId, jobId: input.jobId },
      })
    ),

  // Materials
  addMaterial: adminProcedure
    .input(z.object({
      jobId: z.number(),
      name: z.string(),
      quantity: z.number(),
      unit: z.string(),
      unitCost: z.number(),
      inventoryItemId: z.number().optional(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.jobMaterial.create({
        data: {
          jobId: input.jobId,
          name: input.name,
          quantity: input.quantity,
          unit: input.unit,
          unitCost: input.unitCost,
          totalCost: input.quantity * input.unitCost,
          inventoryItemId: input.inventoryItemId,
        },
      })
    ),
  removeMaterial: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => ctx.prisma.jobMaterial.delete({ where: { id: input.id } })),

  // Labor
  addLabor: adminProcedure
    .input(z.object({
      jobId: z.number(),
      role: z.string(),
      hours: z.number(),
      hourlyCost: z.number(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.jobLabor.create({
        data: {
          jobId: input.jobId,
          role: input.role,
          hours: input.hours,
          hourlyCost: input.hourlyCost,
          totalCost: input.hours * input.hourlyCost,
        },
      })
    ),
  removeLabor: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => ctx.prisma.jobLabor.delete({ where: { id: input.id } })),

  // Paint Colors
  addPaintColor: adminProcedure
    .input(paintColorInput)
    .mutation(({ ctx, input }) =>
      ctx.prisma.jobPaintColor.create({
        data: {
          jobId: input.jobId,
          area: input.area,
          colorName: input.colorName,
          brand: input.brand || null,
          finish: input.finish || null,
          notes: input.notes || null,
        },
      })
    ),

  updatePaintColor: adminProcedure
    .input(
      z.object({
        id: z.number(),
        data: paintColorInput.omit({ jobId: true }).partial(),
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.prisma.jobPaintColor.update({
        where: { id: input.id },
        data: {
          ...input.data,
          brand: input.data.brand === undefined ? undefined : input.data.brand || null,
          finish: input.data.finish === undefined ? undefined : input.data.finish || null,
          notes: input.data.notes === undefined ? undefined : input.data.notes || null,
        },
      })
    ),

  deletePaintColor: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => ctx.prisma.jobPaintColor.delete({ where: { id: input.id } })),

  softDelete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.job.update({ where: { id: input.id }, data: { deletedAt: new Date() } })
  ),

  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.job.update({ where: { id: input.id }, data: { deletedAt: new Date() } })
  ),

  restore: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const job = await ctx.prisma.job.findUnique({ where: { id: input.id }, select: { id: true, deletedAt: true } });
    if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });
    return ctx.prisma.job.update({ where: { id: input.id }, data: { deletedAt: null } });
  }),

  /**
   * Permanent deletion, admin-only, for archived zero-history jobs only.
   * Blocked when the job has invoices, payments, expenses, or time entries.
   * Child operational records (materials, labor, paint colors, assignments)
   * cascade via schema onDelete: Cascade. Repeating deletion returns NOT_FOUND.
   */
  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const job = await ctx.prisma.job.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        _count: { select: { invoices: true, payments: true, expenses: true, timeEntries: true } },
      },
    });
    if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });

    const blockers: string[] = [];
    if (job._count.invoices > 0) blockers.push(`${job._count.invoices} invoice(s)`);
    if (job._count.payments > 0) blockers.push(`${job._count.payments} payment(s)`);
    if (job._count.expenses > 0) blockers.push(`${job._count.expenses} expense(s)`);
    if (job._count.timeEntries > 0) blockers.push(`${job._count.timeEntries} time entrie(s)/payroll record(s)`);
    if (blockers.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Cannot permanently delete this job: it has ${blockers.join(", ")}. Accounting and work history is protected.`,
      });
    }

    // Safe zero-history job: materials, labor, paint colors, and assignments
    // cascade with the job row per the schema.
    await ctx.prisma.job.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
