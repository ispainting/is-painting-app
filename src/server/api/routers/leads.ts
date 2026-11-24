import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { router, adminProcedure } from "../trpc";
import { funnelMove, leadRates, periodStart, startOfBusinessDay, startOfBusinessWeek, type LeadPeriod } from "@/lib/leads/status";

const SourceZ = z.enum(["META", "GOOGLE_ADS", "WEBSITE", "MANUAL"]);
const StatusZ = z.enum(["NEW", "CONTACTED", "REAL", "NOT_REAL", "NO_ANSWER", "WON", "LOST"]);
const PeriodZ = z.enum(["today", "7d", "30d", "90d", "all"]);

function since(period: LeadPeriod): Prisma.LeadWhereInput {
  const start = periodStart(period, new Date());
  return start ? { createdAt: { gte: start } } : {};
}

// Customers' phones and emails live here, so everything is admin-only, like the (admin) pages.
export const leadsRouter = router({
  list: adminProcedure
    .input(
      z.object({
        source: SourceZ.optional(),
        status: StatusZ.optional(),
        period: PeriodZ.default("30d"),
        search: z.string().trim().max(100).optional(),
        limit: z.number().int().min(1).max(500).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const digits = input.search?.replace(/\D/g, "") ?? "";
      const where: Prisma.LeadWhereInput = {
        ...(input.source ? { source: input.source } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...since(input.period),
        ...(input.search
          ? {
              OR: [
                { fullName: { contains: input.search, mode: "insensitive" } },
                ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : {}),
      };
      const rows = await ctx.prisma.lead.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        // Not rawPayload: the screen doesn't use it.
        select: {
          id: true,
          createdAt: true,
          source: true,
          fullName: true,
          phone: true,
          serviceType: true,
          outOfMap: true,
          campaignId: true,
          campaignName: true,
          adId: true,
          adName: true,
          utmCampaign: true,
          status: true,
          jobValue: true,
          notes: true,
          repeatCount: true,
          lastRepeatAt: true,
          opportunity: { select: { customerId: true } },
        },
      });
      return {
        hasMore: rows.length > input.limit,
        leads: rows.slice(0, input.limit).map((lead) => ({ ...lead, jobValue: lead.jobValue === null ? null : Number(lead.jobValue) })),
      };
    }),

  // Today and this week are fixed; the rates follow the period chosen on the screen. Leads outside
  // the service map aren't leads (CLAUDE.md §5.5), so none of these count them.
  stats: adminProcedure
    .input(z.object({ source: SourceZ.optional(), period: PeriodZ.default("30d") }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const base: Prisma.LeadWhereInput = { outOfMap: false, ...(input.source ? { source: input.source } : {}) };
      const [today, week, byStatus] = await Promise.all([
        ctx.prisma.lead.count({ where: { ...base, createdAt: { gte: startOfBusinessDay(now) } } }),
        ctx.prisma.lead.count({ where: { ...base, createdAt: { gte: startOfBusinessWeek(now) } } }),
        ctx.prisma.lead.groupBy({ by: ["status"], where: { ...base, ...since(input.period) }, _count: { _all: true } }),
      ]);
      return { today, week, ...leadRates(Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]))) };
    }),

  setStatus: adminProcedure
    .input(
      z
        .object({ id: z.number().int(), status: StatusZ, jobValue: z.number().positive().max(9_999_999_999).optional() })
        .refine((v) => v.status !== "WON" || v.jobValue !== undefined, { message: "A won lead needs the job's value", path: ["jobValue"] })
    )
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.id },
        select: { status: true, jobValue: true, opportunity: { select: { id: true, stage: true } } },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      const jobValue = input.status === "WON" ? input.jobValue : null;
      const move = lead.opportunity ? funnelMove(input.status, lead.opportunity.stage, lead.status) : null;
      await ctx.prisma.$transaction(async (tx) => {
        await tx.lead.update({ where: { id: input.id }, data: { status: input.status, jobValue } });
        // The card follows the lead, which keeps the platform's ad-to-contract numbers right. Only
        // the value this screen wrote is cleared: the card's own value is someone else's to change.
        if (lead.opportunity && (move || input.status === "WON" || lead.status === "WON")) {
          await tx.opportunity.update({
            where: { id: lead.opportunity.id },
            data: {
              ...(move ? { ...move, lastStageChangedAt: new Date() } : {}),
              ...(input.status === "WON" ? { leadValue: input.jobValue } : lead.status === "WON" ? { leadValue: null } : {}),
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: ctx.session.userId,
            action: "lead.status",
            entityType: "lead",
            entityId: input.id,
            before: { status: lead.status, jobValue: lead.jobValue === null ? null : Number(lead.jobValue) },
            after: { status: input.status, jobValue: jobValue ?? null },
          },
        });
      });
      return { id: input.id, status: input.status };
    }),
});
