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
      const customerName = input.customerName || "Valued Customer";
      const projectName = input.projectName || "your project";
      const notes = input.aiDraftNotes.trim();

      const templateLabel = input.proposalTemplate ? input.proposalTemplate.replace(/_/g, " ") : "painting";

      const optionsText = input.options.length
        ? input.options
            .map((o, index) => {
              const title = (o.title || "").trim() || `Option ${index + 1}`;
              const description = (o.description || "").trim();
              const price = o.price == null ? "TBD" : o.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
              return `${index + 1}. ${title} - ${price}${description ? `\n   ${description}` : ""}`;
            })
            .join("\n")
        : "Pricing options can be customized after final scope confirmation.";

      const attachmentText = input.attachments.length
        ? input.attachments.map((name) => `- ${name}`).join("\n")
        : "- I.S. Painting Booklet\n- Certificate of Insurance\n- References";

      const projectSummary = `Thank you for the opportunity to provide a proposal for ${projectName}. Based on our walkthrough and your goals, this proposal outlines a ${templateLabel} approach with clear options and expectations.`;

      const importantNotes = [
        "This proposal is based on visible site conditions at the time of visit.",
        "Any hidden substrate issues discovered during preparation will be reviewed before additional work proceeds.",
        "Color matching may require wider blend areas if adjacent surfaces have aged or faded.",
      ].join("\n");

      const recommendations = [
        "Choose the option that balances long-term durability with your immediate budget.",
        "Approve colors and finish levels before scheduling to avoid production delays.",
        "If exact color match is critical, plan for potential wall touch-ups or broader repaint areas.",
      ].join("\n");

      const referencesText = "Client references and before/after project examples are available upon request.";
      const closingText = `We appreciate the opportunity to serve you, ${customerName}. If you would like any option adjusted, we can revise quickly before scheduling.`;

      const sections = [
        {
          templateKey: "greeting",
          title: "Greeting",
          description: `Hi ${customerName},`,
          bulletItems: [],
          notes: "",
          sortOrder: 0,
        },
        {
          templateKey: "project_summary",
          title: "Project Summary",
          description: projectSummary,
          bulletItems: [],
          notes: "",
          sortOrder: 1,
        },
        {
          templateKey: "scope_of_work",
          title: "Scope of Work",
          description: "",
          bulletItems: notes.split("\n").map((line) => line.trim()).filter(Boolean),
          notes: "",
          sortOrder: 2,
        },
        {
          templateKey: "options",
          title: "Options",
          description: optionsText,
          bulletItems: [],
          notes: "",
          sortOrder: 3,
        },
        {
          templateKey: "important_notes",
          title: "Important Notes",
          description: importantNotes,
          bulletItems: [],
          notes: "",
          sortOrder: 4,
        },
        {
          templateKey: "recommendations",
          title: "Recommendations",
          description: recommendations,
          bulletItems: [],
          notes: "",
          sortOrder: 5,
        },
        {
          templateKey: "included_attachments",
          title: "Included Attachments",
          description: attachmentText,
          bulletItems: [],
          notes: "",
          sortOrder: 6,
        },
        {
          templateKey: "references",
          title: "References",
          description: referencesText,
          bulletItems: [],
          notes: "",
          sortOrder: 7,
        },
        {
          templateKey: "closing",
          title: "Closing",
          description: closingText,
          bulletItems: [],
          notes: "",
          sortOrder: 8,
        },
      ];

      return {
        projectSummary,
        scopeOfWork: notes,
        importantNotes,
        recommendations,
        referencesText,
        closingText,
        sections,
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
