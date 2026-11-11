import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../trpc";

const basis = z.enum(["SQFT_PER_HOUR", "LINEAR_FT_PER_HOUR", "HOURS_PER_ITEM", "FIXED_HOURS"]);
const category = z.enum(["INTERIOR", "EXTERIOR", "PREP", "SPECIALTY"]);

const rateInput = z.object({
  name: z.string().min(1),
  category,
  surfaceType: z.string().min(1),
  basis,
  rateValue: z.number().positive(),
  coats: z.number().int().min(1).nullable().optional(),
  prepLevel: z.string().trim().nullable().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  notes: z.string().optional(),
});

function normalized(value: number | string | null | undefined) {
  return value == null || String(value).trim() === "" ? "__NULL__" : String(value).trim().toLowerCase();
}

function profileKey(input: { category: string; surfaceType: string; basis: string; coats?: number | null; prepLevel?: string | null }) {
  return [input.category, input.surfaceType, input.basis, normalized(input.coats), normalized(input.prepLevel)].join("|").toLowerCase();
}

async function assertNoRateConflict(ctx: { prisma: any }, input: z.infer<typeof rateInput>, id?: number) {
  if (!input.isActive && input.isDefault) {
    throw new Error("Inactive production rates cannot be defaults.");
  }

  const rates = await ctx.prisma.productionRate.findMany({
    where: {
      isActive: true,
      ...(id ? { id: { not: id } } : {}),
      category: input.category,
      surfaceType: input.surfaceType,
      basis: input.basis,
      coats: input.coats ?? null,
      prepLevel: input.prepLevel?.trim() || null,
    },
    select: { id: true, isDefault: true },
  });

  if (rates.length > 0) {
    throw new Error(`An active ProductionRate already exists for profile ${profileKey(input)}.`);
  }
}

export const productionRatesRouter = router({
  list: protectedProcedure
    .input(z.object({ category: category.optional(), surfaceType: z.string().optional(), basis: basis.optional(), coats: z.number().int().positive().optional(), prepLevel: z.string().optional() }).optional())
    .query(({ ctx, input }) => ctx.prisma.productionRate.findMany({
      where: {
        isActive: true,
        ...(input?.category ? { category: input.category } : {}),
        ...(input?.surfaceType ? { surfaceType: input.surfaceType } : {}),
        ...(input?.basis ? { basis: input.basis } : {}),
        ...(input?.coats ? { coats: input.coats } : {}),
        ...(input?.prepLevel ? { prepLevel: input.prepLevel } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    })),

  create: adminProcedure.input(rateInput).mutation(async ({ ctx, input }) => {
    await assertNoRateConflict(ctx, input);
    return ctx.prisma.productionRate.create({ data: { ...input, prepLevel: input.prepLevel?.trim() || null } });
  }),

  update: adminProcedure.input(z.object({ id: z.number(), data: rateInput.partial() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.productionRate.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("Production rate not found.");
    const next = { ...existing, ...input.data };
    const normalizedInput = { ...next, prepLevel: next.prepLevel?.trim() || null };
    await assertNoRateConflict(ctx, {
      name: normalizedInput.name,
      category: normalizedInput.category,
      surfaceType: normalizedInput.surfaceType,
      basis: normalizedInput.basis,
      rateValue: Number(normalizedInput.rateValue),
      coats: normalizedInput.coats,
      prepLevel: normalizedInput.prepLevel,
      isActive: normalizedInput.isActive,
      isDefault: normalizedInput.isDefault,
      notes: normalizedInput.notes ?? undefined,
    }, input.id);
    return ctx.prisma.productionRate.update({ where: { id: input.id }, data: { ...input.data, prepLevel: normalizedInput.prepLevel, isDefault: normalizedInput.isActive ? normalizedInput.isDefault : false } });
  }),

  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.productionRate.update({ where: { id: input.id }, data: { isActive: false, isDefault: false } })
  ),
});
