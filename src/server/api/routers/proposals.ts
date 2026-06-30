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

const ROOM_PATTERNS: Array<{ title: string; pattern: RegExp }> = [
  { title: "Living Room", pattern: /\b(living room|family room|great room)\b/i },
  { title: "Kitchen", pattern: /\bkitchen\b/i },
  { title: "Dining Room", pattern: /\bdining\b/i },
  { title: "Primary Bedroom", pattern: /\b(master|primary bedroom|main bedroom)\b/i },
  { title: "Bedroom", pattern: /\bbedroom\b/i },
  { title: "Bathroom", pattern: /\bbath(room)?\b/i },
  { title: "Hallway", pattern: /\bhall(way)?\b/i },
  { title: "Stairwell", pattern: /\bstair(s|well)?\b/i },
  { title: "Entry", pattern: /\b(entry|foyer)\b/i },
  { title: "Office", pattern: /\boffice\b/i },
  { title: "Trim", pattern: /\b(trim|baseboard|casing|moulding|molding)\b/i },
  { title: "Doors", pattern: /\bdoor(s)?\b/i },
  { title: "Ceilings", pattern: /\bceiling(s)?\b/i },
  { title: "Exterior", pattern: /\b(exterior|outside|facade|siding)\b/i },
  { title: "Deck", pattern: /\bdeck\b/i },
  { title: "Pergola", pattern: /\bpergola\b/i },
  { title: "Cabinets", pattern: /\bcabinet(s)?\b/i },
];

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

function detectRoomTitle(line: string) {
  for (const room of ROOM_PATTERNS) {
    if (room.pattern.test(line)) return room.title;
  }
  return null;
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

function toSentence(text: string) {
  const clean = normalizeText(text);
  if (!clean) return "";
  const withCapital = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?]$/.test(withCapital) ? withCapital : `${withCapital}.`;
}

function rewriteScopeLine(rawLine: string) {
  const line = normalizeText(rawLine);
  const lower = line.toLowerCase();
  if (!line) return "";

  const surfaces: Array<[RegExp, string]> = [
    [/\bwalls?\b/, "walls"],
    [/\bceilings?\b/, "ceilings"],
    [/\btrim\b|\bbaseboards?\b|\bcasing\b|\bmoulding\b|\bmolding\b/, "trim"],
    [/\bdoors?\b/, "doors"],
    [/\bbaseboards?\b/, "baseboards"],
    [/\bcabinets?\b/, "cabinet surfaces"],
  ];

  if (/\bpaint\b|\brepaint\b/.test(lower)) {
    const mentioned = surfaces.filter(([pattern]) => pattern.test(lower)).map(([, label]) => label);
    if (mentioned.length) {
      return `Our scope includes preparing and painting ${mentioned.join(", ")} as noted for this project.`;
    }
    return "Our scope includes thorough preparation and application of the selected finish system for the noted areas.";
  }

  if (/\bnail holes?\b|\bimperfection(s)?\b|\bcrack(s)?\b/.test(lower)) {
    return "Minor drywall repairs, including nail holes and surface imperfections, will be completed before primer and finish coats.";
  }

  if (/\bpatch\b/.test(lower) && /\bbacksplash\b/.test(lower)) {
    return "Drywall areas around the backsplash will be patched, sanded smooth, and prepared for finish painting.";
  }

  if (/\bpatch\b|\brepair\b/.test(lower)) {
    return "Surface repairs will be completed as needed to create a consistent paint-ready substrate.";
  }

  if (/\bprotect\b|\bmask\b|\bcover\b/.test(lower)) {
    const subject = line.replace(/^(protect|mask|cover)\s+/i, "").trim();
    if (subject) {
      return `Adjacent ${subject} will be carefully protected before preparation and painting begin.`;
    }
    return "Adjacent finishes and fixtures will be carefully protected throughout production.";
  }

  if (/\bstain\b/.test(lower) && /\bceiling\b/.test(lower)) {
    return "Any visible ceiling staining will be sealed with an appropriate stain-blocking primer before finish coats are applied.";
  }

  if (/\bcaulk\b/.test(lower)) {
    return "Open gaps at trim and transitions will be caulked where needed to improve finish lines and durability.";
  }

  if (/\bsand\b/.test(lower)) {
    return "Surfaces will be sanded as needed to ensure proper adhesion and a uniform final finish.";
  }

  if (/\bprime\b/.test(lower)) {
    return "Primer will be applied where required to support adhesion, uniformity, and coverage.";
  }

  if (/\bbm\s*regal\b|\bregal\b/.test(lower)) {
    return "Benjamin Moore Regal is noted for designated wall and ceiling finish coats.";
  }

  if (/\badvance\b/.test(lower) && /\btrim\b/.test(lower)) {
    return "Benjamin Moore Advance is noted for designated trim and millwork surfaces.";
  }

  if (/\bworks? from home\b/.test(lower)) {
    return "Project sequencing will be coordinated to reduce disruption during working hours.";
  }

  return `Work includes ${line.toLowerCase()}.`;
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
    .mutation(({ input }) => {
      const customerName = normalizeText(input.customerName || "") || "Valued Customer";
      const projectName = normalizeText(input.projectName || "") || "your project";
      const lines = splitDraftNotes(input.aiDraftNotes);
      const writingGuide = input.proposalTemplate ? TEMPLATE_WRITING_GUIDE[input.proposalTemplate] : null;

      let sqft: number | null = null;
      let totalAmount: number | null = null;
      let paymentSchedule: string | null = null;
      let worksFromHome = false;
      const importantNotesList: string[] = [];
      const recommendationsList: string[] = [];
      const roomTasks = new Map<string, string[]>();
      const generalTasks: string[] = [];

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
        if (parsedAmount) totalAmount = parsedAmount;

        if (/\bworks? from home\b/.test(lower)) {
          worksFromHome = true;
          continue;
        }

        if (/\bbm\s*regal\b|\bregal\b/.test(lower) || /\badvance\b/.test(lower)) {
          const sentence = rewriteScopeLine(line);
          if (sentence) recommendationsList.push(sentence);
          continue;
        }

        if (parsePaymentSchedule(line) || parseSqft(line) || parseStandaloneAmount(line)) {
          continue;
        }

        const sentence = rewriteScopeLine(line);
        if (!sentence) continue;
        const room = detectRoomTitle(line);
        if (room) {
          const bucket = roomTasks.get(room) || [];
          bucket.push(sentence);
          roomTasks.set(room, bucket);
        } else {
          generalTasks.push(sentence);
        }
      }

      if (worksFromHome) {
        importantNotesList.push("We will coordinate daily sequencing and access with your work-from-home schedule.");
      }

      if (paymentSchedule) {
        importantNotesList.push(`Requested payment schedule: ${paymentSchedule}.`);
      }

      if (input.options.some((option) => (option.title || "").trim().length > 0)) {
        recommendationsList.push("Optional scope items are listed separately so final selections can be confirmed before scheduling.");
      }

      if (!recommendationsList.length) {
        recommendationsList.push("Please review the organized scope below and let us know if any area needs to be adjusted before scheduling.");
      }

      const uniqueGeneralTasks = uniqueSentences(generalTasks);
      const uniqueRoomEntries = Array.from(roomTasks.entries()).map(([room, tasks]) => [room, uniqueSentences(tasks)] as const).filter(([, tasks]) => tasks.length > 0);
      const scopeSections = [
        ...uniqueRoomEntries.map(([room, tasks], index) => ({
          templateKey: `scope_${room.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          title: room,
          description: "",
          bulletItems: tasks,
          notes: "",
          sortOrder: index,
        })),
        ...(uniqueGeneralTasks.length
          ? [
              {
                templateKey: "scope_general",
                title: uniqueRoomEntries.length ? "General Scope" : "Scope of Work",
                description: "",
                bulletItems: uniqueGeneralTasks,
                notes: "",
                sortOrder: uniqueRoomEntries.length,
              },
            ]
          : []),
      ];

      const areaText = sqft ? ` for approximately ${sqft.toLocaleString("en-US")} sq ft` : "";
      const summaryNoun = writingGuide?.summaryNoun || "painting proposal";
      const projectSummary = `Thank you for the opportunity to provide this ${summaryNoun} for ${projectName}${areaText}. Our goal is a clean, well-planned execution with clear expectations from start to finish.`;
      const scopeOfWork = writingGuide?.scopeLead || "Scope is organized below by area based on your field notes.";
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
        sections: scopeSections,
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
