import { Prisma } from "@prisma/client";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { nextNumber } from "@/lib/utils";
import { buildJobEstimateFromProposal, round2, type ProposalEstimateSnapshot } from "@/lib/proposal-pricing";
import {
  computeProposalEstimate,
  type ProposalEstimateRequest,
  type ProposalEstimateWorkItemInput,
  type ProposalEstimateMethod,
  type ProposalPriceVisibilityMode,
  type ProposalGeneralLiabilityMode,
} from "@/lib/proposal-estimate-engine";
import { assertCustomerLinked, ProposalNotLinkedError } from "@/lib/proposal-guards";

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
const ProposalVisibilityZ = z.enum(["active", "archived", "all"]);
const ProductionRateBasisZ = z.enum(["SQFT_PER_HOUR", "LINEAR_FT_PER_HOUR", "HOURS_PER_ITEM", "FIXED_HOURS"]);
const ProposalPricingMethodZ = z.enum(["GROSS_MARGIN", "MARKUP"]);
const ProposalEstimateMethodZ = z.enum(["LABOR_AND_MATERIALS", "UNIT_PRICE", "MANUAL_TOTAL", "PRODUCTION_RATE"]);
const ProposalPriceVisibilityModeZ = z.enum(["ITEMIZED", "GROUPED", "HIDDEN"]);
const ProposalLaborModeZ = z.enum(["HOURS", "DAYS"]);
const ProposalGeneralLiabilityModeZ = z.enum(["PERCENT_OF_LABOR", "PERCENT_OF_REVENUE", "FLAT_AMOUNT", "EXCLUDED"]);
const ProposalMaterialLineTypeZ = z.enum(["CATALOG", "CUSTOM", "MANUAL_TOTAL"]);
const ProposalMaterialPriceSourceTypeZ = z.enum(["INVENTORY_DEFAULT", "EXPENSE_HISTORY", "MANUAL"]);
const ProposalUnitPriceRateSourceZ = z.enum(["SEEDED", "MANUAL", "HISTORICAL"]);
const ESTIMATE_ENGINE_VERSION = 2;

type ProposalPricingDefaults = {
  defaultLaborCostRate: number | null;
  defaultWcPercent: number;
  defaultDesiredProfitMarginPercent: number;
  defaultGeneralLiabilityMode: ProposalGeneralLiabilityMode;
  defaultGlPercent: number;
  defaultMassTaxRate: number;
  defaultFederalTaxRate: number;
  defaultWorkDayHours: number;
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

const proposalLaborLineInput = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  mode: ProposalLaborModeZ.default("HOURS"),
  workers: z.number().min(0).default(0),
  hoursPerWorker: z.number().min(0).nullable().optional(),
  days: z.number().min(0).nullable().optional(),
  hoursPerDay: z.number().min(0).nullable().optional(),
  hourlyCost: z.number().min(0).default(0),
  manualTotalOverride: z.number().min(0).nullable().optional(),
  internalNote: z.string().optional(),
});

const proposalSectionMaterialInput = z.object({
  key: z.string().min(1),
  inventoryItemId: z.number().int().positive().nullable().optional(),
  type: ProposalMaterialLineTypeZ.default("CUSTOM"),
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().min(0).nullable().optional(),
  unitCost: z.number().min(0).nullable().optional(),
  manualTotal: z.number().min(0).nullable().optional(),
  coveragePerUnit: z.number().positive().nullable().optional(),
  wastePercent: z.number().min(0).nullable().optional(),
  adjustedQuantity: z.number().min(0).nullable().optional(),
  note: z.string().optional(),
  priceSourceType: ProposalMaterialPriceSourceTypeZ.nullable().optional(),
  priceSourceLabel: z.string().optional(),
  priceSourceExpenseId: z.number().int().positive().nullable().optional(),
  priceSourceExpenseLineItemId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

const proposalUnitPriceInput = z.object({
  templateId: z.number().int().positive().nullable().optional(),
  serviceName: z.string().optional(),
  variantName: z.string().optional(),
  unitLabel: z.string().optional(),
  quantity: z.number().min(0).default(0),
  pricePerUnit: z.number().min(0).default(0),
  lineTotalOverride: z.number().min(0).nullable().optional(),
  laborAllowance: z.number().min(0).nullable().optional(),
  materialAllowance: z.number().min(0).nullable().optional(),
  note: z.string().optional(),
  rateSource: ProposalUnitPriceRateSourceZ.default("MANUAL"),
});

const proposalManualTotalInput = z.object({
  customerTotal: z.number().min(0).default(0),
  internalCost: z.number().min(0).nullable().optional(),
  note: z.string().optional(),
});

const proposalProductionInput = z.object({
  workCategory: z.string().optional(),
  surfaceType: z.string().optional(),
  measurementUnit: z.string().optional(),
  measurementValue: z.number().min(0).default(0),
  productionRateBasis: ProductionRateBasisZ.default("SQFT_PER_HOUR"),
  productionRateValue: z.number().min(0).default(0),
  calculatedLaborHours: z.number().min(0).nullable().optional(),
  adjustedLaborHours: z.number().min(0).nullable().optional(),
  crewSize: z.number().min(0).nullable().optional(),
  hoursPerDay: z.number().min(0).nullable().optional(),
  hourlyCostPerWorker: z.number().min(0).nullable().optional(),
  note: z.string().optional(),
  productionRateId: z.number().int().positive().nullable().optional(),
});

const proposalSectionInput = z.object({
  key: z.string().min(1),
  templateKey: z.string().optional(),
  title: z.string().min(1),
  customerTitle: z.string().optional(),
  description: z.string().optional(),
  bulletItems: z.array(z.string()).default([]),
  notes: z.string().optional(),
  sortOrder: z.number().int().default(0),
  areaName: z.string().optional(),
  phaseName: z.string().optional(),
  workCategoryLabel: z.string().optional(),
  estimateMethod: ProposalEstimateMethodZ.nullable().optional(),
  priceVisibilityMode: ProposalPriceVisibilityModeZ.default("ITEMIZED"),
  clientNotes: z.string().optional(),
  internalNotes: z.string().optional(),
  laborLines: z.array(proposalLaborLineInput).default([]),
  materials: z.array(proposalSectionMaterialInput).default([]),
  unitPrice: proposalUnitPriceInput.nullable().optional(),
  manualTotal: proposalManualTotalInput.nullable().optional(),
  production: proposalProductionInput.nullable().optional(),
});

const proposalOtherCostInput = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().min(0).default(0),
  includeInRecommendedPrice: z.boolean().default(true),
  internalNote: z.string().optional(),
});

const proposalInput = z.object({
  // Nullable: a Proposal can be created and estimated as an unlinked draft
  // ('Client not linked') before a Customer is selected or created.
  customerId: z.number().nullable().optional(),
  projectName: z.string().optional(),
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
  estimatePricingMethod: ProposalPricingMethodZ.nullable().optional(),
  estimateTargetMarginPercent: z.number().min(0).max(99.99).nullable().optional(),
  estimateTargetMarkupPercent: z.number().min(0).nullable().optional(),
  estimatePriceOverride: z.number().min(0).nullable().optional(),
  estimateSubcontractorCost: z.number().min(0).default(0),
  estimateEquipmentCost: z.number().min(0).default(0),
  estimateLogisticsCost: z.number().min(0).default(0),
  estimateMiscProjectCost: z.number().min(0).default(0),
  desiredProfitMarginPercent: z.number().min(0).max(99.99).nullable().optional(),
  workersCompPercentOverride: z.number().min(0).nullable().optional(),
  includeWorkersCompInRecommendedPrice: z.boolean().default(true),
  generalLiabilityMode: ProposalGeneralLiabilityModeZ.nullable().optional(),
  generalLiabilityPercent: z.number().min(0).nullable().optional(),
  generalLiabilityFlatAmount: z.number().min(0).nullable().optional(),
  includeGeneralLiabilityInRecommendedPrice: z.boolean().default(true),
  massTaxRate: z.number().min(0).nullable().optional(),
  federalTaxRate: z.number().min(0).nullable().optional(),
  showTaxPlanning: z.boolean().default(true),
  includeTaxReserveInRecommendedPrice: z.boolean().default(false),
  otherCosts: z.array(proposalOtherCostInput).default([]),
  estimateWorkItems: z.array(proposalSectionInput).default([]),
  expectedStartDate: z.date().nullable().optional(),
  expectedEndDate: z.date().nullable().optional(),
  sections: z.array(proposalSectionInput).default([]),
  options: z.array(proposalOptionInput).default([]),
  attachments: z.array(proposalAttachmentInput).default([]),
  paintColors: z.array(proposalPaintColorInput).default([]),
});

function sanitizeOtherCosts(input: z.infer<typeof proposalInput>) {
  const rows = input.otherCosts
    .filter((line) => line.label.trim().length > 0 || line.amount > 0)
    .map((line, index) => ({
      key: line.key || `other-${index}`,
      label: line.label.trim() || "Other cost",
      description: line.description?.trim() || null,
      amount: round2(line.amount),
      includeInRecommendedPrice: line.includeInRecommendedPrice,
      internalNote: line.internalNote?.trim() || null,
    }));

  if (rows.length > 0) return rows;

  return [
    { key: "subcontractors", label: "Subcontractors", description: null, amount: round2(input.estimateSubcontractorCost ?? 0), includeInRecommendedPrice: true, internalNote: null },
    { key: "equipment", label: "Equipment rentals", description: null, amount: round2(input.estimateEquipmentCost ?? 0), includeInRecommendedPrice: true, internalNote: null },
    { key: "travel", label: "Fuel and transportation", description: null, amount: round2(input.estimateLogisticsCost ?? 0), includeInRecommendedPrice: true, internalNote: null },
    { key: "misc", label: "Miscellaneous costs", description: null, amount: round2(input.estimateMiscProjectCost ?? 0), includeInRecommendedPrice: true, internalNote: null },
  ].filter((line) => line.amount > 0);
}

type SanitizedSection = {
  key: string;
  templateKey?: string;
  title: string;
  customerTitle?: string;
  description?: string;
  bulletItems: string[];
  notes?: string;
  sortOrder: number;
  areaName?: string;
  phaseName?: string;
  workCategoryLabel?: string;
  estimateMethod: ProposalEstimateMethod | null;
  priceVisibilityMode: ProposalPriceVisibilityMode;
  clientNotes?: string;
  internalNotes?: string;
  unitPriceTemplateId?: number;
  workItem: ProposalEstimateWorkItemInput | null;
  materials: Array<{
    key: string;
    inventoryItemId?: number;
    lineType: "CATALOG" | "CUSTOM" | "MANUAL_TOTAL";
    nameSnapshot: string;
    unitSnapshot: string;
    quantity: number;
    calculatedQuantity?: number | null;
    adjustedQuantity?: number | null;
    unitCostSnapshot: number;
    materialCostSnapshot: number;
    sellingPriceSnapshot: number;
    manualTotalAmount?: number | null;
    coveragePerUnitSnapshot?: number | null;
    wastePercentSnapshot?: number | null;
    internalNotes?: string;
    priceSourceType?: "INVENTORY_DEFAULT" | "EXPENSE_HISTORY" | "MANUAL" | null;
    priceSourceLabel?: string | null;
    priceSourceExpenseId?: number | null;
    priceSourceExpenseLineItemId?: number | null;
    sortOrder: number;
  }>;
};

export function sanitizeSections(
  sections: z.infer<typeof proposalSectionInput>[],
  defaults: ProposalPricingDefaults
) {
  return sections
    .filter((section) =>
      section.title.trim().length > 0
      || section.description?.trim()
      || section.notes?.trim()
      || section.bulletItems.some((item) => item.trim().length > 0)
    )
    .map((section, index): SanitizedSection => {
      const measurementValue = section.production?.measurementValue ?? 0;
      const materials = section.materials
        .filter((line) => line.name.trim().length > 0)
        .map((line, materialIndex) => {
          const quantitySnapshot =
            line.type !== "MANUAL_TOTAL" && line.coveragePerUnit != null && measurementValue > 0
              ? {
                  calculatedQuantity: round2(
                    (measurementValue / line.coveragePerUnit) * (1 + ((line.wastePercent ?? 0) / 100))
                  ),
                  effectiveQuantity: line.adjustedQuantity ?? round2(
                    (measurementValue / line.coveragePerUnit) * (1 + ((line.wastePercent ?? 0) / 100))
                  ),
                }
              : {
                  calculatedQuantity: null,
                  effectiveQuantity: line.adjustedQuantity ?? line.quantity ?? (line.type === "MANUAL_TOTAL" ? 1 : 0),
                };
          const effectiveQuantity = quantitySnapshot.effectiveQuantity ?? 0;
          const unitCost = round2(line.unitCost ?? 0);
          const manualTotal = line.manualTotal == null ? null : round2(line.manualTotal);
          const materialCostSnapshot = line.type === "MANUAL_TOTAL"
            ? round2(manualTotal ?? 0)
            : round2(effectiveQuantity * unitCost);

          return {
            key: line.key,
            inventoryItemId: line.inventoryItemId ?? undefined,
            lineType: line.type,
            nameSnapshot: line.name.trim(),
            unitSnapshot: line.unit.trim() || "unit",
            quantity: line.type === "MANUAL_TOTAL" ? 1 : round2(effectiveQuantity),
            calculatedQuantity: quantitySnapshot.calculatedQuantity,
            adjustedQuantity: line.adjustedQuantity ?? null,
            unitCostSnapshot: unitCost,
            materialCostSnapshot,
            sellingPriceSnapshot: materialCostSnapshot,
            manualTotalAmount: manualTotal,
            coveragePerUnitSnapshot: line.coveragePerUnit ?? null,
            wastePercentSnapshot: line.wastePercent ?? 0,
            internalNotes: line.note?.trim() || undefined,
            priceSourceType: line.priceSourceType ?? null,
            priceSourceLabel: line.priceSourceLabel?.trim() || null,
            priceSourceExpenseId: line.priceSourceExpenseId ?? null,
            priceSourceExpenseLineItemId: line.priceSourceExpenseLineItemId ?? null,
            sortOrder: line.sortOrder ?? materialIndex,
          };
        });

      const estimateMethod = section.estimateMethod ?? null;
      const workItem = estimateMethod == null
        ? null
        : {
            key: section.key,
            title: section.title.trim() || `Scope Item ${index + 1}`,
            customerTitle: section.customerTitle?.trim() || null,
            description: section.description?.trim() || null,
            areaName: section.areaName?.trim() || null,
            phaseName: section.phaseName?.trim() || null,
            workCategoryLabel: section.workCategoryLabel?.trim() || null,
            estimateMethod,
            priceVisibility: section.priceVisibilityMode,
            internalNotes: section.internalNotes?.trim() || null,
            clientNotes: section.clientNotes?.trim() || null,
            laborLines: section.laborLines.map((line, laborIndex) => ({
              key: line.key || `${section.key}-labor-${laborIndex}`,
              label: line.label?.trim() || "Labor",
              mode: line.mode,
              workers: line.workers,
              hoursPerWorker: line.hoursPerWorker ?? null,
              days: line.days ?? null,
              hoursPerDay: line.hoursPerDay ?? null,
              hourlyCost: line.hourlyCost || defaults.defaultLaborCostRate || 0,
              manualTotalOverride: line.manualTotalOverride ?? null,
              internalNote: line.internalNote?.trim() || null,
            })),
            materials: section.materials.map((line, materialIndex) => ({
              key: line.key || `${section.key}-material-${materialIndex}`,
              type: line.type,
              inventoryItemId: line.inventoryItemId ?? null,
              name: line.name.trim(),
              unit: line.unit.trim() || "unit",
              quantity: line.quantity ?? null,
              unitCost: line.unitCost ?? 0,
              manualTotal: line.manualTotal ?? null,
              coveragePerUnit: line.coveragePerUnit ?? null,
              wastePercent: line.wastePercent ?? 0,
              adjustedQuantity: line.adjustedQuantity ?? null,
              note: line.note?.trim() || null,
              priceSourceType: line.priceSourceType ?? null,
              priceSourceLabel: line.priceSourceLabel?.trim() || null,
              priceSourceExpenseId: line.priceSourceExpenseId ?? null,
              priceSourceExpenseLineItemId: line.priceSourceExpenseLineItemId ?? null,
            })),
            unitPrice: section.unitPrice
              ? {
                  templateId: section.unitPrice.templateId ?? null,
                  serviceName: section.unitPrice.serviceName?.trim() || "",
                  variantName: section.unitPrice.variantName?.trim() || "",
                  unitLabel: section.unitPrice.unitLabel?.trim() || "",
                  quantity: section.unitPrice.quantity,
                  pricePerUnit: section.unitPrice.pricePerUnit,
                  lineTotalOverride: section.unitPrice.lineTotalOverride ?? null,
                  laborAllowance: section.unitPrice.laborAllowance ?? null,
                  materialAllowance: section.unitPrice.materialAllowance ?? null,
                  note: section.unitPrice.note?.trim() || null,
                  rateSource: section.unitPrice.rateSource,
                }
              : null,
            manualTotal: section.manualTotal
              ? {
                  customerTotal: section.manualTotal.customerTotal,
                  internalCost: section.manualTotal.internalCost ?? null,
                  note: section.manualTotal.note?.trim() || null,
                }
              : null,
            production: section.production
              ? {
                  workCategory: section.production.workCategory?.trim() || null,
                  surfaceType: section.production.surfaceType?.trim() || null,
                  measurementUnit: section.production.measurementUnit?.trim() || null,
                  measurementValue: section.production.measurementValue,
                  productionRateBasis: section.production.productionRateBasis,
                  productionRateValue: section.production.productionRateValue,
                  calculatedLaborHours: section.production.calculatedLaborHours ?? null,
                  adjustedLaborHours: section.production.adjustedLaborHours ?? null,
                  crewSize: section.production.crewSize ?? null,
                  hoursPerDay: section.production.hoursPerDay ?? null,
                  hourlyCostPerWorker: section.production.hourlyCostPerWorker ?? defaults.defaultLaborCostRate ?? 0,
                  note: section.production.note?.trim() || null,
                }
              : null,
          } satisfies ProposalEstimateWorkItemInput;

      return {
        key: section.key,
        templateKey: section.templateKey?.trim() || undefined,
        title: section.title.trim() || `Section ${index + 1}`,
        customerTitle: section.customerTitle?.trim() || undefined,
        description: section.description?.trim() || undefined,
        bulletItems: section.bulletItems.map((item) => item.trim()).filter(Boolean),
        notes: section.notes?.trim() || undefined,
        sortOrder: section.sortOrder ?? index,
        areaName: section.areaName?.trim() || undefined,
        phaseName: section.phaseName?.trim() || undefined,
        workCategoryLabel: section.workCategoryLabel?.trim() || undefined,
        estimateMethod,
        priceVisibilityMode: section.priceVisibilityMode,
        clientNotes: section.clientNotes?.trim() || undefined,
        internalNotes: section.internalNotes?.trim() || undefined,
        unitPriceTemplateId: section.unitPrice?.templateId ?? undefined,
        workItem,
        materials,
      };
    });
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

function extractExampleHeadings(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      if (/^[•\-]/.test(line)) return false;
      if (/^\d+[.)]/.test(line)) return false;
      if (line.length > 80) return false;
      return /[A-Za-z]/.test(line) && /^[A-Z][A-Za-z0-9 &/:-]+$/.test(line);
    });
}

function extractSearchTerms(lines: string[]) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "into",
    "about",
    "will",
    "are",
    "been",
    "be",
    "our",
    "your",
    "their",
    "home",
    "project",
    "proposal",
    "paint",
    "painting",
    "work",
    "room",
  ]);

  const words = new Set<string>();
  for (const line of lines) {
    for (const word of line.toLowerCase().split(/[^a-z0-9]+/)) {
      if (!word || word.length < 3 || stopWords.has(word)) continue;
      words.add(word);
    }
  }
  return Array.from(words).slice(0, 12);
}

function buildExampleBlueprint(examples: Array<{ title: string; fullProposalContent: string }>) {
  const headings = new Map<string, number>();
  const stylePhrases = new Map<string, number>();

  for (const example of examples) {
    const exampleHeadings = extractExampleHeadings(example.fullProposalContent);
    for (const heading of exampleHeadings) {
      headings.set(heading, (headings.get(heading) || 0) + 1);
    }

    const content = example.fullProposalContent.toLowerCase();
    ["daily cleanup", "protect floors", "final walkthrough", "price validity", "important note", "payment schedule"].forEach((phrase) => {
      if (content.includes(phrase)) {
        stylePhrases.set(phrase, (stylePhrases.get(phrase) || 0) + 1);
      }
    });
  }

  return {
    headings: Array.from(headings.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([heading]) => heading),
    hasImportantNotes: stylePhrases.has("important note"),
    hasPriceValidity: stylePhrases.has("price validity"),
    hasPaymentSchedule: stylePhrases.has("payment schedule"),
    hasScopeStandards: stylePhrases.has("protect floors") || stylePhrases.has("daily cleanup") || stylePhrases.has("final walkthrough"),
  };
}

function scoreExampleRelevance(example: {
  title: string;
  description: string | null;
  fullProposalContent: string;
  tags: string[];
  proposalCategory: string;
  proposalType: string | null;
}, terms: string[], category: string) {
  const content = `${example.title}\n${example.description || ""}\n${example.fullProposalContent}\n${example.tags.join(" ")}`.toLowerCase();
  let score = 0;
  if (example.proposalCategory === category) score += 8;
  if (example.proposalType) score += 1;
  for (const term of terms) {
    if (!term) continue;
    if (content.includes(term.toLowerCase())) score += 2;
    if (example.tags.some((tag) => tag.toLowerCase().includes(term.toLowerCase()))) score += 3;
  }
  if (content.includes("scope of work")) score += 1;
  if (content.includes("option")) score += 1;
  if (content.includes("closing")) score += 1;
  return score;
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

async function getProposalPricingDefaults(ctx: { prisma: any }) {
  const config = await ctx.prisma.config.findUnique({ where: { id: 1 } });
  return {
    defaultLaborCostRate: config?.defaultLaborCostRate != null && Number(config.defaultLaborCostRate) > 0 ? Number(config.defaultLaborCostRate) : 23,
    defaultWcPercent: config ? Number(config.defaultWcPercent) : 3.5,
    defaultDesiredProfitMarginPercent: config ? Number(config.defaultDesiredProfitMarginPercent ?? 35) : 35,
    defaultGeneralLiabilityMode: (config?.defaultGeneralLiabilityMode ?? "PERCENT_OF_REVENUE") as ProposalGeneralLiabilityMode,
    defaultGlPercent: config?.defaultGlPercent != null && Number(config.defaultGlPercent) > 0 ? Number(config.defaultGlPercent) : 1,
    defaultMassTaxRate: config ? Number(config.defaultMassTaxRate ?? 5) : 5,
    defaultFederalTaxRate: config ? Number(config.defaultFederalTaxRate ?? 12) : 12,
    defaultWorkDayHours: config ? Number(config.defaultWorkDayHours ?? 8) : 8,
  };
}

function guardCustomerLinkedForStatus(customerId: number | null, status: "sent" | "approved") {
  try {
    assertCustomerLinked({ customerId }, status === "sent" ? "send" : "approve");
  } catch (error) {
    if (error instanceof ProposalNotLinkedError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}

function runSanitizeSections(
  sections: z.infer<typeof proposalSectionInput>[],
  defaults: ProposalPricingDefaults
) {
  return sanitizeSections(sections, defaults);
}

export function buildAuthoritativeProposalEstimate(
  sections: ReturnType<typeof sanitizeSections>,
  input: z.infer<typeof proposalInput>,
  defaults: ProposalPricingDefaults
) {
  const proposalLevelItems = sanitizeSections(input.estimateWorkItems, defaults);
  const sanitizedByKey = new Map([...sections, ...proposalLevelItems].map((section) => [section.key, section] as const));
  const workItems = Array.from(sanitizedByKey.values())
    .map((section) => section.workItem)
    .filter((section): section is ProposalEstimateWorkItemInput => section != null);
  const hasEstimatorData = workItems.length > 0 || sanitizeOtherCosts(input).length > 0;
  if (!hasEstimatorData) return null;

  const estimateRequest: ProposalEstimateRequest = {
    workItems,
    settings: {
      desiredProfitMarginPercent: input.desiredProfitMarginPercent ?? input.estimateTargetMarginPercent ?? defaults.defaultDesiredProfitMarginPercent,
      finalPriceOverride: input.estimatePriceOverride ?? null,
      workersCompPercent: input.workersCompPercentOverride ?? defaults.defaultWcPercent,
      includeWorkersCompInRecommendedPrice: input.includeWorkersCompInRecommendedPrice,
      generalLiabilityMode: (input.generalLiabilityMode ?? defaults.defaultGeneralLiabilityMode) as ProposalGeneralLiabilityMode,
      generalLiabilityPercent: input.generalLiabilityPercent ?? defaults.defaultGlPercent,
      generalLiabilityFlatAmount: input.generalLiabilityFlatAmount ?? null,
      includeGeneralLiabilityInRecommendedPrice: input.includeGeneralLiabilityInRecommendedPrice,
      massTaxRate: input.massTaxRate ?? defaults.defaultMassTaxRate,
      federalTaxRate: input.federalTaxRate ?? defaults.defaultFederalTaxRate,
      showTaxPlanning: input.showTaxPlanning,
      includeTaxReserveInRecommendedPrice: input.includeTaxReserveInRecommendedPrice,
      defaultWorkDayHours: defaults.defaultWorkDayHours,
      otherCosts: sanitizeOtherCosts(input),
    },
  };

  return {
    estimateRequest,
    estimate: computeProposalEstimate(estimateRequest),
  };
}

export function buildProposalEstimatePersistence(
  authoritative: ReturnType<typeof buildAuthoritativeProposalEstimate>,
  input: z.infer<typeof proposalInput>,
  defaults: ProposalPricingDefaults
) {
  if (!authoritative) {
    return {
      estimateEngineVersion: null,
      estimatePricingMethod: null,
      estimateTargetMarginPercent: null,
      estimateTargetMarkupPercent: null,
      estimateOverheadPercentSnapshot: null,
      estimateOverheadDollars: null,
      estimateRecommendedSellingPrice: null,
      estimatePriceOverride: null,
      estimateFinalProposalPrice: null,
      estimateDirectLaborCost: null,
      estimateLaborBurdenCost: null,
      estimateLoadedLaborCost: null,
      estimateMaterialCost: null,
      estimateSubcontractorCost: null,
      estimateEquipmentCost: null,
      estimateLogisticsCost: null,
      estimateMiscProjectCost: null,
      estimateDirectProjectCost: null,
      estimateTrueJobCost: null,
      estimateGrossProfitDollars: null,
      estimateGrossMarginPercent: null,
      estimateEffectiveSalesRate: null,
      estimatePainterHoursTotal: null,
      estimateSummaryJson: Prisma.DbNull,
    };
  }

  const { estimateRequest, estimate } = authoritative;
  const totalPainterHours = round2(estimate.workItems.reduce((sum, item) => sum + item.totalWorkerHours, 0));
  const otherCostByKey = Object.fromEntries(estimate.otherCosts.map((line) => [line.key, line.amount]));
  return {
    estimateEngineVersion: ESTIMATE_ENGINE_VERSION,
    estimatePricingMethod: "GROSS_MARGIN" as const,
    estimateTargetMarginPercent: estimate.desiredProfitMarginPercent,
    estimateTargetMarkupPercent: null,
    estimateOverheadPercentSnapshot: null,
    estimateOverheadDollars: null,
    estimateRecommendedSellingPrice: estimate.recommendedCustomerPrice,
    estimatePriceOverride: input.estimatePriceOverride ?? null,
    estimateFinalProposalPrice: estimate.finalCustomerPrice,
    estimateDirectLaborCost: estimate.directLaborCost,
    estimateLaborBurdenCost: round2(estimate.workersCompAmount + estimate.generalLiabilityAmount),
    estimateLoadedLaborCost: round2(estimate.directLaborCost + estimate.workersCompAmount + estimate.generalLiabilityAmount),
    estimateMaterialCost: estimate.materialsCost,
    estimateSubcontractorCost: otherCostByKey.subcontractors ?? 0,
    estimateEquipmentCost: otherCostByKey.equipment ?? 0,
    estimateLogisticsCost: otherCostByKey.travel ?? 0,
    estimateMiscProjectCost: otherCostByKey.misc ?? 0,
    estimateDirectProjectCost: round2(estimate.directLaborCost + estimate.materialsCost + estimate.otherDirectCosts),
    estimateTrueJobCost: estimate.totalInternalCost,
    estimateGrossProfitDollars: estimate.actualProfit,
    estimateGrossMarginPercent: estimate.actualMarginPercent,
    estimateEffectiveSalesRate: totalPainterHours > 0 ? round2(estimate.finalCustomerPrice / totalPainterHours) : null,
    estimatePainterHoursTotal: totalPainterHours,
    estimateSummaryJson: toPrismaJson({
      input: estimateRequest,
      draftWorkItems: input.estimateWorkItems,
      summary: estimate,
      defaults,
    }),
  };
}

function buildSectionCreateData(
  s: ReturnType<typeof sanitizeSections>[number],
  index: number,
  authoritative: ReturnType<typeof buildAuthoritativeProposalEstimate>
) {
  const workItem = authoritative?.estimate.workItems.find((item) => item.key === s.key) ?? null;
  const workersCompPercent = authoritative?.estimate.workersCompPercent ?? null;
  const wcCostSnapshot = workItem && workersCompPercent != null ? round2(workItem.directLaborCost * (workersCompPercent / 100)) : null;
  return {
    templateKey: s.templateKey,
    title: s.title,
    description: s.description,
    bulletItems: s.bulletItems,
    notes: s.notes,
    sortOrder: s.sortOrder ?? index,
    estimatedLaborHours: workItem?.totalWorkerHours ?? null,
    laborSellRateSnapshot: null,
    laborCostRateSnapshot: null,
    laborSellingPriceSnapshot: workItem?.allocatedCustomerPrice ?? 0,
    materialsCostSnapshot: workItem?.materialsCost ?? 0,
    materialsSellingPriceSnapshot: workItem?.materialsCost ?? 0,
    additionalCharges: 0,
    scopeSubtotalSnapshot: workItem?.allocatedCustomerPrice ?? 0,
    areaName: s.areaName,
    workCategory: null,
    surfaceType: workItem?.production?.surfaceType ?? null,
    measurementType: workItem?.production?.measurementUnit ?? null,
    measurementValue: workItem?.production?.measurementValue ?? null,
    coats: null,
    prepLevel: null,
    productionRateId: null,
    calculatedLaborHours: workItem?.production?.calculatedLaborHours ?? null,
    adjustedLaborHours: workItem?.production?.adjustedLaborHours ?? null,
    effectiveLaborHours: workItem?.production?.effectiveLaborHours ?? workItem?.totalWorkerHours ?? null,
    directLaborCostRateSnapshot: null,
    wcPercentSnapshot: workersCompPercent,
    wcCostSnapshot,
    otherLaborBurdenPercentSnapshot: null,
    otherLaborBurdenCostSnapshot: null,
    directLaborCostSnapshot: workItem?.directLaborCost ?? null,
    laborBurdenCostSnapshot: wcCostSnapshot,
    loadedLaborCostSnapshot: workItem ? round2(workItem.directLaborCost + (wcCostSnapshot ?? 0)) : null,
    sectionSellingPriceSnapshot: workItem?.allocatedCustomerPrice ?? null,
    customerDisplayLabel: s.customerTitle,
    priceVisibility: workItem?.priceVisibility === "HIDDEN" ? "HIDE" : "SHOW",
    groupIntoAreaPrice: workItem?.priceVisibility === "GROUPED",
    phaseName: s.phaseName,
    workCategoryLabel: s.workCategoryLabel,
    clientNotes: s.clientNotes,
    internalNotes: s.internalNotes,
    estimateMethod: s.estimateMethod,
    priceVisibilityMode: s.priceVisibilityMode,
    estimateDataJson: workItem ? toPrismaJson({ input: s.workItem, output: workItem }) : undefined,
    unitPriceTemplateId: s.unitPriceTemplateId,
    materials: s.materials.length
      ? {
          create: s.materials.map((m, mIndex) => ({
            inventoryItemId: m.inventoryItemId,
            nameSnapshot: m.nameSnapshot,
            unitSnapshot: m.unitSnapshot,
            quantity: m.quantity,
            calculatedQuantity: m.calculatedQuantity,
            adjustedQuantity: m.adjustedQuantity,
            unitCostSnapshot: m.unitCostSnapshot,
            coveragePerUnitSnapshot: m.coveragePerUnitSnapshot,
            wastePercentSnapshot: m.wastePercentSnapshot,
            markupPercentSnapshot: 0,
            materialCostSnapshot: m.materialCostSnapshot,
            sellingPriceSnapshot: m.sellingPriceSnapshot,
            lineType: m.lineType,
            manualTotalAmount: m.manualTotalAmount,
            internalNotes: m.internalNotes,
            priceSourceType: m.priceSourceType,
            priceSourceLabel: m.priceSourceLabel,
            priceSourceExpenseId: m.priceSourceExpenseId,
            priceSourceExpenseLineItemId: m.priceSourceExpenseLineItemId,
            sortOrder: m.sortOrder ?? mIndex,
          })),
        }
      : undefined,
  };
}

export function buildProposalEstimateSnapshotFromSavedProposal(proposal: {
  totalAmount: unknown;
  estimateFinalProposalPrice?: unknown;
  estimateSummaryJson?: unknown;
  sections: Array<{
    title: string;
    estimatedLaborHours: unknown;
    laborSellRateSnapshot: unknown;
    laborSellingPriceSnapshot: unknown;
    materialsCostSnapshot: unknown;
    materialsSellingPriceSnapshot: unknown;
    additionalCharges: unknown;
    scopeSubtotalSnapshot: unknown;
    materials: Array<{
      nameSnapshot: string;
      unitSnapshot: string;
      quantity: unknown;
      unitCostSnapshot: unknown;
      materialCostSnapshot: unknown;
      sellingPriceSnapshot: unknown;
    }>;
  }>;
}): ProposalEstimateSnapshot {
  const estimateSummaryJson = isJsonObject(proposal.estimateSummaryJson) ? proposal.estimateSummaryJson : null;
  const summary = estimateSummaryJson && isJsonObject(estimateSummaryJson.summary) ? estimateSummaryJson.summary : null;
  const summaryWorkItems = Array.isArray(summary?.workItems) ? summary.workItems.filter(isJsonObject) : [];

  if (summaryWorkItems.length) {
    return {
      scopes: summaryWorkItems.map((item) => ({
        title: String(item.title ?? "Scope"),
        laborHours: item.totalWorkerHours != null ? Number(item.totalWorkerHours) : null,
        laborSellRate: null,
        laborSellingPrice: Number(item.allocatedCustomerPrice ?? 0),
        materials: Array.isArray(item.materialLines)
          ? item.materialLines.filter(isJsonObject).map((material) => ({
              name: String(material.name ?? "Material"),
              unit: String(material.unit ?? "unit"),
              quantity: Number(material.quantity ?? 0),
              unitCost: Number(material.unitCost ?? 0),
              materialCost: Number(material.lineTotal ?? 0),
              sellingPrice: Number(material.lineTotal ?? 0),
            }))
          : [],
        materialsCost: Number(item.materialsCost ?? 0),
        materialsSellingPrice: Number(item.materialsCost ?? 0),
        additionalCharges: 0,
        subtotal: Number(item.allocatedCustomerPrice ?? 0),
      })),
      totalAmount: Number(proposal.estimateFinalProposalPrice ?? proposal.totalAmount),
    };
  }

  return {
    scopes: proposal.sections.map((section) => ({
      title: section.title,
      laborHours: section.estimatedLaborHours != null ? Number(section.estimatedLaborHours) : null,
      laborSellRate: section.laborSellRateSnapshot != null ? Number(section.laborSellRateSnapshot) : null,
      laborSellingPrice: Number(section.laborSellingPriceSnapshot),
      materials: section.materials.map((m) => ({
        name: m.nameSnapshot,
        unit: m.unitSnapshot,
        quantity: Number(m.quantity),
        unitCost: Number(m.unitCostSnapshot),
        materialCost: Number(m.materialCostSnapshot),
        sellingPrice: Number(m.sellingPriceSnapshot),
      })),
      materialsCost: Number(section.materialsCostSnapshot),
      materialsSellingPrice: Number(section.materialsSellingPriceSnapshot),
      additionalCharges: Number(section.additionalCharges),
      subtotal: Number(section.scopeSubtotalSnapshot),
    })),
    totalAmount: Number(proposal.estimateFinalProposalPrice ?? proposal.totalAmount),
  };
}

export const proposalsRouter = router({
  list: protectedProcedure
    .input(z.object({ visibility: ProposalVisibilityZ.optional() }).optional())
    .query(({ ctx, input }) => {
      const visibility = input?.visibility ?? "active";
      const where: any = {};
      if (visibility === "active") where.deletedAt = null;
      if (visibility === "archived") where.deletedAt = { not: null };

      return ctx.prisma.proposal.findMany({
        where,
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
      });
    }),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.proposal.findUnique({
      where: { id: input.id },
      include: {
        customer: true,
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { materials: { orderBy: { sortOrder: "asc" } } },
        },
        options: { orderBy: { sortOrder: "asc" } },
        attachments: { orderBy: { sortOrder: "asc" } },
        paintColors: { orderBy: { sortOrder: "asc" } },
      },
    })
  ),

  delete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.proposal.update({ where: { id: input.id }, data: { deletedAt: new Date() } })
  ),

  create: adminProcedure.input(proposalInput).mutation(async ({ ctx, input }) => {
    const [last, config] = await Promise.all([
      ctx.prisma.proposal.findFirst({ orderBy: { id: "desc" }, select: { proposalNumber: true } }),
      getProposalPricingDefaults(ctx),
    ]);

    if (input.status === "sent" || input.status === "approved") {
      guardCustomerLinkedForStatus(input.customerId ?? null, input.status);
    }

    const proposalNumber = nextNumber("PROP", last?.proposalNumber);
    const budgetTotal = input.materialsBudget + input.laborBudget + input.subcontractorBudget;
    const sanitizedSections = runSanitizeSections(input.sections, config);
    const sanitizedOptions = sanitizeOptions(input.options);
    const sanitizedAttachments = sanitizeAttachments(input.attachments);
    const sanitizedPaintColors = sanitizePaintColors(input.paintColors);
    const authoritativeEstimate = buildAuthoritativeProposalEstimate(sanitizedSections, input, config);
    const estimatePersistence = buildProposalEstimatePersistence(authoritativeEstimate, input, config);

    const normalizedProjectName = input.projectName?.trim() || "Untitled Proposal";
    const finalTotalAmount = authoritativeEstimate?.estimate.finalCustomerPrice ?? input.totalAmount ?? budgetTotal;

    return ctx.prisma.proposal.create({
      data: {
        customerId: input.customerId ?? null,
        projectName: normalizedProjectName,
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
        totalAmount: finalTotalAmount,
        ...estimatePersistence,
        expectedStartDate: input.expectedStartDate ?? null,
        expectedEndDate: input.expectedEndDate ?? null,
        sentAt: input.status === "sent" ? new Date() : null,
        approvedAt: input.status === "approved" ? new Date() : null,
        sections: sanitizedSections.length
          ? {
              create: sanitizedSections.map((section, index) => buildSectionCreateData(section, index, authoritativeEstimate)),
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
        sections: { orderBy: { sortOrder: "asc" }, include: { materials: { orderBy: { sortOrder: "asc" } } } },
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
        select: { status: true, sentAt: true, approvedAt: true, customerId: true },
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

      const nextCustomerId = input.data.customerId ?? current.customerId ?? null;
      if (input.data.status === "sent" || input.data.status === "approved") {
        guardCustomerLinkedForStatus(nextCustomerId, input.data.status);
      }

      const config = await getProposalPricingDefaults(ctx);
      const budgetTotal = input.data.materialsBudget + input.data.laborBudget + input.data.subcontractorBudget;
      const sanitizedSections = runSanitizeSections(input.data.sections, config);
      const sanitizedOptions = sanitizeOptions(input.data.options);
      const sanitizedAttachments = sanitizeAttachments(input.data.attachments);
      const sanitizedPaintColors = sanitizePaintColors(input.data.paintColors);
      const authoritativeEstimate = buildAuthoritativeProposalEstimate(sanitizedSections, input.data, config);
      const estimatePersistence = buildProposalEstimatePersistence(authoritativeEstimate, input.data, config);
      const finalTotalAmount = authoritativeEstimate?.estimate.finalCustomerPrice ?? input.data.totalAmount ?? budgetTotal;

      return ctx.prisma.proposal.update({
        where: { id: input.id },
        data: {
          customerId: input.data.customerId ?? null,
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
          totalAmount: finalTotalAmount,
          ...estimatePersistence,
          expectedStartDate: input.data.expectedStartDate ?? null,
          expectedEndDate: input.data.expectedEndDate ?? null,
          sentAt: input.data.status === "sent" && !current.sentAt ? new Date() : current.sentAt,
          approvedAt: input.data.status === "approved" && !current.approvedAt ? new Date() : current.approvedAt,
          sections: {
            deleteMany: {},
            create: sanitizedSections.map((section, index) => buildSectionCreateData(section, index, authoritativeEstimate)),
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
          sections: { orderBy: { sortOrder: "asc" }, include: { materials: { orderBy: { sortOrder: "asc" } } } },
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
        select: { status: true, sentAt: true, approvedAt: true, customerId: true },
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

      if (input.status === "sent" || input.status === "approved") {
        guardCustomerLinkedForStatus(current.customerId, input.status);
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

  /** Search-and-select or create-and-link happens client side via customers.create; this only links an existing customer. */
  linkClient: adminProcedure
    .input(z.object({ id: z.number(), customerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.prisma.proposal.findUnique({ where: { id: input.id }, select: { status: true } });
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
      if (proposal.status === "converted") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Converted proposals are read-only." });
      }
      const customer = await ctx.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });

      return ctx.prisma.proposal.update({
        where: { id: input.id },
        data: { customerId: input.customerId },
        include: { customer: true },
      });
    }),

  /**
   * Converts an accepted Proposal into a Job, preserving the estimated labor
   * hours, estimated material quantities/costs, estimated labor/material
   * selling prices, and proposal total exactly as saved — never recalculated
   * from current catalog/settings. Reuses existing Job/JobMaterial/JobLabor
   * columns, so no Job schema changes are required.
   */
  convertToJob: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const proposal = await ctx.prisma.proposal.findUnique({
      where: { id: input.id },
      include: { sections: { include: { materials: true }, orderBy: { sortOrder: "asc" } } },
    });

    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    if (proposal.status === "converted") {
      throw new TRPCError({ code: "FORBIDDEN", message: "This proposal has already been converted to a Job." });
    }

    try {
      assertCustomerLinked({ customerId: proposal.customerId }, "convert_to_job");
    } catch (error) {
      if (error instanceof ProposalNotLinkedError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      throw error;
    }

    const snapshot = buildProposalEstimateSnapshotFromSavedProposal(proposal);

    const seed = buildJobEstimateFromProposal(snapshot);

    const job = await ctx.prisma.$transaction(async (tx) => {
      // Re-check + flip status inside the transaction so two concurrent conversions
      // cannot both pass the earlier check and create duplicate Jobs.
      const claimed = await tx.proposal.updateMany({
        where: { id: proposal.id, status: { not: "converted" } },
        data: { status: "converted" },
      });
      if (claimed.count !== 1) {
        throw new TRPCError({ code: "CONFLICT", message: "This proposal has already been converted to a Job." });
      }

      const last = await tx.job.findFirst({ orderBy: { id: "desc" }, select: { estimateNumber: true } });
      const estimateNumber = nextNumber("EST", last?.estimateNumber);

      const createdJob = await tx.job.create({
        data: {
          customerId: proposal.customerId as number,
          estimateNumber,
          name: proposal.projectName,
          address: proposal.address,
          city: proposal.city,
          state: proposal.state,
          zipCode: proposal.zipCode,
          scopeOfWork: proposal.scopeOfWork,
          materialsBudget: seed.materialsBudget,
          laborBudget: seed.laborBudget,
          totalEstimate: seed.totalEstimate,
          contractAmount: seed.totalEstimate,
        },
      });

      if (seed.materials.length) {
        await tx.jobMaterial.createMany({
          data: seed.materials.map((m) => ({
            jobId: createdJob.id,
            name: m.name,
            quantity: m.quantity,
            unit: m.unit,
            unitCost: m.unitCost,
            totalCost: m.totalCost,
          })),
        });
      }

      if (seed.labor.length) {
        await tx.jobLabor.createMany({
          data: seed.labor.map((l) => ({
            jobId: createdJob.id,
            role: l.role,
            hours: l.hours,
            hourlyCost: l.hourlyCost,
            totalCost: l.totalCost,
          })),
        });
      }

      return createdJob;
    });

    return job;
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
      const searchTerms = extractSearchTerms([...lines, customerName, projectName]);

      const selectedExamples = input.selectedExampleIds.length
        ? await ctx.prisma.proposalExample.findMany({
            where: { id: { in: input.selectedExampleIds } },
            orderBy: { updatedAt: "desc" },
          })
        : ((await ctx.prisma.proposalExample.findMany({
            take: 200,
            orderBy: { updatedAt: "desc" },
          }))
            .map((example) => ({
              ...example,
              _score: scoreExampleRelevance(example, searchTerms, proposalCategory),
            }))
            .sort((a, b) => b._score - a._score || b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, 3)
            .map(({ _score, ...example }) => example));

      const exampleBlueprint = buildExampleBlueprint(selectedExamples);

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
        exampleBlueprint.hasScopeStandards ? "Protection of floors, furniture, and adjacent finishes is maintained throughout production." : "",
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
        const sectionOrder = exampleBlueprint.headings;
        const sectionTitle = (candidates: string[], fallback: string) => sectionOrder.find((heading) => candidates.some((candidate) => heading.toLowerCase() === candidate.toLowerCase())) || fallback;

        pushSection("scope_of_work", sectionTitle(["scope of work", "scope"], "Scope of Work"), "", uniqueSentences(scopeBullets));
        if (structuredOptions.length) {
          pushSection(
            "optional_upgrades",
            sectionTitle(["optional upgrades", "options", "option"], "Optional Upgrades"),
            "",
            structuredOptions.map((option, index) => {
              const priceText = option.price == null ? "Investment TBD" : option.price.toLocaleString("en-US", { style: "currency", currency: "USD" });
              return `${index + 1}. ${option.title} - ${priceText}${option.description ? ` (${option.description})` : ""}`;
            })
          );
        }
        pushSection(
          "paint_specifications",
          sectionTitle(["paint specifications", "paint products", "materials"], "Paint Specifications"),
          "",
          uniqueSentences([
            productBySurface.walls ? `Wall surfaces: ${productBySurface.walls}.` : "",
            productBySurface.ceilings ? `Ceiling surfaces: ${productBySurface.ceilings}.` : "",
            productBySurface.trimDoors ? `Trim and doors: ${productBySurface.trimDoors}.` : "",
          ])
        );
        if (exampleBlueprint.hasScopeStandards || scopeStandards.length) {
          pushSection("scope_standards", sectionTitle(["scope standards", "standards"], "Scope Standards"), "", scopeStandards);
        }
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

        if (exampleBlueprint.hasScopeStandards || scopeStandards.length) {
          pushSection("scope_standards", "Scope Standards", "", scopeStandards);
        }
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
        if (exampleBlueprint.hasScopeStandards || scopeStandards.length) {
          pushSection("scope_standards", "Scope Standards", "", scopeStandards);
        }
      }

      if (paymentSchedule || exampleBlueprint.hasPaymentSchedule) {
        pushSection("payment_schedule", "Payment Schedule", paymentSchedule || "", []);
      }

      if (archetype === "deck_restoration" || archetype === "pergola_restoration") {
        pushSection("attachments", "Attachments", "", attachmentBullets);
      }

      if (exampleBlueprint.hasPriceValidity) {
        pushSection(
          "price_validity",
          "Price Validity",
          "",
          [
            "This proposal is valid for 60 days from the proposal date.",
            "Projects beginning more than six (6) months after the proposal date may require pricing adjustments due to labor and material cost changes.",
          ]
        );
      }

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
