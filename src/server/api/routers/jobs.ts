import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { computeEstimate, nextNumber } from "@/lib/utils";
import { buildJobFinancialSummary } from "@/lib/job-financials/calculate-job-financials";
import type { JobBudgetChangeHistoryItem } from "@/lib/job-financials/types";
import { buildBudgetAuditRows, parseBudgetHistoryItem, type BudgetMap } from "@/lib/job-financials/budget-history";
import { assertCanUpdateJobBudget } from "@/lib/job-financials/budget-update-auth";

const JobStatusZ = z.enum([
  "estimate", "sent", "approved", "active", "completed", "on_hold", "cancelled",
]);
const JobTypeZ = z.enum(["interior", "exterior", "both", "commercial", "other"]);
const JobTravelRateTypeZ = z.enum(["regular", "island", "special", "custom"]);
const JobVisibilityZ = z.enum(["active", "archived", "all"]);

const BudgetDecimalZ = z
  .union([z.number(), z.string()])
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value), "Must be a valid number")
  .refine((value) => value >= 0, "Budget cannot be negative")
  .refine((value) => Math.round(value * 100) === value * 100, "Budget supports up to 2 decimal places");

const budgetUpdateInput = z.object({
  laborBudget: BudgetDecimalZ,
  materialsBudget: BudgetDecimalZ,
  equipmentBudget: BudgetDecimalZ,
  subcontractorBudget: BudgetDecimalZ,
  travelBudget: BudgetDecimalZ,
  otherBudget: BudgetDecimalZ,
});

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
});

const paintColorInput = z.object({
  jobId: z.number(),
  area: z.string().min(1),
  colorName: z.string().min(1),
  brand: z.string().optional(),
  finish: z.string().optional(),
  notes: z.string().optional(),
});

type JobAccessSession = { role: "admin" | "employee"; userId: number };

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

async function getJobSummaryPayload(prisma: any, jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      contractAmount: true,
      totalEstimate: true,
      laborBudget: true,
      materialsBudget: true,
      equipmentBudget: true,
      subcontractorBudget: true,
      travelBudget: true,
      otherBudget: true,
      travelPayEnabled: true,
      defaultTravelHours: true,
      travelRateType: true,
      customTravelRate: true,
      createdAt: true,
    },
  });

  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }

  const [expenses, timeEntries, payments, budgetAuditLogs] = await Promise.all([
    prisma.expense.findMany({
      where: { jobId: job.id },
      select: {
        id: true,
        jobId: true,
        status: true,
        category: true,
        amount: true,
        vendor: true,
        receiptUrl: true,
        invoiceNumber: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { expenseDate: "desc" },
    }),
    prisma.timeEntry.findMany({
      where: { jobId: job.id },
      select: {
        id: true,
        jobId: true,
        userId: true,
        updatedAt: true,
        clockIn: true,
        reviewStatus: true,
        paidHours: true,
        grossHours: true,
        hoursWorked: true,
        travelHours: true,
        rateType: true,
        isIslandJob: true,
        specialPayEnabled: true,
        hourlyRateAdjustment: true,
        user: { select: { hourlyRate: true, name: true } },
      },
      orderBy: { clockIn: "desc" },
    }),
    prisma.payment.findMany({
      where: { jobId: job.id, status: "received" },
      select: {
        id: true,
        amount: true,
        dateReceived: true,
        method: true,
      },
      orderBy: { dateReceived: "desc" },
      take: 200,
    }),
    prisma.auditLog.findMany({
      where: {
        entityType: "job",
        entityId: job.id,
        action: "job_budget_updated",
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        before: true,
        after: true,
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
  ]);

  const budgetChangeHistory: JobBudgetChangeHistoryItem[] = budgetAuditLogs
    .map(parseBudgetHistoryItem)
    .filter((item: JobBudgetChangeHistoryItem | null): item is JobBudgetChangeHistoryItem => item !== null)
    .sort((a: JobBudgetChangeHistoryItem, b: JobBudgetChangeHistoryItem) => b.at.getTime() - a.at.getTime());

  const summary = buildJobFinancialSummary({
    context: {
      jobId: job.id,
      contractAmount: toNumber(job.contractAmount),
      totalEstimate: toNumber(job.totalEstimate),
      laborBudget: toNumber(job.laborBudget),
      materialsBudget: toNumber(job.materialsBudget),
      equipmentBudget: toNumber(job.equipmentBudget),
      subcontractorBudget: toNumber(job.subcontractorBudget),
      travelBudget: toNumber(job.travelBudget),
      otherBudget: toNumber(job.otherBudget),
      travelPayEnabled: Boolean(job.travelPayEnabled),
      defaultTravelHours: toNumber(job.defaultTravelHours),
      travelRateType: job.travelRateType,
      customTravelRate: toNumber(job.customTravelRate),
    },
    expenses: expenses.map((expense: any) => ({
      id: expense.id,
      jobId: expense.jobId,
      status: expense.status,
      category: expense.category,
      amount: toNumber(expense.amount),
      vendor: expense.vendor,
      receiptUrl: expense.receiptUrl,
      invoiceNumber: expense.invoiceNumber,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    })),
    timeEntries: timeEntries.map((entry: any) => ({
      id: entry.id,
      jobId: entry.jobId,
      userId: entry.userId,
      userName: entry.user?.name,
      clockIn: entry.clockIn,
      updatedAt: entry.updatedAt,
      reviewStatus: entry.reviewStatus,
      paidHours: entry.paidHours == null ? null : toNumber(entry.paidHours),
      grossHours: entry.grossHours == null ? null : toNumber(entry.grossHours),
      hoursWorked: entry.hoursWorked == null ? null : toNumber(entry.hoursWorked),
      travelHours: entry.travelHours == null ? null : toNumber(entry.travelHours),
      rateType: entry.rateType,
      isIslandJob: Boolean(entry.isIslandJob),
      specialPayEnabled: Boolean(entry.specialPayEnabled),
      hourlyRateAdjustment: toNumber(entry.hourlyRateAdjustment),
      userHourlyRate: toNumber(entry.user?.hourlyRate),
    })),
    budgetCreatedAt: job.createdAt,
    budgetChangeHistory,
    paymentEvents: payments.map((payment: any) => ({
      id: payment.id,
      at: payment.dateReceived,
      amount: toNumber(payment.amount),
      method: payment.method,
    })),
  });

  return {
    jobId: job.id,
    budgets: {
      laborBudget: toNumber(job.laborBudget),
      materialsBudget: toNumber(job.materialsBudget),
      equipmentBudget: toNumber(job.equipmentBudget),
      subcontractorBudget: toNumber(job.subcontractorBudget),
      travelBudget: toNumber(job.travelBudget),
      otherBudget: toNumber(job.otherBudget),
    },
    summary,
  };
}

async function assertJobAccess(prisma: any, session: JobAccessSession, jobId: number) {
  if (session.role === "admin") {
    const exists = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!exists) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
    return;
  }

  const assigned = await prisma.employeeJobAssignment.findFirst({
    where: { jobId, userId: session.userId },
    select: { id: true },
  });
  if (!assigned) throw new TRPCError({ code: "FORBIDDEN" });
}

export const jobsRouter = router({
  budget: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertJobAccess(ctx.prisma, { role: ctx.session!.role, userId: ctx.session!.userId }, input.id);
      return getJobSummaryPayload(ctx.prisma, input.id);
    }),

  updateBudget: adminProcedure
    .input(z.object({ id: z.number().int().positive(), data: budgetUpdateInput }))
    .mutation(async ({ ctx, input }) => {
      assertCanUpdateJobBudget(ctx.session);
      await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.job.findUnique({
          where: { id: input.id },
          select: {
            id: true,
            laborBudget: true,
            materialsBudget: true,
            equipmentBudget: true,
            subcontractorBudget: true,
            travelBudget: true,
            otherBudget: true,
          },
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

        const previousBudgets: BudgetMap = {
          laborBudget: toNumber(existing.laborBudget),
          materialsBudget: toNumber(existing.materialsBudget),
          equipmentBudget: toNumber(existing.equipmentBudget),
          subcontractorBudget: toNumber(existing.subcontractorBudget),
          travelBudget: toNumber(existing.travelBudget),
          otherBudget: toNumber(existing.otherBudget),
        };

        const nextBudgets: BudgetMap = {
          laborBudget: input.data.laborBudget,
          materialsBudget: input.data.materialsBudget,
          equipmentBudget: input.data.equipmentBudget,
          subcontractorBudget: input.data.subcontractorBudget,
          travelBudget: input.data.travelBudget,
          otherBudget: input.data.otherBudget,
        };

        await tx.job.update({
          where: { id: input.id },
          data: {
            laborBudget: new Prisma.Decimal(input.data.laborBudget),
            materialsBudget: new Prisma.Decimal(input.data.materialsBudget),
            equipmentBudget: new Prisma.Decimal(input.data.equipmentBudget),
            subcontractorBudget: new Prisma.Decimal(input.data.subcontractorBudget),
            travelBudget: new Prisma.Decimal(input.data.travelBudget),
            otherBudget: new Prisma.Decimal(input.data.otherBudget),
          },
        });

        const changeSetId = `job-${input.id}-budget-${Date.now()}`;
        const auditRows = buildBudgetAuditRows({
          userId: ctx.session!.userId,
          jobId: input.id,
          previousBudgets,
          nextBudgets,
          changeSetId,
        });

        if (auditRows.length > 0) {
          await tx.auditLog.createMany({ data: auditRows });
        }
      });

      return getJobSummaryPayload(ctx.prisma, input.id);
    }),

  financialSummary: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertJobAccess(ctx.prisma, { role: ctx.session!.role, userId: ctx.session!.userId }, input.id);
      const payload = await getJobSummaryPayload(ctx.prisma, input.id);
      return payload.summary;
    }),

  list: protectedProcedure
    .input(z.object({ status: JobStatusZ.optional(), visibility: JobVisibilityZ.optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Employees only see assigned jobs
      const where: any = {};
      if (input?.status) where.status = input.status;
      const visibility = input?.visibility ?? "active";
      if (visibility === "active") where.deletedAt = null;
      if (visibility === "archived") where.deletedAt = { not: null };
      if (ctx.session?.role === "employee") {
        where.assignments = { some: { userId: ctx.session.userId } };
      }
      return ctx.prisma.job.findMany({
        where,
        include: { customer: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    }),

  clockable: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.job.findMany({
      where: {
        deletedAt: null,
        status: { in: ["estimate", "sent", "approved", "active"] },
      },
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
        invoices: true,
        payments: true,
        expenses: true,
        timeEntries: { include: { user: true }, orderBy: { clockIn: "desc" }, take: 50 },
      },
    });
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (
      ctx.session?.role === "employee" &&
      !job.assignments.some((a) => a.userId === ctx.session!.userId)
    ) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return job;
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
      return ctx.prisma.job.update({
        where: { id: input.id },
        data: shouldRecomputeTotal
          ? { ...normalizedData, subtotalBeforeMarkup: calc.subtotalBeforeMarkup, totalEstimate: calc.totalEstimate }
          : normalizedData,
      });
    }),

  setStatus: adminProcedure
    .input(z.object({ id: z.number(), status: JobStatusZ }))
    .mutation(async ({ ctx, input }) => {
      const data: any = { status: input.status };
      if (input.status === "sent") data.sentAt = new Date();
      if (input.status === "approved") {
        const j = await ctx.prisma.job.findUnique({ where: { id: input.id } });
        if (j) {
          data.approvedAt = new Date();
          data.contractAmount = j.totalEstimate;
          data.budgetLocked = true;
        }
      }
      return ctx.prisma.job.update({ where: { id: input.id }, data });
    }),

  assignEmployee: adminProcedure
    .input(z.object({ jobId: z.number(), userId: z.number() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.employeeJobAssignment.upsert({
        where: { userId_jobId: { userId: input.userId, jobId: input.jobId } },
        update: {},
        create: { userId: input.userId, jobId: input.jobId },
      })
    ),

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
});
