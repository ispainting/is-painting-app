import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { nextNumber } from "@/lib/utils";

const ProposalStatusZ = z.enum(["draft", "ready", "sent", "viewed", "approved", "declined", "follow_up", "converted"]);
const ProposalTemplateZ = z.enum([
  "interior_painting",
  "exterior_painting",
  "cabinet_refinishing",
  "deck_restoration",
  "pergola_restoration",
  "trim_restoration",
  "wallpaper_removal",
  "drywall_repair",
  "commercial_painting",
  "new_construction",
  "property_maintenance",
]);
const ProposalTypeZ = z.enum(["residential", "commercial", "restoration", "maintenance", "new_construction", "custom"]);
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

const proposalOptionInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  scope: z.string().optional(),
  price: z.number().nullable().optional(),
  isVisible: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const proposalAttachmentInput = z.object({
  category: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const proposalPaintColorInput = z.object({
  area: z.string().min(1),
  colorName: z.string().min(1),
  brand: z.string().optional(),
  product: z.string().optional(),
  colorCode: z.string().optional(),
  finish: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const proposalSectionInput = z.object({
  templateKey: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  bulletItems: z.array(z.string()).default([]),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

const proposalInput = z.object({
  customerId: z.number(),
  projectName: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  status: ProposalStatusZ.default("draft"),
  proposalTemplate: ProposalTemplateZ.nullable().optional(),
  proposalType: ProposalTypeZ.nullable().optional(),
  projectSummary: z.string().optional(),
  scopeOfWork: z.string().optional(),
  includedWork: z.string().optional(),
  exclusions: z.string().optional(),
  importantNotes: z.string().optional(),
  recommendations: z.string().optional(),
  closingText: z.string().optional(),
  proposalBody: z.string().optional(),
  aiAssistantNotes: z.string().optional(),
  notes: z.string().optional(),
  emailBody: z.string().optional(),
  referencesText: z.string().optional(),
  termsAndConditions: z.string().optional(),
  paymentSchedule: z.string().optional(),
  materialsBudget: z.number().min(0).default(0),
  laborBudget: z.number().min(0).default(0),
  subcontractorBudget: z.number().min(0).default(0),
  totalAmount: z.number().min(0).optional(),
  expectedStartDate: z.date().nullable().optional(),
  expectedEndDate: z.date().nullable().optional(),
  sections: z.array(proposalSectionInput).default([]),
  options: z.array(proposalOptionInput).default([]),
  attachments: z.array(proposalAttachmentInput).default([]),
  paintColors: z.array(proposalPaintColorInput).default([]),
});

function sanitizeSections(sections: z.infer<typeof proposalSectionInput>[]) {
  const rows = sections.filter((s) => {
    const title = s.title.trim();
    const description = (s.description || "").trim();
    const notes = (s.notes || "").trim();
    const bullets = s.bulletItems.filter((item) => item.trim().length > 0);
    return title.length > 0 || description.length > 0 || notes.length > 0 || bullets.length > 0;
  });

  return rows.map((s, index) => ({
    templateKey: s.templateKey?.trim() || undefined,
    title: s.title.trim() || `Section ${index + 1}`,
    description: (s.description || "").trim() || undefined,
    bulletItems: s.bulletItems.map((item) => item.trim()).filter(Boolean),
    notes: (s.notes || "").trim() || undefined,
    sortOrder: s.sortOrder ?? index,
  }));
}

function sanitizeOptions(options: z.infer<typeof proposalOptionInput>[]) {
  const rows = options.filter((o) => {
    const title = o.title.trim();
    const description = (o.description || "").trim();
    const scope = (o.scope || "").trim();
    return title.length > 0 || description.length > 0 || scope.length > 0 || o.price != null;
  });

  return rows.map((o, index) => ({
    title: o.title.trim() || `Option ${index + 1}`,
    description: (o.description || "").trim() || undefined,
    scope: (o.scope || "").trim() || undefined,
    price: o.price,
    isVisible: o.isVisible,
    sortOrder: o.sortOrder ?? index,
  }));
}

function sanitizeAttachments(attachments: z.infer<typeof proposalAttachmentInput>[]) {
  const rows = attachments.filter((a) => {
    const category = a.category.trim();
    const fileName = a.fileName.trim();
    const fileUrl = (a.fileUrl || "").trim();
    const notes = (a.notes || "").trim();
    return category.length > 0 || fileName.length > 0 || fileUrl.length > 0 || notes.length > 0;
  });

  return rows.map((a, index) => ({
    category: a.category.trim() || "other",
    fileName: a.fileName.trim() || `Attachment ${index + 1}`,
    fileUrl: (a.fileUrl || "").trim() || undefined,
    notes: (a.notes || "").trim() || undefined,
    sortOrder: a.sortOrder ?? index,
  }));
}

function sanitizePaintColors(colors: z.infer<typeof proposalPaintColorInput>[]) {
  const rows = colors.filter((p) => {
    const area = p.area.trim();
    const colorName = p.colorName.trim();
    const brand = (p.brand || "").trim();
    const finish = (p.finish || "").trim();
    const notes = (p.notes || "").trim();
    return area.length > 0 || colorName.length > 0 || brand.length > 0 || finish.length > 0 || notes.length > 0;
  });

  return rows.map((p, index) => ({
    area: p.area.trim() || "General",
    colorName: p.colorName.trim() || "Unspecified",
    brand: (p.brand || "").trim() || undefined,
    product: (p.product || "").trim() || undefined,
    colorCode: (p.colorCode || "").trim() || undefined,
    finish: (p.finish || "").trim() || undefined,
    notes: (p.notes || "").trim() || undefined,
    sortOrder: p.sortOrder ?? index,
  }));
}

const TEMPLATE_WRITING_GUIDE: Record<z.infer<typeof ProposalTemplateZ>, { summaryNoun: string; scopeLead: string }> = {
  interior_painting: {
    summaryNoun: "interior painting proposal",
    scopeLead: "Interior scope is organized below by area for clarity.",
  },
  exterior_painting: {
    summaryNoun: "exterior painting proposal",
    scopeLead: "Exterior scope is organized below by elevation and work type where applicable.",
  },
  cabinet_refinishing: {
    summaryNoun: "cabinet refinishing proposal",
    scopeLead: "Cabinet refinishing scope is organized below by area and production step.",
  },
  deck_restoration: {
    summaryNoun: "deck restoration proposal",
    scopeLead: "Deck restoration scope is organized below by surface and restoration step.",
  },
  pergola_restoration: {
    summaryNoun: "pergola restoration proposal",
    scopeLead: "Pergola restoration scope is organized below by component and restoration step.",
  },
  trim_restoration: {
    summaryNoun: "trim restoration proposal",
    scopeLead: "Trim restoration scope is organized below by area and finish step.",
  },
  wallpaper_removal: {
    summaryNoun: "wallpaper removal proposal",
    scopeLead: "Wallpaper removal scope is organized below by area and preparation stage.",
  },
  drywall_repair: {
    summaryNoun: "drywall repair proposal",
    scopeLead: "Drywall repair scope is organized below by area and repair step.",
  },
  commercial_painting: {
    summaryNoun: "commercial painting proposal",
    scopeLead: "Commercial scope is organized below to support clear planning and execution.",
  },
  new_construction: {
    summaryNoun: "new construction painting proposal",
    scopeLead: "New construction scope is organized below by production sequence.",
  },
  property_maintenance: {
    summaryNoun: "property maintenance painting proposal",
    scopeLead: "Maintenance scope is organized below by area and recurring service need.",
  },
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueSentences(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const cleaned = normalizeText(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function splitDraftNotes(notes: string) {
  return notes
    .split(/\n+/)
    .flatMap((line) => line.split(/[;|]/))
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function parsePaymentSchedule(line: string) {
  const match = line.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (!match) return null;
  return `${match[1]}/${match[2]}/${match[3]}`;
}

function parseSqft(line: string) {
  const match = line.match(/\b(\d{3,6})\s*(sq\.?\s?ft|sqft|square\s+feet)\b/i);
  if (!match) return null;
  return Number(match[1]);
}

function parseStandaloneAmount(line: string) {
  if (/sq\.?\s?ft|sqft|square\s+feet/i.test(line)) return null;
  if (parsePaymentSchedule(line)) return null;
  const numeric = line.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(numeric)) return null;
  const amount = Number(numeric);
  return amount >= 1000 ? amount : null;
}

function hasToken(line: string, pattern: RegExp) {
  return pattern.test(line);
}

function extractProductName(line: string) {
  const lower = line.toLowerCase();
  if (/\bbm\s*regal\b|\bregal\b/.test(lower)) return "Benjamin Moore Regal";
  if (/\bbm\s*ceiling\b|\bceiling paint\b|\bbm\s*ceiling paint\b/.test(lower)) return "Benjamin Moore Ceiling Paint";
  if (/\badvance\b/.test(lower)) return "Benjamin Moore Advance";
  if (/\baura\s*bath\b/.test(lower)) return "Benjamin Moore Aura Bath & Spa";
  if (/\bscuff\s*-?\s*x\b/.test(lower)) return "Benjamin Moore Scuff-X";
  if (/\bbin\b/.test(lower)) return "Zinsser BIN primer";
  if (/\bfresh\s*start\b/.test(lower)) return "Benjamin Moore Fresh Start primer";
  if (/\boil\s*prime\b|\boil\s*based primer\b/.test(lower)) return "oil-based primer";
  return null;
}

function detectProposalCategory(input: {
  proposalTemplate?: z.infer<typeof ProposalTemplateZ> | null;
  proposalType?: z.infer<typeof ProposalTypeZ> | null;
  lines: string[];
}) {
  if (input.proposalTemplate) return input.proposalTemplate;

  const noteText = input.lines.join(" ").toLowerCase();
  const keywordMap: Array<{ category: z.infer<typeof ProposalCategoryZ>; pattern: RegExp }> = [
    { category: "deck_restoration", pattern: /\bdeck\b/ },
    { category: "pergola_restoration", pattern: /\bpergola\b/ },
    { category: "cabinet_refinishing", pattern: /\bcabinet(s)?\b|\brefinish\b/ },
    { category: "trim_restoration", pattern: /\btrim\b|\bbaseboard\b|\bcasing\b|\bmolding\b|\bmoulding\b/ },
    { category: "wallpaper_removal", pattern: /\bwallpaper\b/ },
    { category: "drywall_repair", pattern: /\bdrywall\b|\bpatch\b|\bcrack\b|\bnail holes?\b/ },
    { category: "exterior_painting", pattern: /\bexterior\b|\bsiding\b|\bfacade\b|\boutside\b/ },
    { category: "commercial_painting", pattern: /\bcommercial\b|\boffice\b|\btenant\b|\bstorefront\b/ },
    { category: "new_construction", pattern: /\bnew construction\b|\bnew build\b|\bspec\b/ },
    { category: "property_maintenance", pattern: /\bmaintenance\b|\btouch\s*up\b|\bservice\b/ },
  ];

  for (const rule of keywordMap) {
    if (rule.pattern.test(noteText)) return rule.category;
  }

  if (input.proposalType === "commercial") return "commercial_painting";
  if (input.proposalType === "new_construction") return "new_construction";
  if (input.proposalType === "maintenance") return "property_maintenance";
  if (input.proposalType === "restoration") return "trim_restoration";
  if (input.proposalType === "custom") return "custom";

  return "interior_painting";
}

type ProposalArchetype = z.infer<typeof ProposalTemplateZ>;

function detectProposalArchetype(input: {
  proposalTemplate?: z.infer<typeof ProposalTemplateZ> | null;
  proposalType?: z.infer<typeof ProposalTypeZ> | null;
  lines: string[];
}): ProposalArchetype {
  if (input.proposalTemplate) return input.proposalTemplate;

  const noteText = input.lines.join(" ").toLowerCase();
  const keywordMap: Array<{ archetype: ProposalArchetype; pattern: RegExp }> = [
    { archetype: "deck_restoration", pattern: /\bdeck\b/ },
    { archetype: "pergola_restoration", pattern: /\bpergola\b/ },
    { archetype: "cabinet_refinishing", pattern: /\bcabinet(s)?\b|\brefinish\b/ },
    { archetype: "trim_restoration", pattern: /\btrim\b|\bbaseboard\b|\bcasing\b|\bmolding\b|\bmoulding\b/ },
    { archetype: "wallpaper_removal", pattern: /\bwallpaper\b/ },
    { archetype: "drywall_repair", pattern: /\bdrywall\b|\bpatch\b|\bcrack\b|\bnail holes?\b/ },
    { archetype: "exterior_painting", pattern: /\bexterior\b|\bsiding\b|\bfacade\b|\boutside\b/ },
    { archetype: "commercial_painting", pattern: /\bcommercial\b|\boffice\b|\btenant\b|\bstorefront\b/ },
    { archetype: "new_construction", pattern: /\bnew construction\b|\bnew build\b|\bspec\b/ },
    { archetype: "property_maintenance", pattern: /\bmaintenance\b|\btouch\s*up\b|\bservice\b/ },
  ];

  for (const rule of keywordMap) {
    if (rule.pattern.test(noteText)) return rule.archetype;
  }

  if (input.proposalType === "commercial") return "commercial_painting";
  if (input.proposalType === "new_construction") return "new_construction";
  if (input.proposalType === "maintenance") return "property_maintenance";
  if (input.proposalType === "restoration") return "trim_restoration";

  return "interior_painting";
}

function createSection(
  templateKey: string,
  title: string,
  description: string,
  bulletItems: string[],
  sortOrder: number
) {
  return {
    templateKey,
    title,
    description,
    bulletItems: uniqueSentences(bulletItems),
    notes: "",
    sortOrder,
  };
}

export const proposalsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.proposal.findMany({
      include: {
        customer: true,
        _count: {
          select: {
            options: true,
            attachments: true,
            paintColors: true,
            sections: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
  ),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.proposal.findUnique({
      where: { id: input.id },
      include: {
        customer: true,
        sections: { orderBy: { sortOrder: "asc" } },
        options: { orderBy: { sortOrder: "asc" } },
        attachments: { orderBy: { sortOrder: "asc" } },
        paintColors: { orderBy: { sortOrder: "asc" } },
      },
    })
  ),

  create: adminProcedure.input(proposalInput).mutation(async ({ ctx, input }) => {
    const last = await ctx.prisma.proposal.findFirst({
      orderBy: { id: "desc" },
      select: { proposalNumber: true },
    });

    const proposalNumber = nextNumber("PROP", last?.proposalNumber);
    const budgetTotal = input.materialsBudget + input.laborBudget + input.subcontractorBudget;
    const sanitizedSections = sanitizeSections(input.sections);
    const sanitizedOptions = sanitizeOptions(input.options);
    const sanitizedAttachments = sanitizeAttachments(input.attachments);
    const sanitizedPaintColors = sanitizePaintColors(input.paintColors);

    return ctx.prisma.proposal.create({
      data: {
        customerId: input.customerId,
        projectName: input.projectName,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        status: input.status,
        proposalTemplate: input.proposalTemplate ?? null,
        proposalType: input.proposalType ?? null,
        projectSummary: input.projectSummary,
        scopeOfWork: input.scopeOfWork,
        includedWork: input.includedWork,
        exclusions: input.exclusions,
        importantNotes: input.importantNotes,
        recommendations: input.recommendations,
        closingText: input.closingText,
        proposalBody: input.proposalBody,
        aiAssistantNotes: input.aiAssistantNotes,
        notes: input.notes,
        emailBody: input.emailBody,
        referencesText: input.referencesText,
        termsAndConditions: input.termsAndConditions,
        paymentSchedule: input.paymentSchedule,
        materialsBudget: input.materialsBudget,
        laborBudget: input.laborBudget,
        subcontractorBudget: input.subcontractorBudget,
        proposalNumber,
        totalAmount: input.totalAmount ?? budgetTotal,
        expectedStartDate: input.expectedStartDate ?? null,
        expectedEndDate: input.expectedEndDate ?? null,
        sentAt: input.status === "sent" ? new Date() : null,
        approvedAt: input.status === "approved" ? new Date() : null,
        sections: sanitizedSections.length
          ? {
              create: sanitizedSections.map((s, index) => ({
                templateKey: s.templateKey,
                title: s.title,
                description: s.description,
                bulletItems: s.bulletItems,
                notes: s.notes,
                sortOrder: s.sortOrder ?? index,
              })),
            }
          : undefined,
        options: sanitizedOptions.length
          ? {
              create: sanitizedOptions.map((o, index) => ({
                title: o.title,
                description: o.description,
                scope: o.scope,
                price: o.price,
                isVisible: o.isVisible,
                sortOrder: o.sortOrder ?? index,
              })),
            }
          : undefined,
        attachments: sanitizedAttachments.length
          ? {
              create: sanitizedAttachments.map((a, index) => ({
                category: a.category,
                fileName: a.fileName,
                fileUrl: a.fileUrl,
                notes: a.notes,
                sortOrder: a.sortOrder ?? index,
              })),
            }
          : undefined,
        paintColors: sanitizedPaintColors.length
          ? {
              create: sanitizedPaintColors.map((p, index) => ({
                area: p.area,
                colorName: p.colorName,
                brand: p.brand,
                product: p.product,
                colorCode: p.colorCode,
                finish: p.finish,
                notes: p.notes,
                sortOrder: p.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      include: {
        customer: true,
        sections: { orderBy: { sortOrder: "asc" } },
        options: { orderBy: { sortOrder: "asc" } },
        attachments: { orderBy: { sortOrder: "asc" } },
        paintColors: { orderBy: { sortOrder: "asc" } },
      },
    });
  }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        data: proposalInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.proposal.findUnique({
        where: { id: input.id },
        select: { status: true, sentAt: true, approvedAt: true },
      });

      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      }

      if (current.status === "converted") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Converted proposals are read-only.",
        });
      }

      const budgetTotal = input.data.materialsBudget + input.data.laborBudget + input.data.subcontractorBudget;
      const sanitizedSections = sanitizeSections(input.data.sections);
      const sanitizedOptions = sanitizeOptions(input.data.options);
      const sanitizedAttachments = sanitizeAttachments(input.data.attachments);
      const sanitizedPaintColors = sanitizePaintColors(input.data.paintColors);

      return ctx.prisma.proposal.update({
        where: { id: input.id },
        data: {
          customerId: input.data.customerId,
          projectName: input.data.projectName,
          address: input.data.address,
          city: input.data.city,
          state: input.data.state,
          zipCode: input.data.zipCode,
          status: input.data.status,
          proposalTemplate: input.data.proposalTemplate ?? null,
          proposalType: input.data.proposalType ?? null,
          projectSummary: input.data.projectSummary,
          scopeOfWork: input.data.scopeOfWork,
          includedWork: input.data.includedWork,
          exclusions: input.data.exclusions,
          importantNotes: input.data.importantNotes,
          recommendations: input.data.recommendations,
          closingText: input.data.closingText,
          proposalBody: input.data.proposalBody,
          aiAssistantNotes: input.data.aiAssistantNotes,
          notes: input.data.notes,
          emailBody: input.data.emailBody,
          referencesText: input.data.referencesText,
          termsAndConditions: input.data.termsAndConditions,
          paymentSchedule: input.data.paymentSchedule,
          materialsBudget: input.data.materialsBudget,
          laborBudget: input.data.laborBudget,
          subcontractorBudget: input.data.subcontractorBudget,
          totalAmount: input.data.totalAmount ?? budgetTotal,
          expectedStartDate: input.data.expectedStartDate ?? null,
          expectedEndDate: input.data.expectedEndDate ?? null,
          sentAt: input.data.status === "sent" && !current.sentAt ? new Date() : current.sentAt,
          approvedAt: input.data.status === "approved" && !current.approvedAt ? new Date() : current.approvedAt,
          sections: {
            deleteMany: {},
            create: sanitizedSections.map((s, index) => ({
              templateKey: s.templateKey,
              title: s.title,
              description: s.description,
              bulletItems: s.bulletItems,
              notes: s.notes,
              sortOrder: s.sortOrder ?? index,
            })),
          },
          options: {
            deleteMany: {},
            create: sanitizedOptions.map((o, index) => ({
              title: o.title,
              description: o.description,
              scope: o.scope,
              price: o.price,
              isVisible: o.isVisible,
              sortOrder: o.sortOrder ?? index,
            })),
          },
          attachments: {
            deleteMany: {},
            create: sanitizedAttachments.map((a, index) => ({
              category: a.category,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              notes: a.notes,
              sortOrder: a.sortOrder ?? index,
            })),
          },
          paintColors: {
            deleteMany: {},
            create: sanitizedPaintColors.map((p, index) => ({
              area: p.area,
              colorName: p.colorName,
              brand: p.brand,
              product: p.product,
              colorCode: p.colorCode,
              finish: p.finish,
              notes: p.notes,
              sortOrder: p.sortOrder ?? index,
            })),
          },
        },
        include: {
          customer: true,
          sections: { orderBy: { sortOrder: "asc" } },
          options: { orderBy: { sortOrder: "asc" } },
          attachments: { orderBy: { sortOrder: "asc" } },
          paintColors: { orderBy: { sortOrder: "asc" } },
        },
      });
    }),

  setStatus: adminProcedure
    .input(z.object({ id: z.number(), status: ProposalStatusZ }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prisma.proposal.findUnique({
        where: { id: input.id },
        select: { status: true, sentAt: true, approvedAt: true },
      });

      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      }

      if (current.status === "converted") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Converted proposals are read-only.",
        });
      }

      return ctx.prisma.proposal.update({
        where: { id: input.id },
        data: {
          status: input.status,
          sentAt: input.status === "sent" && !current.sentAt ? new Date() : current.sentAt,
          approvedAt: input.status === "approved" && !current.approvedAt ? new Date() : current.approvedAt,
        },
      });
    }),

  generateProposalDraft: adminProcedure
    .input(
      z.object({
        aiDraftNotes: z.string().min(1),
        proposalTemplate: ProposalTemplateZ.nullable().optional(),
        proposalType: ProposalTypeZ.nullable().optional(),
        selectedExampleIds: z.array(z.number()).default([]),
        customerName: z.string().optional(),
        projectName: z.string().optional(),
        options: z
          .array(
            z.object({
              title: z.string().optional(),
              description: z.string().optional(),
              price: z.number().nullable().optional(),
            })
          )
          .default([]),
        attachments: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const customerName = normalizeText(input.customerName || "") || "Valued Customer";
      const projectName = normalizeText(input.projectName || "") || "your project";
      const lines = splitDraftNotes(input.aiDraftNotes);
      const proposalCategory = detectProposalCategory({
        proposalTemplate: input.proposalTemplate,
        proposalType: input.proposalType,
        lines,
      });
      const archetype = proposalCategory === "custom" ? "interior_painting" : proposalCategory;
      const writingGuide = proposalCategory === "custom" ? null : TEMPLATE_WRITING_GUIDE[proposalCategory];

      const selectedExamples = input.selectedExampleIds.length
        ? await ctx.prisma.proposalExample.findMany({
            where: { id: { in: input.selectedExampleIds } },
            orderBy: { updatedAt: "desc" },
          })
        : await ctx.prisma.proposalExample.findMany({
            where: { proposalCategory },
            orderBy: [
              { proposalType: input.proposalType ? "desc" : "asc" },
              { updatedAt: "desc" },
            ],
            take: 3,
          });

      let sqft: number | null = null;
      let totalAmount: number | null = null;
      let paymentSchedule: string | null = null;
      let worksFromHome = false;
      let needsDailyCleanup = false;
      let mentionsDarkColors = false;

      const mentionedSurfaces = new Set<string>();
      const roomMentions = new Set<string>();
      const productBySurface: Partial<Record<"walls" | "ceilings" | "trimDoors", string>> = {};

      let hasGeneralRepairs = false;
      let hasKitchenBacksplashPatch = false;
      let hasPrimaryCeilingStain = false;
      let hasKidsWindowCrack = false;
      let hasTrimPrep = false;
      let hasDoorPrep = false;
      let hasSpotPrime = false;
      let hasTwoCoats = false;
      let hasRespectfulCrew = false;
      let hasFinalWalkthrough = false;

      const explicitOptionPrices: number[] = [];

      for (const line of lines) {
        const lower = line.toLowerCase();

        if (!sqft) {
          const parsedSqft = parseSqft(line);
          if (parsedSqft) sqft = parsedSqft;
        }

        if (!paymentSchedule) {
          const parsedPayment = parsePaymentSchedule(line);
          if (parsedPayment) paymentSchedule = parsedPayment;
        }

        const parsedAmount = parseStandaloneAmount(line);
        if (parsedAmount) {
          explicitOptionPrices.push(parsedAmount);
          totalAmount = parsedAmount;
        }

        if (/\bworks? from home\b/.test(lower)) {
          worksFromHome = true;
        }

        if (/\bdaily\s*cleanup\b|\bdaily\s*clean\s*up\b/.test(lower)) {
          needsDailyCleanup = true;
        }

        if (/\brespectful crew\b|\bprofessional crew\b/.test(lower)) {
          hasRespectfulCrew = true;
        }

        if (/\bfinal walkthrough\b|\bwalkthrough\b/.test(lower)) {
          hasFinalWalkthrough = true;
        }

        if (/\bdark colors?\b|\bextra coat\b/.test(lower)) {
          mentionsDarkColors = true;
        }

        if (hasToken(lower, /\bwalls?\b/)) mentionedSurfaces.add("walls");
        if (hasToken(lower, /\bceilings?\b/)) mentionedSurfaces.add("ceilings");
        if (hasToken(lower, /\btrim\b|\bbaseboards?\b|\bcasing\b|\bmoulding\b|\bmolding\b/)) mentionedSurfaces.add("trim");
        if (hasToken(lower, /\bdoors?\b/)) mentionedSurfaces.add("doors");

        if (hasToken(lower, /\bliving room\b/)) roomMentions.add("living room");
        if (hasToken(lower, /\bhall(way)?\b/)) roomMentions.add("hallway");
        if (hasToken(lower, /\bkids? bedroom\b|\bchildren'?s bedroom\b/)) roomMentions.add("bedrooms");

        if (hasToken(lower, /\bnail holes?\b|\bcrack(s)?\b|\bdent(s)?\b|\bimperfection(s)?\b/)) {
          hasGeneralRepairs = true;
        }
        if (hasToken(lower, /\bkitchen\b/) && hasToken(lower, /\bpatch\b/) && hasToken(lower, /\bbacksplash\b/)) {
          hasKitchenBacksplashPatch = true;
        }
        if (hasToken(lower, /\b(master|primary bedroom)\b/) && hasToken(lower, /\bstain\b/) && hasToken(lower, /\bceiling\b/)) {
          hasPrimaryCeilingStain = true;
        }
        if (hasToken(lower, /\b(kids? bedroom|children'?s bedroom)\b/) && hasToken(lower, /\bcrack\b/) && hasToken(lower, /\bwindow\b/)) {
          hasKidsWindowCrack = true;
        }
        if (hasToken(lower, /\btrim\b/) && hasToken(lower, /\bfill\b|\bcaulk\b|\bsand\b/)) {
          hasTrimPrep = true;
        }
        if (hasToken(lower, /\bdoors?\b/) && hasToken(lower, /\bsand\b|\brepaint\b/)) {
          hasDoorPrep = true;
        }
        if (hasToken(lower, /\bspot\s*prime\b/)) {
          hasSpotPrime = true;
        }
        if (hasToken(lower, /\b2\s*coats?\b|\btwo\s*coats?\b/)) {
          hasTwoCoats = true;
        }

        const product = extractProductName(lower);
        if (product) {
          if (hasToken(lower, /\bwalls?\b/)) productBySurface.walls = product;
          if (hasToken(lower, /\bceilings?\b/)) productBySurface.ceilings = product;
          if (hasToken(lower, /\btrim\b|\bdoors?\b|\bbaseboards?\b/)) productBySurface.trimDoors = product;
        }
      }

      if (!productBySurface.walls && lines.some((line) => /\bbm\s*regal\b|\bregal\b/i.test(line))) {
        productBySurface.walls = "Benjamin Moore Regal";
      }
      if (!productBySurface.ceilings && lines.some((line) => /\bbm\s*ceiling\b|\bceiling paint\b/i.test(line))) {
        productBySurface.ceilings = "Benjamin Moore Ceiling Paint";
      }
      if (!productBySurface.trimDoors && lines.some((line) => /\badvance\b/i.test(line))) {
        productBySurface.trimDoors = "Benjamin Moore Advance";
      }

      const scopeBullets: string[] = [];

      if (lines.some((line) => /\bprotect\b|\bmask\b|\bcover\b/i.test(line))) {
        const includeCabinets = lines.some((line) => /\bcabinets?\b/i.test(line));
        scopeBullets.push(
          includeCabinets
            ? "Protect floors, furniture, cabinetry, and adjacent finishes before preparation and painting begin."
            : "Protect floors, furniture, and adjacent finishes before preparation and painting begin."
        );
      }

      if (hasGeneralRepairs) {
        const roomText = roomMentions.size
          ? `, including localized repairs in the ${Array.from(roomMentions).join(", ")}`
          : "";
        scopeBullets.push(`Repair nail holes, drywall cracks, dents, and surface imperfections throughout the home${roomText}.`);
      }

      if (hasKitchenBacksplashPatch) {
        scopeBullets.push("Patch and prepare damaged drywall near the kitchen backsplash before primer and finish coats.");
      }

      if (hasPrimaryCeilingStain) {
        scopeBullets.push("Spot-prime the ceiling stain in the primary bedroom with an appropriate stain-blocking primer.");
      }

      if (hasKidsWindowCrack) {
        scopeBullets.push("Repair drywall cracking above the children's bedroom window and prepare the area for finish painting.");
      }

      if (hasTrimPrep || mentionedSurfaces.has("trim")) {
        if (hasTrimPrep && hasSpotPrime) {
          scopeBullets.push("Fill, caulk, sand, and spot-prime trim surfaces as needed to achieve clean, durable finish lines.");
        } else if (hasTrimPrep) {
          scopeBullets.push("Fill, caulk, and sand trim surfaces as needed to prepare for finish coats.");
        }
      }

      if (hasDoorPrep || mentionedSurfaces.has("doors")) {
        if (hasDoorPrep) {
          scopeBullets.push("Sand and repaint doors as needed for proper adhesion and a consistent final appearance.");
        }
      }

      if (mentionedSurfaces.has("walls")) {
        scopeBullets.push(`Apply ${productBySurface.walls || "the selected coating system"} to wall surfaces.`);
      }
      if (mentionedSurfaces.has("ceilings")) {
        scopeBullets.push(`Apply ${productBySurface.ceilings || "the selected ceiling coating system"} to ceiling surfaces.`);
      }

      if (mentionedSurfaces.has("trim") || mentionedSurfaces.has("doors")) {
        if (hasTwoCoats && productBySurface.trimDoors) {
          const targets = [mentionedSurfaces.has("trim") ? "trim" : "", mentionedSurfaces.has("doors") ? "doors" : ""]
            .filter(Boolean)
            .join(" and ");
          scopeBullets.push(`Apply two finish coats of ${productBySurface.trimDoors} to ${targets}.`);
        } else if (productBySurface.trimDoors) {
          scopeBullets.push(`Apply ${productBySurface.trimDoors} to trim and door surfaces as noted.`);
        }
      }

      if (needsDailyCleanup) {
        scopeBullets.push("Maintain a clean work area and perform daily cleanup throughout production.");
      }

      const importantNotesList = [
        worksFromHome ? "Since the homeowner works from home, work areas will be coordinated daily to minimize disruption." : "",
        mentionsDarkColors ? "Additional coats may be required where dark color transitions affect hide and uniformity." : "",
      ].filter(Boolean);

      const recommendationsList = [
        input.options.some((option) => (option.title || "").trim().length > 0)
          ? "Optional scope items can be confirmed before scheduling so the final production plan aligns with your selections."
          : "",
      ].filter(Boolean);

      const inferredOptionPrices = uniqueSentences(
        explicitOptionPrices.map((price) => price.toString())
      )
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));

      const structuredOptions =
        input.options.filter((option) => (option.title || "").trim().length > 0 || (option.description || "").trim().length > 0 || option.price != null).length > 0
          ? input.options
              .filter((option) => (option.title || "").trim().length > 0 || (option.description || "").trim().length > 0 || option.price != null)
              .map((option, index) => ({
                title: normalizeText(option.title || "") || `Option ${index + 1}`,
                description: normalizeText(option.description || ""),
                price: option.price ?? null,
              }))
          : inferredOptionPrices.slice(0, 3).map((price, index) => ({
              title:
                index === 0
                  ? "Maintenance Scope"
                  : index === 1
                    ? "Enhanced Scope"
                    : "Comprehensive Scope",
              description: "",
              price,
            }));

      const scopeStandards = uniqueSentences([
        "Protect floors, furniture, and adjacent finishes before and during production.",
        needsDailyCleanup ? "Perform daily cleanup and maintain orderly work areas." : "",
        hasRespectfulCrew ? "Maintain a respectful and professional on-site crew presence." : "A respectful and professional crew approach is maintained throughout the project.",
        hasFinalWalkthrough ? "Complete a final walkthrough to confirm scope completion." : "Complete a final walkthrough at project closeout.",
      ]);

      const attachmentBullets = uniqueSentences([
        "I.S Painting Booklet",
        "Certificate of Insurance",
        structuredOptions.length > 1 || input.options.length > 0 ? "Estimate Breakdown" : "",
        "References",
      ]);

      const sections: Array<{
        templateKey: string;
        title: string;
        description: string;
        bulletItems: string[];
        notes: string;
        sortOrder: number;
      }> = [];

      let sortOrder = 0;
      const pushSection = (templateKey: string, title: string, description: string, bullets: string[]) => {
        sections.push(createSection(templateKey, title, description, bullets, sortOrder));
        sortOrder += 1;
      };

      const archetypeFamilies: Record<ProposalArchetype, "interior" | "restoration" | "specialized"> = {
        interior_painting: "interior",
        exterior_painting: "interior",
        commercial_painting: "interior",
        new_construction: "interior",
        property_maintenance: "interior",
        trim_restoration: "restoration",
        deck_restoration: "restoration",
        pergola_restoration: "restoration",
        cabinet_refinishing: "specialized",
        wallpaper_removal: "specialized",
        drywall_repair: "specialized",
      };

      const family = archetypeFamilies[archetype];

      if (family === "interior") {
        pushSection("scope_of_work", "Scope of Work", "", uniqueSentences(scopeBullets));
        if (structuredOptions.length) {
          pushSection(
            "optional_upgrades",
            "Optional Upgrades",
            "",
            structuredOptions.map((option, index) => {
              const priceText = option.price == null ? "Investment TBD" : option.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
              return `${index + 1}. ${option.title} - ${priceText}${option.description ? ` (${option.description})` : ""}`;
            })
          );
        }
        pushSection(
          "paint_specifications",
          "Paint Specifications",
          "",
          uniqueSentences([
            productBySurface.walls ? `Wall surfaces: ${productBySurface.walls}.` : "",
            productBySurface.ceilings ? `Ceiling surfaces: ${productBySurface.ceilings}.` : "",
            productBySurface.trimDoors ? `Trim and doors: ${productBySurface.trimDoors}.` : "",
          ])
        );
        pushSection("scope_standards", "Scope Standards", "", scopeStandards);
      }

      if (family === "restoration") {
        const restorationNames: Record<ProposalArchetype, [string, string, string]> = {
          trim_restoration: ["Complete Restoration", "Localized Repairs", "Trim Replacement"],
          deck_restoration: ["Maintenance Restoration", "Complete Sanding", "Targeted Board Repairs"],
          pergola_restoration: ["Maintenance Restoration", "Complete Sanding", "Component Repairs"],
          interior_painting: ["", "", ""],
          exterior_painting: ["", "", ""],
          cabinet_refinishing: ["", "", ""],
          wallpaper_removal: ["", "", ""],
          drywall_repair: ["", "", ""],
          commercial_painting: ["", "", ""],
          new_construction: ["", "", ""],
          property_maintenance: ["", "", ""],
        };

        const names = restorationNames[archetype];
        const sourceOptions =
          structuredOptions.length > 0
            ? structuredOptions
            : names.map((name, index) => ({
                title: name,
                description: "",
                price: inferredOptionPrices[index] ?? null,
              }));

        sourceOptions.slice(0, 3).forEach((option, index) => {
          const bullets =
            index === 0
              ? uniqueSentences(scopeBullets)
              : index === 1
                ? uniqueSentences([
                    "Expanded preparation and restoration scope in higher-wear and visibly aged areas.",
                    ...scopeBullets.slice(0, 5),
                  ])
                : uniqueSentences([
                    "Includes targeted replacement or advanced repair where restoration alone is not sufficient.",
                    ...scopeBullets.slice(0, 4),
                  ]);
          const priceText = option.price == null ? "Investment TBD" : option.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
          pushSection(
            `option_${index + 1}`,
            `Option ${index + 1}: ${option.title}`,
            priceText,
            bullets
          );
        });

        if (structuredOptions.length > 3) {
          pushSection(
            "additional_options",
            "Additional Painting Options",
            "",
            structuredOptions.slice(3).map((option) => {
              const priceText = option.price == null ? "Investment TBD" : option.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
              return `${option.title} - ${priceText}`;
            })
          );
        }

        pushSection("scope_standards", "Scope Standards", "", scopeStandards);
      }

      if (family === "specialized") {
        pushSection("scope_of_work", "Scope of Work", "", uniqueSentences(scopeBullets));
        pushSection(
          "important_note",
          "Important Note",
          "",
          uniqueSentences([
            hasSpotPrime
              ? "Stained or repaired areas will be spot-primed with an appropriate primer before finish coats to reduce bleed-through and improve uniformity."
              : "Final preparation details are confirmed at mobilization to support finish quality and durability.",
          ])
        );
        if (structuredOptions.length) {
          pushSection(
            "options",
            "Options",
            "",
            structuredOptions.map((option, index) => {
              const priceText = option.price == null ? "Investment TBD" : option.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
              return `${index + 1}. ${option.title} - ${priceText}${option.description ? ` (${option.description})` : ""}`;
            })
          );
        }
        pushSection("scope_standards", "Scope Standards", "", scopeStandards);
      }

      if (paymentSchedule) {
        pushSection("payment_schedule", "Payment Schedule", paymentSchedule, []);
      }

      if (archetype === "deck_restoration" || archetype === "pergola_restoration") {
        pushSection("attachments", "Attachments", "", attachmentBullets);
      }

      pushSection(
        "price_validity",
        "Price Validity",
        "",
        [
          "This proposal is valid for 60 days from the proposal date.",
          "Projects beginning more than six (6) months after the proposal date may require pricing adjustments due to labor and material cost changes.",
        ]
      );

      const areaText = sqft ? ` for approximately ${sqft.toLocaleString("en-US")} sq ft` : "";
      const summaryNoun = writingGuide?.summaryNoun || "painting proposal";
      const projectSummary = `This ${summaryNoun} covers the preparation and painting scope for ${projectName}${areaText}, organized for clear execution and finish quality.`;
      const scopeOfWork = writingGuide?.scopeLead || "The scope below groups related work activities into a clear production plan.";
      const importantNotes = uniqueSentences(importantNotesList).join("\n");
      const recommendations = uniqueSentences(recommendationsList).join("\n");
      const referencesText = "References and relevant project examples are available upon request.";
      const closingText = `We appreciate the opportunity to work with you, ${customerName}. If you would like any adjustments to scope or pricing options, we can update this proposal promptly.`;

      return {
        projectSummary,
        scopeOfWork,
        importantNotes,
        recommendations,
        referencesText,
        closingText,
        paymentSchedule: paymentSchedule || undefined,
        totalAmount: totalAmount ?? undefined,
        sections,
        proposalCategory,
        selectedExamples: selectedExamples.map((example) => ({
          id: example.id,
          title: example.title,
          proposalCategory: example.proposalCategory,
          proposalType: example.proposalType,
          tags: example.tags,
        })),
      };
    }),

  generateEmailDraft: adminProcedure
    .input(
      z.object({
        customerName: z.string().optional(),
        projectName: z.string().optional(),
        includeCoi: z.boolean().default(true),
        includeBooklet: z.boolean().default(true),
        includeReferences: z.boolean().default(true),
      })
    )
    .mutation(({ input }) => {
      const customer = input.customerName || "there";
      const project = input.projectName || "your project";
      const references = input.includeReferences ? "References and prior project examples are available for review." : "";
      const coi = input.includeCoi ? "Our current COI can be included with the proposal package." : "";
      const booklet = input.includeBooklet ? "We can also include our services booklet for quick scope comparisons." : "";

      const body = [
        `Hi ${customer},`,
        "",
        `Thank you again for the opportunity to quote ${project}. Attached is your proposal for review.`,
        "",
        coi,
        booklet,
        references,
        "",
        "If the proposal looks good, reply to this email and we can finalize scheduling windows right away.",
        "",
        "Please let me know if you would like any option adjusted before approval.",
        "",
        "Best regards,",
        "I.S. Painting",
      ]
        .filter(Boolean)
        .join("\n");

      return { body };
    }),
});
