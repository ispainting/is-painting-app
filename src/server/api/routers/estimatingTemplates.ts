import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../trpc";

const unitPriceTemplateInput = z.object({
  templateKey: z.string().trim().min(1).max(120).optional(),
  serviceName: z.string().trim().min(1),
  variantName: z.string().trim().min(1),
  unitLabel: z.string().trim().min(1).max(80),
  defaultPricePerUnit: z.number().min(0),
  defaultLaborAllowance: z.number().min(0).nullable().optional(),
  defaultMaterialAllowance: z.number().min(0).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
  effectiveDate: z.coerce.date().optional(),
  rateSource: z.enum(["SEEDED", "MANUAL", "HISTORICAL"]).default("MANUAL"),
});

function slugifyTemplatePart(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "template";
}

async function buildTemplateKey(
  prisma: Pick<PrismaClient, "unitPriceTemplate">,
  input: Pick<z.infer<typeof unitPriceTemplateInput>, "templateKey" | "serviceName" | "variantName" | "unitLabel">
) {
  const explicitKey = input.templateKey?.trim();
  const baseKey = explicitKey && explicitKey.length > 0
    ? explicitKey
    : [
        slugifyTemplatePart(input.serviceName),
        slugifyTemplatePart(input.variantName),
        slugifyTemplatePart(input.unitLabel),
      ].join("-");

  let candidate = baseKey;
  let suffix = 2;

  while (await prisma.unitPriceTemplate.findUnique({ where: { templateKey: candidate }, select: { id: true } })) {
    candidate = `${baseKey}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export const estimatingTemplatesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        activeOnly: z.boolean().default(true).optional(),
        serviceName: z.string().trim().optional(),
      }).optional()
    )
    .query(({ ctx, input }) =>
      ctx.prisma.unitPriceTemplate.findMany({
        where: {
          ...(input?.activeOnly !== false ? { isActive: true } : {}),
          ...(input?.serviceName ? { serviceName: { contains: input.serviceName, mode: "insensitive" } } : {}),
        },
        orderBy: [{ serviceName: "asc" }, { variantName: "asc" }, { effectiveDate: "desc" }],
      })
    ),

  create: adminProcedure.input(unitPriceTemplateInput).mutation(async ({ ctx, input }) => {
    const prisma = ctx.prisma;
    const templateKey = await buildTemplateKey(prisma, input);

    return prisma.unitPriceTemplate.create({
      data: {
        ...input,
        templateKey,
        notes: input.notes ?? null,
        defaultLaborAllowance: input.defaultLaborAllowance ?? null,
        defaultMaterialAllowance: input.defaultMaterialAllowance ?? null,
        effectiveDate: input.effectiveDate ?? new Date(),
      },
    });
  }),

  update: adminProcedure
    .input(z.object({ id: z.number().int().positive(), data: unitPriceTemplateInput.partial() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.unitPriceTemplate.update({
        where: { id: input.id },
        data: {
          ...input.data,
          notes: input.data.notes ?? undefined,
        },
      })
    ),

  archive: adminProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean().default(false) }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.unitPriceTemplate.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      })
    ),
});
