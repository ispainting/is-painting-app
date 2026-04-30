import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { computeEstimate, nextNumber } from "@/lib/utils";

const JobStatusZ = z.enum([
  "estimate", "sent", "approved", "active", "completed", "on_hold", "cancelled",
]);
const JobTypeZ = z.enum(["interior", "exterior", "both", "commercial", "other"]);

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
  materialsBudget: z.number().min(0).default(0),
  laborBudget: z.number().min(0).default(0),
  wcPercent: z.number().min(0).default(0),
  glPercent: z.number().min(0).default(0),
  overheadPercent: z.number().min(0).default(0),
  markupPercent: z.number().min(0).default(0),
  taxPercent: z.number().min(0).default(0),
});

export const jobsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: JobStatusZ.optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Employees only see assigned jobs
      const where: any = { deletedAt: null };
      if (input?.status) where.status = input.status;
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

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const job = await ctx.prisma.job.findUnique({
      where: { id: input.id },
      include: {
        customer: true,
        materials: true,
        labor: true,
        assignments: { include: { user: true } },
        invoices: true,
        payments: true,
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
    return ctx.prisma.job.create({
      data: {
        ...input,
        estimateNumber,
        subtotalBeforeMarkup: calc.subtotalBeforeMarkup,
        totalEstimate: calc.totalEstimate,
      },
    });
  }),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: jobInput.partial() }))
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
      return ctx.prisma.job.update({
        where: { id: input.id },
        data: existing.budgetLocked
          ? input.data
          : { ...input.data, subtotalBeforeMarkup: calc.subtotalBeforeMarkup, totalEstimate: calc.totalEstimate },
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

  softDelete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.job.update({ where: { id: input.id }, data: { deletedAt: new Date() } })
  ),
});
