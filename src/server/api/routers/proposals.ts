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
  finish: z.string().optional(),
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
  options: z.array(proposalOptionInput).default([]),
  attachments: z.array(proposalAttachmentInput).default([]),
  paintColors: z.array(proposalPaintColorInput).default([]),
});

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
                finish: p.finish,
                notes: p.notes,
                sortOrder: p.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      include: {
        customer: true,
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
              finish: p.finish,
              notes: p.notes,
              sortOrder: p.sortOrder ?? index,
            })),
          },
        },
        include: {
          customer: true,
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
        roughNotes: z.string().min(1),
        customerName: z.string().optional(),
        projectName: z.string().optional(),
        options: z.array(proposalOptionInput.pick({ title: true, price: true })).default([]),
      })
    )
    .mutation(({ input }) => {
      const customerName = input.customerName || "Valued Customer";
      const projectName = input.projectName || "your project";
      const notes = input.roughNotes.trim();

      const includedWork = [
        "Detailed site preparation and protection of adjacent surfaces.",
        "Professional-grade labor and materials consistent with the selected option.",
        "Daily cleanup and final walkthrough before completion.",
      ].join("\n");

      const exclusions = [
        "Hidden substrate damage not visible during initial walkthrough.",
        "Permit fees or third-party inspections unless listed in an option.",
        "Owner-supplied materials unless approved in writing.",
      ].join("\n");

      const recommendations = [
        "Select the preferred option based on desired longevity and finish quality.",
        "Schedule work during a weather window that supports curing and prep quality.",
        "Finalize color and finish decisions before mobilization to avoid delays.",
      ].join("\n");

      const optionsText = input.options.length
        ? input.options
            .map((o, index) => `${index + 1}. ${o.title}${o.price == null ? " (TBD)" : ` (${o.price.toLocaleString("en-US", { style: "currency", currency: "USD" })})`}`)
            .join("\n")
        : "Options can be adjusted based on your preferred level of restoration and scope.";

      const proposalBody = [
        `<h2>Greeting</h2><p>Hi ${customerName},</p>`,
        `<h2>Project Summary</h2><p>Thank you for the opportunity to provide a proposal for ${projectName}. Based on our walkthrough and your goals, we prepared the following plan.</p>`,
        `<h2>Scope of Work</h2><p>${notes.replace(/\n/g, "<br />")}</p>`,
        `<h2>Options</h2><p>${optionsText.replace(/\n/g, "<br />")}</p>`,
        `<h2>Included Work</h2><p>${includedWork.replace(/\n/g, "<br />")}</p>`,
        `<h2>Exclusions</h2><p>${exclusions.replace(/\n/g, "<br />")}</p>`,
        `<h2>Important Notes</h2><p>Pricing is based on the current visible conditions and scope. Any requested scope adjustments will be quoted before execution.</p>`,
        `<h2>Recommendations</h2><p>${recommendations.replace(/\n/g, "<br />")}</p>`,
        `<h2>Pricing</h2><p>Final pricing is listed in the options section of this proposal.</p>`,
        "<h2>Closing</h2><p>We appreciate the opportunity to earn your business and look forward to delivering professional results.</p>",
        "<h2>References</h2><p>References and project photos are available upon request.</p>",
        "<h2>Attachments</h2><p>Relevant attachments can be included with this proposal package.</p>",
      ].join("\n");

      return {
        scopeOfWork: notes,
        includedWork,
        exclusions,
        importantNotes:
          "Client to provide clear site access on scheduled start date. Color selections must be approved prior to mobilization.",
        recommendations,
        referencesText: "Available upon request: local projects, testimonials, and before/after examples.",
        proposalBody,
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
