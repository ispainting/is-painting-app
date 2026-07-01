import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, adminProcedure } from "../trpc";

const ProposalCategoryZ = z.enum([
  "interior_painting",
  "exterior_painting",
  "deck_restoration",
  "pergola_restoration",
  "trim_restoration",
  "cabinet_refinishing",
  "wallpaper_removal",
  "drywall_repair",
  "commercial_painting",
  "new_construction",
  "property_maintenance",
  "custom",
]);

const ProposalTypeZ = z.enum(["residential", "commercial", "restoration", "maintenance", "new_construction", "custom"]);

const exampleInput = z.object({
  title: z.string().min(1),
  proposalCategory: ProposalCategoryZ,
  proposalType: ProposalTypeZ.nullable().optional(),
  description: z.string().optional(),
  fullProposalContent: z.string().min(1),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const exampleListInput = z.object({
  search: z.string().optional(),
  proposalCategory: ProposalCategoryZ.optional(),
});

function normalizeTags(tags: string[]) {
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

function parseSearchTerms(search?: string) {
  return (search || "")
    .split(/[,\s]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, 8);
}

function scoreExample(example: {
  title: string;
  description: string | null;
  fullProposalContent: string;
  tags: string[];
  proposalCategory: string;
  proposalType: string | null;
}, search: string, terms: string[], category?: string) {
  const content = `${example.title}\n${example.description || ""}\n${example.fullProposalContent}\n${example.tags.join(" ")}`.toLowerCase();
  let score = 0;

  if (category && example.proposalCategory === category) score += 8;
  if (example.proposalType) score += 1;
  if (search) {
    if (content.includes(search.toLowerCase())) score += 4;
  }

  for (const term of terms) {
    const lower = term.toLowerCase();
    if (content.includes(lower)) score += 2;
    if (example.tags.some((tag) => tag.toLowerCase().includes(lower))) score += 3;
    if (example.title.toLowerCase().includes(lower)) score += 3;
  }

  if (content.includes("scope of work")) score += 1;
  if (content.includes("closing")) score += 1;
  if (content.includes("payment schedule")) score += 1;

  return score;
}

function buildExampleData(input: z.infer<typeof exampleInput>) {
  return {
    title: input.title.trim(),
    proposalCategory: input.proposalCategory,
    proposalType: input.proposalType ?? null,
    description: input.description?.trim() || null,
    fullProposalContent: input.fullProposalContent.trim(),
    tags: normalizeTags(input.tags),
    notes: input.notes?.trim() || null,
  };
}

export const proposalExamplesRouter = router({
  list: adminProcedure.input(exampleListInput.optional()).query(async ({ ctx, input }) => {
    const search = input?.search?.trim() || "";
    const category = input?.proposalCategory;
    const terms = parseSearchTerms(search);

    const examples = await ctx.prisma.proposalExample.findMany({
      where: {
        ...(category ? { proposalCategory: category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { fullProposalContent: { contains: search, mode: "insensitive" } },
                ...(terms.length ? [{ tags: { hasSome: terms } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return examples
      .map((example) => ({
        ...example,
        _score: scoreExample(example, search, terms, category),
      }))
      .sort((a, b) => b._score - a._score || b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(({ _score, ...example }) => example);
  }),

  byId: adminProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const example = await ctx.prisma.proposalExample.findUnique({ where: { id: input.id } });
    if (!example) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposal example not found" });
    }
    return example;
  }),

  create: adminProcedure.input(exampleInput).mutation(async ({ ctx, input }) => {
    return ctx.prisma.proposalExample.create({ data: buildExampleData(input) });
  }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        data: exampleInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.proposalExample.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal example not found" });
      }

      return ctx.prisma.proposalExample.update({
        where: { id: input.id },
        data: buildExampleData(input.data),
      });
    }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.proposalExample.delete({ where: { id: input.id } });
    return { ok: true };
  }),

  duplicate: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const example = await ctx.prisma.proposalExample.findUnique({ where: { id: input.id } });
    if (!example) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposal example not found" });
    }

    const copyIndex = await ctx.prisma.proposalExample.count({ where: { title: { startsWith: `Copy of ${example.title}` } } });

    return ctx.prisma.proposalExample.create({
      data: {
        title: copyIndex > 0 ? `Copy of ${example.title} (${copyIndex + 1})` : `Copy of ${example.title}`,
        proposalCategory: example.proposalCategory,
        proposalType: example.proposalType,
        description: example.description,
        fullProposalContent: example.fullProposalContent,
        tags: example.tags,
        notes: example.notes,
      },
    });
  }),
});
