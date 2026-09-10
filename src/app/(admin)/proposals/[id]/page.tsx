"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";
import type { LaborLineDraft, SectionEstimateDraft, SectionMaterialDraft } from "./SectionMaterialsAndLabor";
import { ProposalPricingCalculator, createDefaultPricingWorkItems, type PricingWorkItemDraft } from "./ProposalPricingCalculator";
import { computeDraftProposalEstimateSummary } from "@/lib/proposal-estimator-draft";

const TABS = [
  { id: "scope", label: "Scope" },
  { id: "pricing", label: "Pricing" },
  { id: "paint-colors", label: "Paint Colors" },
  { id: "attachments", label: "Attachments" },
  { id: "preview", label: "Preview" },
  { id: "activity", label: "Activity" },
] as const;

type ProposalTab = (typeof TABS)[number]["id"];
const PROPOSAL_STATUSES = ["draft", "ready", "sent", "viewed", "approved", "declined", "follow_up", "converted"] as const;
const STATUS_OPTIONS: Array<{ value: (typeof PROPOSAL_STATUSES)[number]; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Rejected" },
  { value: "converted", label: "Converted" },
];
const PROPOSAL_TYPES = ["residential", "commercial", "restoration", "maintenance", "new_construction", "custom"] as const;
const PROPOSAL_TEMPLATES = [
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
] as const;

type OptionDraft = {
  title: string;
  description: string;
  scope: string;
  price: string;
  isVisible: boolean;
  sortOrder: number;
};

type AttachmentDraft = {
  category: string;
  fileName: string;
  fileUrl: string;
  notes: string;
  sortOrder: number;
};

type PaintColorDraft = {
  area: string;
  brand: string;
  product: string;
  colorName: string;
  colorCode: string;
  finish: string;
  notes: string;
  sortOrder: number;
};

type OtherCostDraft = {
  key: string;
  label: string;
  description: string;
  amount: number;
  includeInRecommendedPrice: boolean;
  internalNote: string;
};

type SectionDraft = SectionEstimateDraft & {
  key: string;
  templateKey: string;
  title: string;
  description: string;
  bulletItems: string[];
  notes: string;
  sortOrder: number;
};

type SavedEstimateSummary = {
  input?: { workItems?: unknown[]; settings?: { otherCosts?: OtherCostDraft[] } };
  draftWorkItems?: unknown[];
  summary?: {
    desiredProfitMarginPercent?: number | null;
    workersCompPercent?: number;
    includeWorkersCompInRecommendedPrice?: boolean;
    generalLiabilityMode?: "PERCENT_OF_LABOR" | "PERCENT_OF_REVENUE" | "FLAT_AMOUNT" | "EXCLUDED";
    generalLiabilityPercent?: number | null;
    generalLiabilityFlatAmount?: number | null;
    includeGeneralLiabilityInRecommendedPrice?: boolean;
    massTaxRate?: number;
    federalTaxRate?: number;
    showTaxPlanning?: boolean;
    includeTaxReserveInRecommendedPrice?: boolean;
  };
};

type SavedSectionEstimateData = {
  input?: SectionDraft;
};

const EMPTY_ESTIMATE_FIELDS = {
  areaName: "",
  phaseName: "",
  workCategoryLabel: "",
  customerTitle: "",
  estimateMethod: "" as SectionEstimateDraft["estimateMethod"],
  priceVisibilityMode: "ITEMIZED" as const,
  clientNotes: "",
  internalNotes: "",
  laborLines: [] as LaborLineDraft[],
  materials: [] as SectionMaterialDraft[],
  unitPrice: null as SectionEstimateDraft["unitPrice"],
  manualTotal: null as SectionEstimateDraft["manualTotal"],
  production: null as SectionEstimateDraft["production"],
};

let sectionDraftKeySeq = 0;
function nextSectionDraftKey() {
  sectionDraftKeySeq += 1;
  return `s-${sectionDraftKeySeq}`;
}

let materialDraftKeySeq = 0;
function nextMaterialDraftKey() {
  materialDraftKeySeq += 1;
  return `m-${materialDraftKeySeq}`;
}

let laborDraftKeySeq = 0;
function nextLaborDraftKey() {
  laborDraftKeySeq += 1;
  return `l-${laborDraftKeySeq}`;
}

const ATTACHMENT_CATEGORIES = [
  "IS Painting Booklet",
  "Certificate of Insurance",
  "Photos",
  "Estimate Breakdown",
  "Other",
] as const;

const SECTION_TEMPLATES = [
  "interior_painting",
  "exterior_painting",
  "deck_restoration",
  "pergola",
  "cabinets",
  "trim_restoration",
  "wallpaper_removal",
  "drywall_repair",
  "commercial",
  "custom_section",
] as const;

const SECTION_PRESETS: Record<
  (typeof SECTION_TEMPLATES)[number],
  Omit<SectionDraft, "key" | "sortOrder" | keyof typeof EMPTY_ESTIMATE_FIELDS>
> = {
  interior_painting: {
    templateKey: "interior_painting",
    title: "Interior Painting",
    description: "Prepare, protect, and paint interior surfaces for a clean durable finish.",
    bulletItems: ["Mask and protect work areas", "Patch and prep surfaces", "Prime as needed", "Apply finish coats"],
    notes: "Coordinate color and sheen selections before production.",
  },
  exterior_painting: {
    templateKey: "exterior_painting",
    title: "Exterior Painting",
    description: "Restore and protect exterior surfaces with thorough preparation and premium coatings.",
    bulletItems: ["Wash exterior surfaces", "Scrape and sand loose paint", "Prime exposed areas", "Apply exterior finish coats"],
    notes: "Scheduling depends on weather and dry-time windows.",
  },
  deck_restoration: {
    templateKey: "deck_restoration",
    title: "Deck Restoration",
    description: "Restore deck surfaces with prep, sanding, and protective finish application.",
    bulletItems: ["Clean deck surfaces", "Sand deck boards and rails", "Prep worn areas", "Apply stain or coating system"],
    notes: "Foot traffic must stay off surfaces during cure period.",
  },
  pergola: {
    templateKey: "pergola",
    title: "Pergola",
    description: "Prepare and refinish pergola components for weather protection and appearance.",
    bulletItems: ["Wash and prep structure", "Sand deteriorated areas", "Prime/spot repair as needed", "Apply finish system"],
    notes: "Access and sun exposure may affect sequencing.",
  },
  cabinets: {
    templateKey: "cabinets",
    title: "Cabinet Refinishing",
    description: "Controlled cabinet refinishing workflow for a smooth durable finish.",
    bulletItems: ["Label doors and drawers", "Degrease and sand surfaces", "Prime surfaces", "Spray or apply finish coats"],
    notes: "Final color approval required before finishing.",
  },
  trim_restoration: {
    templateKey: "trim_restoration",
    title: "Trim Restoration",
    description: "Restore trim surfaces for crisp appearance and durable protection.",
    bulletItems: ["Prep trim surfaces", "Caulk and repair minor defects", "Prime as needed", "Apply finish coats"],
    notes: "Substrate condition may affect final prep scope.",
  },
  wallpaper_removal: {
    templateKey: "wallpaper_removal",
    title: "Wallpaper Removal",
    description: "Remove wallpaper and prepare walls for a paint-ready finish.",
    bulletItems: ["Remove wallpaper", "Clean adhesive residue", "Patch wall imperfections", "Prep surface for finish work"],
    notes: "Hidden wall conditions may be discovered after removal.",
  },
  drywall_repair: {
    templateKey: "drywall_repair",
    title: "Drywall Repair",
    description: "Repair damaged drywall and prepare surfaces to paint-ready condition.",
    bulletItems: ["Patch damaged areas", "Tape and mud as required", "Sand smooth", "Prime repaired areas"],
    notes: "Drying and sanding cycles affect schedule.",
  },
  commercial: {
    templateKey: "commercial",
    title: "Commercial Painting",
    description: "Commercial painting scope organized around access, schedule, and production efficiency.",
    bulletItems: ["Coordinate with site contact", "Protect adjacent areas", "Prep surfaces", "Apply specified coating system"],
    notes: "Phasing can be aligned to occupancy schedule.",
  },
  custom_section: {
    templateKey: "custom_section",
    title: "Custom Section",
    description: "",
    bulletItems: [""],
    notes: "",
  },
};

function isMeaningfulRow(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

function sanitizeNumericInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "";
  const [rawInteger, ...rawFractionParts] = cleaned.split(".");
  const integerPart = rawInteger.replace(/^0+(?=\d)/, "");
  const fractionPart = rawFractionParts.join("");
  return rawFractionParts.length ? `${integerPart || "0"}.${fractionPart}` : integerPart;
}

function parseCurrencyValue(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function readEstimateSummary(value: unknown): SavedEstimateSummary | null {
  return value && typeof value === "object" ? (value as SavedEstimateSummary) : null;
}

function hydratePricingWorkItems(value: unknown): PricingWorkItemDraft[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, any> => !!item && typeof item === "object").map((item, index) => ({
    key: String(item.key || `pricing-${index}`),
    templateKey: String(item.templateKey || "pricing"),
    title: String(item.title || "Pricing item"),
    description: String(item.description || ""),
    bulletItems: Array.isArray(item.bulletItems) ? item.bulletItems.map(String) : [],
    notes: String(item.notes || ""),
    sortOrder: Number(item.sortOrder ?? index),
    areaName: String(item.areaName === "General" ? "" : item.areaName || ""),
    phaseName: String(item.phaseName || ""),
    workCategoryLabel: String(item.workCategoryLabel || ""),
    customerTitle: String(item.customerTitle || ""),
    estimateMethod: item.estimateMethod || "",
    priceVisibilityMode: item.priceVisibilityMode || item.priceVisibility || "HIDDEN",
    clientNotes: String(item.clientNotes || ""),
    internalNotes: String(item.internalNotes || ""),
    laborLines: Array.isArray(item.laborLines) ? item.laborLines.map((line: Record<string, any>, laborIndex: number) => ({
      key: String(line.key || `pricing-labor-${laborIndex}`), label: String(line.label || "Labor"), mode: line.mode || "HOURS",
      workers: line.workers == null ? "" : String(line.workers), hoursPerWorker: line.hoursPerWorker == null ? "" : String(line.hoursPerWorker),
      days: line.days == null ? "" : String(line.days), hoursPerDay: line.hoursPerDay == null ? "" : String(line.hoursPerDay),
      hourlyCost: line.hourlyCost == null ? "" : String(line.hourlyCost), manualTotalOverride: line.manualTotalOverride == null ? "" : String(line.manualTotalOverride),
      internalNote: String(line.internalNote || ""),
    })) : [],
    materials: Array.isArray(item.materials) ? item.materials.map((material: Record<string, any>, materialIndex: number) => ({
      key: String(material.key || `pricing-material-${materialIndex}`), inventoryItemId: material.inventoryItemId ?? null, type: material.type || "CUSTOM",
      name: String(material.name || ""), unit: String(material.unit || "unit"), quantity: material.quantity == null ? "" : String(material.quantity),
      unitCost: material.unitCost == null ? "" : String(material.unitCost), manualTotal: material.manualTotal == null ? "" : String(material.manualTotal),
      coveragePerUnit: material.coveragePerUnit == null ? "" : String(material.coveragePerUnit), wastePercent: material.wastePercent == null ? "0" : String(material.wastePercent),
      adjustedQuantity: material.adjustedQuantity == null ? "" : String(material.adjustedQuantity), note: String(material.note || ""),
      priceSourceType: material.priceSourceType ?? null, priceSourceLabel: String(material.priceSourceLabel || ""),
      priceSourceExpenseId: material.priceSourceExpenseId ?? null, priceSourceExpenseLineItemId: material.priceSourceExpenseLineItemId ?? null,
    })) : [],
    unitPrice: item.unitPrice ? {
      templateId: item.unitPrice.templateId ?? null, serviceName: String(item.unitPrice.serviceName || ""), variantName: String(item.unitPrice.variantName || ""), unitLabel: String(item.unitPrice.unitLabel || ""),
      quantity: item.unitPrice.quantity == null ? "" : String(item.unitPrice.quantity), pricePerUnit: item.unitPrice.pricePerUnit == null ? "" : String(item.unitPrice.pricePerUnit),
      lineTotalOverride: item.unitPrice.lineTotalOverride == null ? "" : String(item.unitPrice.lineTotalOverride), laborAllowance: item.unitPrice.laborAllowance == null ? "" : String(item.unitPrice.laborAllowance),
      materialAllowance: item.unitPrice.materialAllowance == null ? "" : String(item.unitPrice.materialAllowance), note: String(item.unitPrice.note || ""), rateSource: item.unitPrice.rateSource || "MANUAL",
    } : null,
    manualTotal: item.manualTotal ? { customerTotal: String(item.manualTotal.customerTotal ?? ""), internalCost: String(item.manualTotal.internalCost ?? ""), note: String(item.manualTotal.note || "") } : null,
    production: item.production ? {
      workCategory: String(item.production.workCategory || ""), surfaceType: String(item.production.surfaceType || ""), measurementUnit: String(item.production.measurementUnit || ""),
      measurementValue: String(item.production.measurementValue ?? ""), productionRateBasis: item.production.productionRateBasis || "SQFT_PER_HOUR", productionRateValue: String(item.production.productionRateValue ?? ""),
      calculatedLaborHours: String(item.production.calculatedLaborHours ?? ""), adjustedLaborHours: String(item.production.adjustedLaborHours ?? ""), crewSize: String(item.production.crewSize ?? ""),
      hoursPerDay: String(item.production.hoursPerDay ?? ""), hourlyCostPerWorker: String(item.production.hourlyCostPerWorker ?? ""), note: String(item.production.note || ""), productionRateId: item.production.productionRateId ?? null,
    } : null,
  }));
}

function serializePricingWorkItem(item: PricingWorkItemDraft, index: number) {
  return {
    key: item.key,
    templateKey: item.templateKey,
    title: item.title || `Pricing item ${index + 1}`,
    customerTitle: item.customerTitle || undefined,
    description: item.description || undefined,
    bulletItems: item.bulletItems,
    notes: item.notes || undefined,
    sortOrder: index,
    areaName: item.areaName || undefined,
    phaseName: item.phaseName || undefined,
    workCategoryLabel: item.workCategoryLabel || undefined,
    estimateMethod: item.estimateMethod || null,
    priceVisibilityMode: item.priceVisibilityMode,
    clientNotes: item.clientNotes || undefined,
    internalNotes: item.internalNotes || undefined,
    laborLines: item.laborLines.map((line) => ({
      key: line.key,
      label: line.label || "Labor",
      mode: line.mode,
      workers: Number(line.workers) || 0,
      hoursPerWorker: line.hoursPerWorker.trim() ? Number(line.hoursPerWorker) : null,
      days: line.days.trim() ? Number(line.days) : null,
      hoursPerDay: line.hoursPerDay.trim() ? Number(line.hoursPerDay) : null,
      hourlyCost: Number(line.hourlyCost) || 0,
      manualTotalOverride: line.manualTotalOverride.trim() ? Number(line.manualTotalOverride) : null,
      internalNote: line.internalNote || undefined,
    })),
    materials: item.materials.filter((material) => material.name.trim()).map((material, materialIndex) => ({
      key: material.key,
      inventoryItemId: material.inventoryItemId,
      type: material.type,
      name: material.name.trim(),
      unit: material.unit.trim() || "unit",
      quantity: material.quantity.trim() ? Number(material.quantity) : null,
      unitCost: material.unitCost.trim() ? Number(material.unitCost) : null,
      manualTotal: material.manualTotal.trim() ? Number(material.manualTotal) : null,
      coveragePerUnit: material.coveragePerUnit.trim() ? Number(material.coveragePerUnit) : null,
      wastePercent: material.wastePercent.trim() ? Number(material.wastePercent) : 0,
      adjustedQuantity: material.adjustedQuantity.trim() ? Number(material.adjustedQuantity) : null,
      note: material.note || undefined,
      priceSourceType: material.priceSourceType,
      priceSourceLabel: material.priceSourceLabel || undefined,
      priceSourceExpenseId: material.priceSourceExpenseId,
      priceSourceExpenseLineItemId: material.priceSourceExpenseLineItemId,
      sortOrder: materialIndex,
    })),
    unitPrice: item.unitPrice ? {
      templateId: item.unitPrice.templateId,
      serviceName: item.unitPrice.serviceName || undefined,
      variantName: item.unitPrice.variantName || undefined,
      unitLabel: item.unitPrice.unitLabel || undefined,
      quantity: Number(item.unitPrice.quantity) || 0,
      pricePerUnit: Number(item.unitPrice.pricePerUnit) || 0,
      lineTotalOverride: item.unitPrice.lineTotalOverride.trim() ? Number(item.unitPrice.lineTotalOverride) : null,
      laborAllowance: item.unitPrice.laborAllowance.trim() ? Number(item.unitPrice.laborAllowance) : null,
      materialAllowance: item.unitPrice.materialAllowance.trim() ? Number(item.unitPrice.materialAllowance) : null,
      note: item.unitPrice.note || undefined,
      rateSource: item.unitPrice.rateSource,
    } : null,
    manualTotal: item.manualTotal ? {
      customerTotal: Number(item.manualTotal.customerTotal) || 0,
      internalCost: item.manualTotal.internalCost.trim() ? Number(item.manualTotal.internalCost) : null,
      note: item.manualTotal.note || undefined,
    } : null,
    production: item.production ? {
      workCategory: item.production.workCategory || undefined,
      surfaceType: item.production.surfaceType || undefined,
      measurementUnit: item.production.measurementUnit || undefined,
      measurementValue: Number(item.production.measurementValue) || 0,
      productionRateBasis: item.production.productionRateBasis,
      productionRateValue: Number(item.production.productionRateValue) || 0,
      calculatedLaborHours: item.production.calculatedLaborHours.trim() ? Number(item.production.calculatedLaborHours) : null,
      adjustedLaborHours: item.production.adjustedLaborHours.trim() ? Number(item.production.adjustedLaborHours) : null,
      crewSize: item.production.crewSize.trim() ? Number(item.production.crewSize) : null,
      hoursPerDay: item.production.hoursPerDay.trim() ? Number(item.production.hoursPerDay) : null,
      hourlyCostPerWorker: item.production.hourlyCostPerWorker.trim() ? Number(item.production.hourlyCostPerWorker) : null,
      note: item.production.note || undefined,
      productionRateId: item.production.productionRateId,
    } : null,
  };
}

function readSectionEstimateData(value: unknown): SavedSectionEstimateData | null {
  return value && typeof value === "object" ? (value as SavedSectionEstimateData) : null;
}

function hasEstimatorContent(section: SectionDraft) {
  return (
    section.estimateMethod.trim().length > 0 ||
    section.laborLines.length > 0 ||
    section.materials.some((material) => material.name.trim().length > 0) ||
    Boolean(section.unitPrice && (section.unitPrice.quantity.trim().length > 0 || section.unitPrice.pricePerUnit.trim().length > 0)) ||
    Boolean(section.manualTotal && section.manualTotal.customerTotal.trim().length > 0) ||
    Boolean(section.production && section.production.measurementValue.trim().length > 0)
  );
}

const TEMPLATE_PRESETS: Record<(typeof PROPOSAL_TEMPLATES)[number], {
  projectSummary: string;
  scopeOfWork: string;
  includedWork: string;
  exclusions: string;
  recommendations: string;
  importantNotes: string;
  referencesText: string;
  closingText: string;
}> = {
  interior_painting: {
    projectSummary: "Interior repaint focused on finish quality, cleanliness, and minimal disruption.",
    scopeOfWork: "Prepare surfaces, patch minor imperfections, apply primer as needed, and apply finish coats.",
    includedWork: "Masking and protection, wall and trim painting, daily cleanup.",
    exclusions: "Major drywall replacement and structural repairs unless added in options.",
    recommendations: "Finalize sheen and color schedule prior to start date.",
    importantNotes: "Furniture should be moved from immediate work zones before mobilization.",
    referencesText: "Interior residential references available upon request.",
    closingText: "Thank you for the opportunity. We look forward to delivering a clean professional result.",
  },
  exterior_painting: {
    projectSummary: "Exterior coating project designed for durability, curb appeal, and long-term protection.",
    scopeOfWork: "Power wash, scrape, sand, spot-prime, caulk, and apply exterior finish coats.",
    includedWork: "Surface preparation, minor sealant touchups, and finish application.",
    exclusions: "Wood replacement, rot remediation, and carpentry unless listed.",
    recommendations: "Schedule around weather windows for best curing performance.",
    importantNotes: "Access to all elevations and perimeter must be available during work days.",
    referencesText: "Exterior project references and before/after images are available.",
    closingText: "We appreciate the opportunity to protect and refresh your property.",
  },
  cabinet_refinishing: {
    projectSummary: "Cabinet refinishing with controlled prep and durable finish process.",
    scopeOfWork: "Degrease, sand, prime, and spray or brush/roll finish system based on selected option.",
    includedWork: "Door/drawer labeling, prep, finish application, and reinstallation.",
    exclusions: "Hardware replacement and interior cabinet modifications unless listed.",
    recommendations: "Approve color sample before production coating.",
    importantNotes: "Kitchen access windows should be coordinated for production efficiency.",
    referencesText: "Cabinet refinishing references available upon request.",
    closingText: "Thank you for trusting us with your cabinet refinishing project.",
  },
  deck_restoration: {
    projectSummary: "Deck restoration focused on prep quality, coating longevity, and visual consistency.",
    scopeOfWork: "Clean, sand, repair minor imperfections, and apply stain or coating system.",
    includedWork: "Decking and rail prep, finish application, and cleanup.",
    exclusions: "Board replacement and structural framing repair unless listed.",
    recommendations: "Select finish type based on sun exposure and maintenance preference.",
    importantNotes: "Foot traffic should be restricted during curing period.",
    referencesText: "Deck restoration references can be provided.",
    closingText: "We look forward to restoring your deck with a durable finish system.",
  },
  pergola_restoration: {
    projectSummary: "Pergola restoration to refresh appearance and improve weather resistance.",
    scopeOfWork: "Prep, sanding, spot repairs, and protective coating application.",
    includedWork: "Surface prep, coating/stain, and cleanup.",
    exclusions: "Structural replacement unless added as an option.",
    recommendations: "Annual maintenance wash improves finish lifespan.",
    importantNotes: "Work sequencing may vary based on sun and weather conditions.",
    referencesText: "Pergola references are available upon request.",
    closingText: "Thank you for the opportunity to restore your pergola.",
  },
  trim_restoration: {
    projectSummary: "Trim restoration focused on crisp lines and durable finish quality.",
    scopeOfWork: "Prepare surfaces, repair minor defects, prime, and apply finish coats.",
    includedWork: "Detail prep, caulking touchups, and finish coats.",
    exclusions: "Major carpentry replacement unless listed.",
    recommendations: "Match finish sheen to adjacent surfaces for visual consistency.",
    importantNotes: "Existing substrate condition may impact prep effort.",
    referencesText: "Trim restoration references available upon request.",
    closingText: "We appreciate the opportunity to improve your trim finishes.",
  },
  wallpaper_removal: {
    projectSummary: "Wallpaper removal and wall prep for repaint-ready surfaces.",
    scopeOfWork: "Remove wallpaper, clean adhesive residue, patch and smooth walls for finish prep.",
    includedWork: "Wallpaper removal, wall prep, and cleanup.",
    exclusions: "Large drywall replacement and moisture remediation unless listed.",
    recommendations: "Confirm final wall texture and paint plan before finishing.",
    importantNotes: "Hidden wall conditions may only appear after paper removal.",
    referencesText: "Wallpaper removal references available upon request.",
    closingText: "Thank you for the opportunity to prepare your space for a fresh finish.",
  },
  drywall_repair: {
    projectSummary: "Drywall repair scope built for smooth finish-ready surfaces.",
    scopeOfWork: "Patch damaged areas, tape/mud as required, sand, and prep for primer/paint.",
    includedWork: "Surface repair and prep to paint-ready condition.",
    exclusions: "Framing correction and moisture-source remediation unless listed.",
    recommendations: "Allow adequate curing and sanding stages for best finish quality.",
    importantNotes: "Dust control setup will be used in active work zones.",
    referencesText: "Drywall repair examples are available upon request.",
    closingText: "We appreciate the opportunity to restore your walls properly.",
  },
  commercial_painting: {
    projectSummary: "Commercial painting scope built for schedule reliability and professional finishes.",
    scopeOfWork: "Coordinate access, prep surfaces, and apply commercial-grade coating systems.",
    includedWork: "Site protection, prep, coatings, and punch-list walkthrough.",
    exclusions: "After-hours premium scheduling unless listed as an option.",
    recommendations: "Align phase plan with occupancy schedule to reduce disruption.",
    importantNotes: "Site coordination contact should be designated before kickoff.",
    referencesText: "Commercial references and certificates available upon request.",
    closingText: "Thank you for considering us for your commercial painting needs.",
  },
  new_construction: {
    projectSummary: "New construction finish package for consistent quality across project phases.",
    scopeOfWork: "Prime, caulk, and apply finish systems per approved schedule and specs.",
    includedWork: "Standard production prep and coating application.",
    exclusions: "Change-order scope outside approved plan unless added.",
    recommendations: "Finalize color schedule and punch milestones in advance.",
    importantNotes: "Work is sequenced around project readiness and trade completion.",
    referencesText: "New construction project references available.",
    closingText: "We look forward to supporting your construction schedule with dependable delivery.",
  },
  property_maintenance: {
    projectSummary: "Recurring property maintenance scope to protect finishes and control long-term costs.",
    scopeOfWork: "Inspect and address touch-ups, wear areas, and preventive coating needs.",
    includedWork: "Scheduled touch-up execution and condition reporting.",
    exclusions: "Major restoration or replacement outside maintenance scope.",
    recommendations: "Use quarterly review cycles for best long-term asset performance.",
    importantNotes: "Maintenance windows should be coordinated with occupancy requirements.",
    referencesText: "Maintenance program references are available.",
    closingText: "Thank you for the opportunity to maintain your property proactively.",
  },
};

export default function ProposalDetailPage() {
  const utils = api.useUtils();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: proposal, isLoading } = api.proposals.byId.useQuery({ id });
  const [tab, setTab] = useState<ProposalTab>("pricing");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const customers = api.customers.list.useQuery({ search: customerSearch.trim() || undefined }, { enabled: !!proposal });
  const [linkClientOpen, setLinkClientOpen] = useState(false);
  const [linkClientSearch, setLinkClientSearch] = useState("");
  const linkClientCustomers = api.customers.list.useQuery(
    { search: linkClientSearch.trim() || undefined },
    { enabled: linkClientOpen && linkClientSearch.trim().length > 0 }
  );
  const linkClient = api.proposals.linkClient.useMutation({
    onSuccess: () => {
      toast.success("Client linked");
      setLinkClientOpen(false);
      setLinkClientSearch("");
      utils.proposals.byId.invalidate({ id });
      utils.proposals.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const convertToJob = api.proposals.convertToJob.useMutation({
    onSuccess: (job) => {
      toast.success(`Converted to Job ${job.estimateNumber}`);
      utils.proposals.byId.invalidate({ id });
      utils.proposals.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [collapsedOptions, setCollapsedOptions] = useState<Record<number, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [selectedSectionTemplate, setSelectedSectionTemplate] = useState<(typeof SECTION_TEMPLATES)[number]>("interior_painting");
  const [newAreaName, setNewAreaName] = useState("");
  const [selectedAttachmentCategory, setSelectedAttachmentCategory] = useState<(typeof ATTACHMENT_CATEGORIES)[number]>("Other");
  const [selectedExamples, setSelectedExamples] = useState<Array<{ id: number; title: string; proposalCategory: string; proposalType: string | null; tags: string[] }>>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    customerId: 0,
    projectName: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    status: "draft" as (typeof PROPOSAL_STATUSES)[number],
    proposalTemplate: null as (typeof PROPOSAL_TEMPLATES)[number] | null,
    proposalType: null as (typeof PROPOSAL_TYPES)[number] | null,
    projectSummary: "",
    scopeOfWork: "",
    includedWork: "",
    exclusions: "",
    importantNotes: "",
    recommendations: "",
    closingText: "",
    aiAssistantNotes: "",
    notes: "",
    emailBody: "",
    referencesText: "",
    termsAndConditions: "",
    paymentSchedule: "",
    materialsBudget: 0,
    laborBudget: 0,
    subcontractorBudget: 0,
    totalAmount: 0,
    desiredProfitMarginPercent: "",
    estimatePriceOverride: "",
    workersCompPercentOverride: "",
    includeWorkersCompInRecommendedPrice: true,
    generalLiabilityMode: "PERCENT_OF_REVENUE" as "PERCENT_OF_LABOR" | "PERCENT_OF_REVENUE" | "FLAT_AMOUNT" | "EXCLUDED",
    generalLiabilityPercent: "",
    generalLiabilityFlatAmount: "",
    includeGeneralLiabilityInRecommendedPrice: true,
    massTaxRate: "",
    federalTaxRate: "",
    showTaxPlanning: true,
    includeTaxReserveInRecommendedPrice: false,
    otherCosts: [] as OtherCostDraft[],
    estimateWorkItems: [] as PricingWorkItemDraft[],
    expectedStartDate: "",
    expectedEndDate: "",
    sections: [] as SectionDraft[],
    options: [] as OptionDraft[],
    attachments: [] as AttachmentDraft[],
    paintColors: [] as PaintColorDraft[],
  });

  const config = api.config.get.useQuery();
  const estimatorDefaults = useMemo(
    () => ({
      defaultLaborCostRate: config.data?.defaultLaborCostRate != null ? Number(config.data.defaultLaborCostRate) : null,
      defaultWcPercent: config.data ? Number(config.data.defaultWcPercent) : 3.5,
      defaultDesiredProfitMarginPercent: config.data ? Number(config.data.defaultDesiredProfitMarginPercent ?? 35) : 35,
      defaultGlPercent: config.data ? Number(config.data.defaultGlPercent ?? 0) : 0,
      defaultGeneralLiabilityMode: config.data?.defaultGeneralLiabilityMode ?? "PERCENT_OF_REVENUE",
      defaultMassTaxRate: config.data ? Number(config.data.defaultMassTaxRate ?? 5) : 5,
      defaultFederalTaxRate: config.data ? Number(config.data.defaultFederalTaxRate ?? 12) : 12,
      defaultWorkDayHours: config.data ? Number(config.data.defaultWorkDayHours ?? 8) : 8,
    }),
    [config.data]
  );

  const estimatorSummary = useMemo(
    () =>
      computeDraftProposalEstimateSummary({
        sections: form.sections,
        estimateWorkItems: form.estimateWorkItems,
        defaults: estimatorDefaults,
        pricing: {
          desiredProfitMarginPercent: form.desiredProfitMarginPercent,
          estimatePriceOverride: form.estimatePriceOverride,
          workersCompPercentOverride: form.workersCompPercentOverride,
          includeWorkersCompInRecommendedPrice: form.includeWorkersCompInRecommendedPrice,
          generalLiabilityMode: form.generalLiabilityMode,
          generalLiabilityPercent: form.generalLiabilityPercent,
          generalLiabilityFlatAmount: form.generalLiabilityFlatAmount,
          includeGeneralLiabilityInRecommendedPrice: form.includeGeneralLiabilityInRecommendedPrice,
          massTaxRate: form.massTaxRate,
          federalTaxRate: form.federalTaxRate,
          showTaxPlanning: form.showTaxPlanning,
          includeTaxReserveInRecommendedPrice: form.includeTaxReserveInRecommendedPrice,
          otherCosts: form.otherCosts,
        },
      }),
    [form.sections, form.estimateWorkItems, form.desiredProfitMarginPercent, form.estimatePriceOverride, form.workersCompPercentOverride, form.includeWorkersCompInRecommendedPrice, form.generalLiabilityMode, form.generalLiabilityPercent, form.generalLiabilityFlatAmount, form.includeGeneralLiabilityInRecommendedPrice, form.massTaxRate, form.federalTaxRate, form.showTaxPlanning, form.includeTaxReserveInRecommendedPrice, form.otherCosts, estimatorDefaults]
  );

  const computedScopesTotal = estimatorSummary.areas.reduce((sum, area) => sum + area.allocatedCustomerPrice, 0);
  const displayFinalProposalPrice = estimatorSummary.hasEstimatorData
    ? estimatorSummary.totals.finalCustomerPrice ?? estimatorSummary.totals.recommendedCustomerPrice ?? form.totalAmount
    : form.totalAmount;
  const hasEnteredEstimate =
    estimatorSummary.totals.directLaborCost > 0
    || estimatorSummary.totals.materialsCost > 0
    || estimatorSummary.totals.otherDirectCosts > 0
    || estimatorSummary.totals.workItems.some((item) => item.baseCustomerPrice > 0);

  const update = api.proposals.update.useMutation({
    onSuccess: () => {
      toast.success("Proposal saved");
      utils.proposals.byId.invalidate({ id });
      utils.proposals.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateProposalDraft = api.proposals.generateProposalDraft.useMutation({
    onSuccess: (draft) => {
      setSelectedExamples(draft.selectedExamples || []);
      setForm((current) => ({
        ...current,
        projectSummary: draft.projectSummary || current.projectSummary,
        scopeOfWork: draft.scopeOfWork || current.scopeOfWork,
        importantNotes: draft.importantNotes || current.importantNotes,
        recommendations: draft.recommendations || current.recommendations,
        referencesText: draft.referencesText || current.referencesText,
        closingText: draft.closingText || current.closingText,
        paymentSchedule: current.paymentSchedule || draft.paymentSchedule || current.paymentSchedule,
        totalAmount: current.totalAmount > 0 ? current.totalAmount : draft.totalAmount ?? current.totalAmount,
        sections: draft.sections.length
          ? draft.sections.map((section, index) => ({
              key: nextSectionDraftKey(),
              templateKey: section.templateKey || "custom_section",
              title: section.title,
              description: section.description || "",
              bulletItems: section.bulletItems.length ? section.bulletItems : [""],
              notes: section.notes || "",
              sortOrder: section.sortOrder ?? index,
              ...EMPTY_ESTIMATE_FIELDS,
            }))
          : current.sections,
      }));
      toast.success("Proposal draft generated. Review and edit as needed.");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!proposal) return;
    const estimateSummary = readEstimateSummary(proposal.estimateSummaryJson);

    setCustomerSearch(proposal.customer?.name ?? "");
    setForm({
      customerId: proposal.customerId ?? 0,
      projectName: proposal.projectName,
      address: proposal.address || "",
      city: proposal.city || "",
      state: proposal.state || "",
      zipCode: proposal.zipCode || "",
      status: proposal.status as (typeof PROPOSAL_STATUSES)[number],
      proposalTemplate: (proposal.proposalTemplate as (typeof PROPOSAL_TEMPLATES)[number] | null) || null,
      proposalType: (proposal.proposalType as (typeof PROPOSAL_TYPES)[number] | null) || null,
      projectSummary: proposal.projectSummary || "",
      scopeOfWork: proposal.scopeOfWork || "",
      includedWork: proposal.includedWork || "",
      exclusions: proposal.exclusions || "",
      importantNotes: proposal.importantNotes || "",
      recommendations: proposal.recommendations || "",
      closingText: proposal.closingText || "",
      aiAssistantNotes: proposal.aiAssistantNotes || "",
      notes: proposal.notes || "",
      emailBody: proposal.emailBody || "",
      referencesText: proposal.referencesText || "",
      termsAndConditions: proposal.termsAndConditions || "",
      paymentSchedule: proposal.paymentSchedule || "",
      materialsBudget: Number(proposal.materialsBudget),
      laborBudget: Number(proposal.laborBudget),
      subcontractorBudget: Number(proposal.subcontractorBudget),
      totalAmount: Number(proposal.totalAmount),
      desiredProfitMarginPercent:
        estimateSummary?.summary?.desiredProfitMarginPercent == null
          ? proposal.estimateTargetMarginPercent == null ? "" : String(proposal.estimateTargetMarginPercent)
          : String(estimateSummary.summary.desiredProfitMarginPercent),
      estimatePriceOverride: proposal.estimatePriceOverride == null ? "" : String(proposal.estimatePriceOverride),
      workersCompPercentOverride:
        estimateSummary?.summary?.workersCompPercent == null ? "" : String(estimateSummary.summary.workersCompPercent),
      includeWorkersCompInRecommendedPrice: estimateSummary?.summary?.includeWorkersCompInRecommendedPrice ?? true,
      generalLiabilityMode: estimateSummary?.summary?.generalLiabilityMode ?? "PERCENT_OF_REVENUE",
      generalLiabilityPercent:
        estimateSummary?.summary?.generalLiabilityPercent == null ? "" : String(estimateSummary.summary.generalLiabilityPercent),
      generalLiabilityFlatAmount:
        estimateSummary?.summary?.generalLiabilityFlatAmount == null ? "" : String(estimateSummary.summary.generalLiabilityFlatAmount),
      includeGeneralLiabilityInRecommendedPrice: estimateSummary?.summary?.includeGeneralLiabilityInRecommendedPrice ?? true,
      massTaxRate: estimateSummary?.summary?.massTaxRate == null ? "" : String(estimateSummary.summary.massTaxRate),
      federalTaxRate: estimateSummary?.summary?.federalTaxRate == null ? "" : String(estimateSummary.summary.federalTaxRate),
      showTaxPlanning: estimateSummary?.summary?.showTaxPlanning ?? true,
      includeTaxReserveInRecommendedPrice: estimateSummary?.summary?.includeTaxReserveInRecommendedPrice ?? false,
      otherCosts: estimateSummary?.input?.settings?.otherCosts?.length
        ? estimateSummary.input.settings.otherCosts.map((line) => ({
            key: line.key,
            label: line.label,
            description: line.description || "",
            amount: Number(line.amount ?? 0),
            includeInRecommendedPrice: line.includeInRecommendedPrice,
            internalNote: line.internalNote || "",
          }))
        : [
            { key: "subcontractors", label: "Subcontractors", description: "", amount: Number(proposal.estimateSubcontractorCost ?? 0), includeInRecommendedPrice: true, internalNote: "" },
            { key: "equipment", label: "Equipment rentals", description: "", amount: Number(proposal.estimateEquipmentCost ?? 0), includeInRecommendedPrice: true, internalNote: "" },
            { key: "travel", label: "Fuel and transportation", description: "", amount: Number(proposal.estimateLogisticsCost ?? 0), includeInRecommendedPrice: true, internalNote: "" },
            { key: "misc", label: "Miscellaneous costs", description: "", amount: Number(proposal.estimateMiscProjectCost ?? 0), includeInRecommendedPrice: true, internalNote: "" },
          ].filter((line) => line.amount > 0),
      estimateWorkItems: (() => {
        const saved = hydratePricingWorkItems(estimateSummary?.draftWorkItems ?? estimateSummary?.input?.workItems);
        return saved.length ? saved : createDefaultPricingWorkItems(estimatorDefaults.defaultWorkDayHours, estimatorDefaults.defaultLaborCostRate ?? 0);
      })(),
      expectedStartDate: proposal.expectedStartDate ? new Date(proposal.expectedStartDate).toISOString().slice(0, 10) : "",
      expectedEndDate: proposal.expectedEndDate ? new Date(proposal.expectedEndDate).toISOString().slice(0, 10) : "",
      sections: proposal.sections.length
        ? proposal.sections.map((section) => {
            const estimateData = readSectionEstimateData(section.estimateDataJson);
            const inputSection = estimateData?.input;
            return {
              key: inputSection?.key || nextSectionDraftKey(),
              templateKey: section.templateKey || "custom_section",
              title: section.title,
              description: section.description || "",
              bulletItems: section.bulletItems.length ? section.bulletItems : [""],
              notes: section.notes || "",
              sortOrder: section.sortOrder,
              areaName: inputSection?.areaName || section.areaName || "",
              phaseName: inputSection?.phaseName || section.phaseName || "",
              workCategoryLabel: inputSection?.workCategoryLabel || section.workCategoryLabel || "",
              customerTitle: inputSection?.customerTitle || section.customerDisplayLabel || "",
              estimateMethod: inputSection?.estimateMethod || (section.estimateMethod ?? ""),
              priceVisibilityMode: inputSection?.priceVisibilityMode || (section.priceVisibilityMode ?? "ITEMIZED"),
              clientNotes: inputSection?.clientNotes || (section.clientNotes ?? ""),
              internalNotes: inputSection?.internalNotes || (section.internalNotes ?? ""),
              laborLines: inputSection?.laborLines ?? [],
              materials: inputSection?.materials ?? section.materials.map((m) => ({
                key: nextMaterialDraftKey(),
                inventoryItemId: m.inventoryItemId,
                type: m.lineType ?? "CUSTOM",
                name: m.nameSnapshot,
                unit: m.unitSnapshot,
                quantity: String(m.quantity ?? ""),
                unitCost: String(m.unitCostSnapshot ?? ""),
                manualTotal: m.manualTotalAmount == null ? "" : String(m.manualTotalAmount),
                coveragePerUnit: m.coveragePerUnitSnapshot == null ? "" : String(m.coveragePerUnitSnapshot),
                wastePercent: m.wastePercentSnapshot == null ? "" : String(m.wastePercentSnapshot),
                adjustedQuantity: m.adjustedQuantity == null ? "" : String(m.adjustedQuantity),
                note: m.internalNotes ?? "",
                priceSourceType: m.priceSourceType ?? null,
                priceSourceLabel: m.priceSourceLabel ?? "",
                priceSourceExpenseId: m.priceSourceExpenseId ?? null,
                priceSourceExpenseLineItemId: m.priceSourceExpenseLineItemId ?? null,
              })),
              unitPrice: inputSection?.unitPrice ?? null,
              manualTotal: inputSection?.manualTotal ?? null,
              production: inputSection?.production ?? null,
            };
          })
        : buildLegacySections(proposal),
      options: proposal.options.map((o) => ({
        title: o.title,
        description: o.description || "",
        scope: o.scope || "",
        price: o.price == null ? "" : String(o.price),
        isVisible: o.isVisible,
        sortOrder: o.sortOrder,
      })),
      attachments: proposal.attachments.map((a) => ({
        category: a.category,
        fileName: a.fileName,
        fileUrl: a.fileUrl || "",
        notes: a.notes || "",
        sortOrder: a.sortOrder,
      })),
      paintColors: proposal.paintColors.map((p) => ({
        area: p.area,
        brand: p.brand || "",
        product: p.product || "",
        colorName: p.colorName,
        colorCode: p.colorCode || "",
        finish: p.finish || "",
        notes: p.notes || "",
        sortOrder: p.sortOrder,
      })),
    });
  }, [proposal, config.data]);

  const archiveProposal = api.proposals.delete.useMutation({
    onSuccess: () => {
      utils.proposals.byId.invalidate({ id });
      utils.proposals.list.invalidate();
      toast.success("Proposal archived");
      setConfirmDeleteOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showProjectDetails, setShowProjectDetails] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

  const isReadOnly = form.status === "converted";
  const savedOptionsPreview = useMemo(
    () =>
      form.options.filter((o) =>
        isMeaningfulRow([o.title, o.description, o.scope]) || o.price.trim().length > 0
      ),
    [form.options]
  );

  const savedAttachmentsPreview = useMemo(
    () =>
      form.attachments.filter((a) =>
        isMeaningfulRow([a.category, a.fileName, a.fileUrl, a.notes])
      ),
    [form.attachments]
  );

  const savedPaintColorsPreview = useMemo(
    () =>
      form.paintColors.filter((p) =>
        isMeaningfulRow([p.area, p.brand, p.product, p.colorName, p.colorCode, p.finish, p.notes])
      ),
    [form.paintColors]
  );

  const savedSectionsPreview = useMemo(
    () =>
      form.sections.filter((section) =>
        isMeaningfulRow([section.title, section.description, section.notes]) || section.bulletItems.some((item) => item.trim().length > 0)
      ),
    [form.sections]
  );

  const greetingSection = useMemo(
    () =>
      savedSectionsPreview.find(
        (section) => section.templateKey === "greeting" || section.title.toLowerCase().includes("greeting")
      ),
    [savedSectionsPreview]
  );

  const previewWorkItemsByKey = useMemo(
    () => new Map(estimatorSummary.totals.workItems.map((item) => [item.key, item])),
    [estimatorSummary.totals.workItems]
  );

  const groupedPreviewPrices = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const item of estimatorSummary.totals.workItems) {
      if (item.priceVisibility !== "GROUPED") continue;
      const current = grouped.get(item.areaName) ?? 0;
      grouped.set(item.areaName, current + item.allocatedCustomerPrice);
    }
    return Array.from(grouped.entries()).map(([areaName, total]) => ({ areaName, total }));
  }, [estimatorSummary.totals.workItems]);

  const activityItems = useMemo(() => {
    if (!proposal) return [] as { label: string; timestamp: Date; detail?: string }[];

    const items: { label: string; timestamp: Date; detail?: string }[] = [
      { label: "Proposal Created", timestamp: new Date(proposal.createdAt), detail: proposal.proposalNumber },
    ];

    if (new Date(proposal.updatedAt).getTime() !== new Date(proposal.createdAt).getTime()) {
      items.push({ label: "Proposal Edited", timestamp: new Date(proposal.updatedAt), detail: proposal.projectName });
    }

    proposal.sections.forEach((section) => {
      items.push({ label: "Section Added", timestamp: new Date(section.createdAt), detail: section.title });
    });

    proposal.options.forEach((option) => {
      items.push({ label: "Option Added", timestamp: new Date(option.createdAt), detail: option.title });
    });

    proposal.paintColors.forEach((color) => {
      items.push({ label: "Paint Color Added", timestamp: new Date(color.createdAt), detail: `${color.area}: ${color.colorName}` });
    });

    proposal.attachments.forEach((attachment) => {
      items.push({ label: "Attachment Uploaded", timestamp: new Date(attachment.createdAt), detail: attachment.fileName });
    });

    const statusLabel =
      proposal.status === "declined" ? "Rejected" : proposal.status === "follow_up" ? "Follow Up" : proposal.status;
    items.push({ label: "Status Changed", timestamp: new Date(proposal.updatedAt), detail: statusLabel });

    if (proposal.sentAt) items.push({ label: "Status Changed", timestamp: new Date(proposal.sentAt), detail: "Sent" });
    if (proposal.approvedAt) items.push({ label: "Status Changed", timestamp: new Date(proposal.approvedAt), detail: "Approved" });
    if (proposal.status === "converted") items.push({ label: "Converted to Job", timestamp: new Date(proposal.updatedAt), detail: "Converted" });

    return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [proposal]);

  const onSave = () => {
    const legacyMaterialsBudget = estimatorSummary.hasEstimatorData ? estimatorSummary.totals.materialsCost : form.materialsBudget;
    const legacyLaborBudget = estimatorSummary.hasEstimatorData ? estimatorSummary.totals.directLaborCost : form.laborBudget;
    const legacySubcontractorBudget = form.otherCosts.find((line) => line.key === "subcontractors")?.amount ?? form.subcontractorBudget;
    const totalAmount = estimatorSummary.hasEstimatorData ? displayFinalProposalPrice : form.totalAmount;

    const optionsPayload = form.options
      .filter((o) => isMeaningfulRow([o.title, o.description, o.scope]) || o.price.trim().length > 0)
      .map((o, index) => {
        const parsedPrice = parseCurrencyValue(o.price);
        return {
          title: o.title.trim() || `Option ${index + 1}`,
          description: o.description.trim() || undefined,
          scope: o.scope.trim() || undefined,
          price: o.price.trim() === "" || !Number.isFinite(parsedPrice) ? null : parsedPrice,
          isVisible: o.isVisible,
          sortOrder: o.sortOrder || index,
        };
      });

    const attachmentsPayload = form.attachments
      .filter((a) => isMeaningfulRow([a.category, a.fileName, a.fileUrl, a.notes]))
      .map((a, index) => ({
        category: a.category.trim() || "other",
        fileName: a.fileName.trim() || `Attachment ${index + 1}`,
        fileUrl: a.fileUrl.trim() || undefined,
        notes: a.notes.trim() || undefined,
        sortOrder: a.sortOrder || index,
      }));

    const paintColorsPayload = form.paintColors
      .filter((p) => isMeaningfulRow([p.area, p.brand, p.product, p.colorName, p.colorCode, p.finish, p.notes]))
      .map((p, index) => ({
        area: p.area.trim() || "General",
        brand: p.brand.trim() || undefined,
        product: p.product.trim() || undefined,
        colorName: p.colorName.trim() || "Unspecified",
        colorCode: p.colorCode.trim() || undefined,
        finish: p.finish.trim() || undefined,
        notes: p.notes.trim() || undefined,
        sortOrder: p.sortOrder || index,
      }));

    const sectionsPayload = form.sections
      .filter((section) => isMeaningfulRow([section.title, section.description, section.notes]) || section.bulletItems.some((item) => item.trim().length > 0) || hasEstimatorContent(section))
      .map((section, index) => ({
        key: section.key,
        templateKey: section.templateKey || undefined,
        title: section.title.trim() || `Section ${index + 1}`,
        customerTitle: section.customerTitle.trim() || undefined,
        description: section.description.trim() || undefined,
        bulletItems: section.bulletItems.map((item) => item.trim()).filter(Boolean),
        notes: section.notes.trim() || undefined,
        sortOrder: section.sortOrder || index,
        areaName: section.areaName?.trim() || section.title.trim() || undefined,
        phaseName: section.phaseName.trim() || undefined,
        workCategoryLabel: section.workCategoryLabel.trim() || undefined,
        estimateMethod: section.estimateMethod || null,
        priceVisibilityMode: section.priceVisibilityMode,
        clientNotes: section.clientNotes.trim() || undefined,
        internalNotes: section.internalNotes.trim() || undefined,
        laborLines: section.laborLines
          .filter((line) => line.label.trim().length > 0 || Number(line.manualTotalOverride) > 0 || Number(line.workers) > 0)
          .map((line) => ({
            key: line.key,
            label: line.label.trim() || "Labor",
            mode: line.mode,
            workers: Number(line.workers) || 0,
            hoursPerWorker: line.hoursPerWorker.trim() ? Number(line.hoursPerWorker) : null,
            days: line.days.trim() ? Number(line.days) : null,
            hoursPerDay: line.hoursPerDay.trim() ? Number(line.hoursPerDay) : null,
            hourlyCost: Number(line.hourlyCost) || 0,
            manualTotalOverride: line.manualTotalOverride.trim() ? Number(line.manualTotalOverride) : null,
            internalNote: line.internalNote.trim() || undefined,
          })),
        materials: section.materials
          .filter((m) => m.name.trim().length > 0)
          .map((m, mIndex) => ({
            key: m.key,
            inventoryItemId: m.inventoryItemId,
            type: m.type,
            name: m.name.trim(),
            unit: m.unit.trim() || "unit",
            quantity: m.quantity.trim() ? Number(m.quantity) : null,
            unitCost: m.unitCost.trim() ? Number(m.unitCost) : null,
            manualTotal: m.manualTotal.trim() ? Number(m.manualTotal) : null,
            coveragePerUnit: m.coveragePerUnit.trim() ? Number(m.coveragePerUnit) : null,
            wastePercent: m.wastePercent.trim() ? Number(m.wastePercent) : 0,
            adjustedQuantity: m.adjustedQuantity.trim() ? Number(m.adjustedQuantity) : null,
            note: m.note.trim() || undefined,
            priceSourceType: m.priceSourceType,
            priceSourceLabel: m.priceSourceLabel.trim() || undefined,
            priceSourceExpenseId: m.priceSourceExpenseId,
            priceSourceExpenseLineItemId: m.priceSourceExpenseLineItemId,
            sortOrder: mIndex,
          })),
        unitPrice: section.unitPrice
          ? {
              templateId: section.unitPrice.templateId,
              serviceName: section.unitPrice.serviceName.trim() || undefined,
              variantName: section.unitPrice.variantName.trim() || undefined,
              unitLabel: section.unitPrice.unitLabel.trim() || undefined,
              quantity: Number(section.unitPrice.quantity) || 0,
              pricePerUnit: Number(section.unitPrice.pricePerUnit) || 0,
              lineTotalOverride: section.unitPrice.lineTotalOverride.trim() ? Number(section.unitPrice.lineTotalOverride) : null,
              laborAllowance: section.unitPrice.laborAllowance.trim() ? Number(section.unitPrice.laborAllowance) : null,
              materialAllowance: section.unitPrice.materialAllowance.trim() ? Number(section.unitPrice.materialAllowance) : null,
              note: section.unitPrice.note.trim() || undefined,
              rateSource: section.unitPrice.rateSource,
            }
          : null,
        manualTotal: section.manualTotal
          ? {
              customerTotal: Number(section.manualTotal.customerTotal) || 0,
              internalCost: section.manualTotal.internalCost.trim() ? Number(section.manualTotal.internalCost) : null,
              note: section.manualTotal.note.trim() || undefined,
            }
          : null,
        production: section.production
          ? {
              workCategory: section.production.workCategory.trim() || undefined,
              surfaceType: section.production.surfaceType.trim() || undefined,
              measurementUnit: section.production.measurementUnit.trim() || undefined,
              measurementValue: Number(section.production.measurementValue) || 0,
              productionRateBasis: section.production.productionRateBasis,
              productionRateValue: Number(section.production.productionRateValue) || 0,
              calculatedLaborHours: section.production.calculatedLaborHours.trim() ? Number(section.production.calculatedLaborHours) : null,
              adjustedLaborHours: section.production.adjustedLaborHours.trim() ? Number(section.production.adjustedLaborHours) : null,
              crewSize: section.production.crewSize.trim() ? Number(section.production.crewSize) : null,
              hoursPerDay: section.production.hoursPerDay.trim() ? Number(section.production.hoursPerDay) : null,
              hourlyCostPerWorker: section.production.hourlyCostPerWorker.trim() ? Number(section.production.hourlyCostPerWorker) : null,
              note: section.production.note.trim() || undefined,
              productionRateId: section.production.productionRateId,
            }
          : null,
      }));

    update.mutate({
      id,
      data: {
        customerId: form.customerId > 0 ? form.customerId : null,
        projectName: form.projectName,
        address: form.address,
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        status: form.status,
        proposalTemplate: form.proposalTemplate,
        proposalType: form.proposalType,
        projectSummary: form.projectSummary,
        scopeOfWork: form.scopeOfWork,
        includedWork: form.includedWork,
        exclusions: form.exclusions,
        importantNotes: form.importantNotes,
        recommendations: form.recommendations,
        closingText: form.closingText,
        aiAssistantNotes: form.aiAssistantNotes,
        notes: form.notes,
        emailBody: form.emailBody,
        referencesText: form.referencesText,
        termsAndConditions: form.termsAndConditions,
        paymentSchedule: form.paymentSchedule,
        materialsBudget: legacyMaterialsBudget,
        laborBudget: legacyLaborBudget,
        subcontractorBudget: legacySubcontractorBudget,
        totalAmount,
        estimatePricingMethod: "GROSS_MARGIN",
        estimateTargetMarginPercent: form.desiredProfitMarginPercent.trim() ? Number(form.desiredProfitMarginPercent) : null,
        estimateTargetMarkupPercent: null,
        estimatePriceOverride: form.estimatePriceOverride.trim() ? Number(form.estimatePriceOverride) : null,
        estimateSubcontractorCost: form.otherCosts.find((line) => line.key === "subcontractors")?.amount ?? 0,
        estimateEquipmentCost: form.otherCosts.find((line) => line.key === "equipment")?.amount ?? 0,
        estimateLogisticsCost: form.otherCosts.find((line) => line.key === "travel")?.amount ?? 0,
        estimateMiscProjectCost: form.otherCosts.find((line) => line.key === "misc")?.amount ?? 0,
        desiredProfitMarginPercent: form.desiredProfitMarginPercent.trim() ? Number(form.desiredProfitMarginPercent) : null,
        workersCompPercentOverride: form.workersCompPercentOverride.trim() ? Number(form.workersCompPercentOverride) : null,
        includeWorkersCompInRecommendedPrice: form.includeWorkersCompInRecommendedPrice,
        generalLiabilityMode: form.generalLiabilityMode,
        generalLiabilityPercent: form.generalLiabilityPercent.trim() ? Number(form.generalLiabilityPercent) : null,
        generalLiabilityFlatAmount: form.generalLiabilityFlatAmount.trim() ? Number(form.generalLiabilityFlatAmount) : null,
        includeGeneralLiabilityInRecommendedPrice: form.includeGeneralLiabilityInRecommendedPrice,
        massTaxRate: form.massTaxRate.trim() ? Number(form.massTaxRate) : null,
        federalTaxRate: form.federalTaxRate.trim() ? Number(form.federalTaxRate) : null,
        showTaxPlanning: form.showTaxPlanning,
        includeTaxReserveInRecommendedPrice: form.includeTaxReserveInRecommendedPrice,
        otherCosts: form.otherCosts,
        estimateWorkItems: form.estimateWorkItems.map(serializePricingWorkItem),
        expectedStartDate: form.expectedStartDate ? new Date(form.expectedStartDate) : null,
        expectedEndDate: form.expectedEndDate ? new Date(form.expectedEndDate) : null,
        sections: sectionsPayload,
        options: optionsPayload,
        attachments: attachmentsPayload,
        paintColors: paintColorsPayload,
      },
    });
  };

  const selectCustomer = (customer: {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  }) => {
    setForm((f) => ({
      ...f,
      customerId: customer.id,
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zipCode: customer.zipCode || "",
    }));
    setCustomerSearch(customer.name);
    setShowCustomerResults(false);
  };

  const applyTemplate = (template: (typeof PROPOSAL_TEMPLATES)[number]) => {
    const preset = TEMPLATE_PRESETS[template];
    setForm((f) => ({
      ...f,
      proposalTemplate: template,
      projectSummary: preset.projectSummary,
      scopeOfWork: preset.scopeOfWork,
      includedWork: preset.includedWork,
      exclusions: preset.exclusions,
      recommendations: preset.recommendations,
      importantNotes: preset.importantNotes,
      referencesText: preset.referencesText,
      closingText: preset.closingText,
    }));
  };

  const addSection = (templateKey: (typeof SECTION_TEMPLATES)[number], areaName?: string) => {
    const preset = SECTION_PRESETS[templateKey];
    setForm((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          key: nextSectionDraftKey(),
          ...preset,
          ...EMPTY_ESTIMATE_FIELDS,
          areaName: areaName?.trim() || "",
          bulletItems: [...preset.bulletItems],
          sortOrder: current.sections.length,
        },
      ],
    }));
  };

  const duplicateSection = (index: number) => {
    setForm((current) => {
      const target = current.sections[index];
      return {
        ...current,
        sections: current.sections.flatMap((section, i) =>
          i === index
            ? [
                section,
                {
                  ...target,
                  key: nextSectionDraftKey(),
                  bulletItems: [...target.bulletItems],
                  laborLines: target.laborLines.map((line) => ({ ...line, key: nextLaborDraftKey() })),
                  materials: target.materials.map((m) => ({ ...m, key: nextMaterialDraftKey() })),
                  sortOrder: current.sections.length,
                },
              ]
            : [section]
        ),
      };
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setForm((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.sections.length) return current;
      const sections = [...current.sections];
      const [item] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, item);
      return {
        ...current,
        sections: sections.map((section, sortOrder) => ({ ...section, sortOrder })),
      };
    });
  };

  const openAttachmentPicker = () => attachmentInputRef.current?.click();

  const previewAttachment = (attachment: AttachmentDraft) => {
    if (!attachment.fileUrl) {
      toast.error("Preview not available. Please download this file.");
      return;
    }

    const fileName = attachment.fileName.toLowerCase();
    const dataUrl = attachment.fileUrl.toLowerCase();
    const isImage = dataUrl.startsWith("data:image/") || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(fileName);
    const isPdf = dataUrl.startsWith("data:application/pdf") || fileName.endsWith(".pdf");

    if (!isImage && !isPdf) {
      toast.error("Preview not available. Please download this file.");
      return;
    }

    window.open(attachment.fileUrl, "_blank", "noopener,noreferrer");
  };

  const onAttachmentSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileUrl = await readFileAsDataUrl(file);
    setForm((current) => ({
      ...current,
      attachments: [
        ...current.attachments,
        {
          category: selectedAttachmentCategory,
          fileName: file.name,
          fileUrl,
          notes: "",
          sortOrder: current.attachments.length,
        },
      ],
    }));
    event.target.value = "";
  };

  if (isLoading || !proposal) return <div className="text-slate-500">Loading…</div>;

  const isLinked = proposal.customerId != null;

  return (
    <>
      <PageHeader
        title={proposal.projectName || "Untitled proposal"}
        description={`${proposal.proposalNumber} · ${proposal.customer?.name ?? "Client not linked"}`}
        actions={
          <div className="flex items-center gap-2">
            {isLinked && (
              <Link href={`/customers/${proposal.customerId}`} className="btn btn-secondary">
                Open Customer
              </Link>
            )}
            <div className="relative">
              <button
                type="button"
                className="btn btn-secondary"
                aria-label="Proposal actions"
                onClick={() => setShowDeleteMenu((value) => !value)}
              >
                ⋯
              </button>
              {showDeleteMenu && (
                <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      setShowDeleteMenu(false);
                      setConfirmDeleteOpen(true);
                    }}
                  >
                    Delete Proposal
                  </button>
                </div>
              )}
            </div>
            <button className="btn btn-primary" disabled={update.isPending || isReadOnly} onClick={onSave}>
              {update.isPending ? "Saving..." : "Save Proposal"}
            </button>
          </div>
        }
      />

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Proposal</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
              <span>{proposal.proposalNumber}</span>
              <span className="text-slate-400">•</span>
              <span>{proposal.projectName || "Untitled proposal"}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-700">{proposal.status}</span>
              <span>{proposal.customer?.name ?? "Client not linked"}</span>
              {(proposal.city || proposal.address) && (
                <>
                  <span className="text-slate-400">•</span>
                  <span>{[proposal.city, proposal.state].filter(Boolean).join(", ") || proposal.address}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowProjectDetails((value) => !value)}
            >
              Edit project details
            </button>
            {proposal.customerId && !isReadOnly && (
              <button
                className="btn btn-secondary"
                disabled={convertToJob.isPending || !proposal.customerId || !form.projectName.trim()}
                onClick={() => {
                  if (!proposal.customerId) {
                    toast.error("Client not linked. Link a customer before converting to a Job.");
                    return;
                  }
                  if (!form.projectName.trim()) {
                    toast.error("Add a project name before converting to a Job.");
                    return;
                  }
                  convertToJob.mutate({ id });
                }}
              >
                {convertToJob.isPending ? "Converting…" : "Convert to Job"}
              </button>
            )}
          </div>
        </div>

        {showProjectDetails && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
              <div className="md:col-span-2">
                <label className="label">Customer</label>
                <div className="relative">
                  <input
                    className="input"
                    value={customerSearch}
                    onFocus={() => setShowCustomerResults(true)}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerResults(true);
                    }}
                    disabled={isReadOnly}
                    placeholder="Search customer"
                  />
                  {showCustomerResults && customerSearch.trim().length > 0 && !isReadOnly && (
                    <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {customers.isLoading ? (
                        <div className="px-3 py-2 text-sm text-slate-500">Searching...</div>
                      ) : customers.data && customers.data.length > 0 ? (
                        customers.data.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                            onClick={() => selectCustomer(c)}
                          >
                            <div className="text-sm font-medium text-slate-900">{c.name}</div>
                            <div className="text-xs text-slate-600">{c.address || "No address on file"}</div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">No matching customers.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <FieldText label="Project Name" value={form.projectName} onChange={(v) => setForm((f) => ({ ...f, projectName: v }))} disabled={isReadOnly} />
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => {
                    const next = e.target.value as (typeof PROPOSAL_STATUSES)[number];
                    if ((next === "sent" || next === "approved") && form.customerId <= 0) {
                      toast.error("Client not linked. Link a customer before you can send or approve this proposal.");
                      return;
                    }
                    setForm((f) => ({ ...f, status: next }));
                  }}
                  disabled={isReadOnly}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                  {form.status === "follow_up" ? <option value="follow_up">Follow Up (Legacy)</option> : null}
                </select>
              </div>

              <FieldText label="Property Address" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} disabled={isReadOnly} className="md:col-span-2" />
              <FieldText label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} disabled={isReadOnly} />
              <FieldText label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} disabled={isReadOnly} />
              <FieldText label="ZIP" value={form.zipCode} onChange={(v) => setForm((f) => ({ ...f, zipCode: v }))} disabled={isReadOnly} />
              <FieldDate label="Expected Start" value={form.expectedStartDate} onChange={(v) => setForm((f) => ({ ...f, expectedStartDate: v }))} disabled={isReadOnly} />
              <FieldDate label="Expected Finish" value={form.expectedEndDate} onChange={(v) => setForm((f) => ({ ...f, expectedEndDate: v }))} disabled={isReadOnly} />
            </div>
          </div>
        )}
      </div>

      {isReadOnly && (
        <div className="card p-4 mb-4 border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          This proposal is converted and now read-only. Operational updates should happen in the Job workspace.
        </div>
      )}

      {!isLinked && !isReadOnly && (
        <div className="card p-4 mb-4 border border-slate-300 bg-slate-50 text-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-semibold">Client not linked.</span>{" "}
            You can keep estimating this draft. A customer is only required before you send, approve, or convert it to a Job.
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => setLinkClientOpen((v) => !v)}>
            {linkClientOpen ? "Cancel" : "Link Client"}
          </button>
        </div>
      )}

      {linkClientOpen && !isLinked && (
        <div className="card p-4 mb-4 relative">
          <label className="label">Search existing customers</label>
          <input
            className="input"
            placeholder="Search by name…"
            value={linkClientSearch}
            onChange={(e) => setLinkClientSearch(e.target.value)}
          />
          {linkClientSearch.trim().length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-md max-h-56 overflow-auto">
              {linkClientCustomers.data?.length ? (
                linkClientCustomers.data.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                    disabled={linkClient.isPending}
                    onClick={() => linkClient.mutate({ id, customerId: c.id })}
                  >
                    {c.name}
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-sm text-slate-500">No matches. Create the customer from the Customers page, then search here.</div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Proposal"
        message="Are you sure you want to delete this proposal? This cannot be undone."
        confirmLabel="Delete Proposal"
        destructive
        isPending={archiveProposal.isPending}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => archiveProposal.mutate({ id })}
      />

      <div className="card p-2 mb-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={[
                "px-3 py-2 rounded-md text-sm font-medium transition",
                tab === t.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "pricing" && (
        <div className="sticky top-0 z-10 mb-4 overflow-x-auto border-b border-slate-200 bg-white/95 backdrop-blur-sm pb-3 pt-1">
          <div className="flex min-w-max items-center gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Internal cost</div>
            <div className="text-sm font-semibold text-slate-900">{formatCurrency(estimatorSummary.totals.totalInternalCost)}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Recommended</div>
            <div className="text-sm font-semibold text-slate-900">{formatCurrency(estimatorSummary.totals.recommendedCustomerPrice)}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Final</div>
            <div className="text-sm font-semibold text-slate-900">{formatCurrency(displayFinalProposalPrice)}</div>
            <button className="btn btn-primary ml-auto" disabled={update.isPending || isReadOnly} onClick={onSave}>
              {update.isPending ? "Saving..." : "Save Proposal"}
            </button>
          </div>
        </div>
      )}

      {tab === "scope" && (
        <div className="grid md:grid-cols-[280px,1fr] gap-4">
          <div className="card p-5 h-fit">
            <h2 className="text-base font-semibold mb-3">Proposal Builder</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Proposal Template</label>
                <select
                  className="input"
                  value={form.proposalTemplate || ""}
                  onChange={(e) => {
                    const template = e.target.value as (typeof PROPOSAL_TEMPLATES)[number] | "";
                    if (!template) {
                      setForm((f) => ({ ...f, proposalTemplate: null }));
                      return;
                    }
                    applyTemplate(template);
                  }}
                  disabled={isReadOnly}
                >
                  <option value="">Select template</option>
                  {PROPOSAL_TEMPLATES.map((template) => (
                    <option key={template} value={template}>{template.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Proposal Type</label>
                <select
                  className="input"
                  value={form.proposalType || ""}
                  onChange={(e) => setForm((f) => ({ ...f, proposalType: e.target.value ? (e.target.value as (typeof PROPOSAL_TYPES)[number]) : null }))}
                  disabled={isReadOnly}
                >
                  <option value="">Select type</option>
                  {PROPOSAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <FieldArea label="AI Draft Notes" value={form.aiAssistantNotes} onChange={(v) => setForm((f) => ({ ...f, aiAssistantNotes: v }))} disabled={isReadOnly} />
              <button
                className="btn btn-secondary w-full"
                disabled={isReadOnly || generateProposalDraft.isPending || !form.aiAssistantNotes.trim()}
                onClick={() =>
                  generateProposalDraft.mutate({
                    aiDraftNotes: form.aiAssistantNotes,
                    proposalTemplate: form.proposalTemplate,
                    proposalType: form.proposalType,
                    customerName: customerSearch,
                    projectName: form.projectName,
                    options: form.options.map((option) => ({
                      title: option.title,
                      description: option.description,
                      price: (() => {
                        const parsed = parseCurrencyValue(option.price);
                        return option.price.trim() && Number.isFinite(parsed) ? parsed : null;
                      })(),
                    })),
                    attachments: form.attachments.map((attachment) => attachment.fileName).filter(Boolean),
                  })
                }
              >
                {generateProposalDraft.isPending ? "Generating..." : "Generate Proposal"}
              </button>
              {selectedExamples.length > 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Proposal generated using</div>
                  <div className="space-y-1">
                    {selectedExamples.map((example) => (
                      <div key={example.id} className="text-slate-700">
                        ✓ {example.title}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <FieldArea label="Proposal Notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} disabled={isReadOnly} />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-wrap gap-2 items-end justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Areas & Scope Items</h2>
                <p className="text-sm text-slate-500">Write the customer-facing project description. Pricing is handled independently on the Pricing tab.</p>
              </div>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Area name"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  disabled={isReadOnly}
                />
                <select className="input" value={selectedSectionTemplate} onChange={(e) => setSelectedSectionTemplate(e.target.value as (typeof SECTION_TEMPLATES)[number])} disabled={isReadOnly}>
                  {SECTION_TEMPLATES.map((template) => <option key={template} value={template}>{template.replace(/_/g, " ")}</option>)}
                </select>
                <button
                  className="btn btn-secondary"
                  disabled={isReadOnly}
                  onClick={() => {
                    addSection(selectedSectionTemplate, newAreaName);
                    setNewAreaName("");
                  }}
                >
                  Add Scope Item
                </button>
              </div>
            </div>

            <FieldArea label="Project Summary" value={form.projectSummary} onChange={(v) => setForm((f) => ({ ...f, projectSummary: v }))} disabled={isReadOnly} className="mb-4" />

            {estimatorSummary.areas.length > 0 ? (
              <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-medium text-slate-900 mb-2">Area Totals</div>
                <div className="grid gap-2 md:grid-cols-3">
                  {estimatorSummary.areas.map((area) => (
                    <div key={area.areaName} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                      <div className="font-medium">{area.areaName}</div>
                      <div className="text-slate-600 mt-1">{area.workItems.length} item{area.workItems.length === 1 ? "" : "s"}</div>
                      <div className="text-slate-600">Direct labor: {formatCurrency(area.directLaborCost)}</div>
                      <div className="text-slate-600">Internal cost: {formatCurrency(area.internalCost)}</div>
                      <div className="font-semibold mt-1">Allocated price: {formatCurrency(area.allocatedCustomerPrice)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {form.sections.length === 0 ? (
                <div className="text-sm text-slate-500">No scope items yet. You can add customer-facing areas and descriptions at any time.</div>
              ) : (
                form.sections.map((section, index) => {
                  const collapsed = collapsedSections[index] ?? false;
                  return (
                    <div key={index} className="rounded-md border border-slate-200">
                      <div className="px-3 py-2 flex flex-wrap gap-2 items-center justify-between border-b border-slate-100">
                        <button type="button" className="text-left font-medium" onClick={() => setCollapsedSections((prev) => ({ ...prev, [index]: !collapsed }))}>
                          {collapsed ? "▶" : "▼"} {section.title || `Scope Item ${index + 1}`}
                        </button>
                        <div className="text-xs text-slate-500">
                          {[section.areaName || "General Area", section.phaseName, section.workCategoryLabel, section.estimateMethod].filter(Boolean).join(" · ")}
                        </div>
                        <div className="flex gap-2">
                          <button className="btn btn-secondary" disabled={isReadOnly || index === 0} onClick={() => moveSection(index, -1)}>Up</button>
                          <button className="btn btn-secondary" disabled={isReadOnly || index === form.sections.length - 1} onClick={() => moveSection(index, 1)}>Down</button>
                          <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => duplicateSection(index)}>Duplicate</button>
                          <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, sections: f.sections.filter((_, i) => i !== index).map((item, sortOrder) => ({ ...item, sortOrder })) }))}>Remove</button>
                        </div>
                      </div>
                      {!collapsed && (
                        <div className="p-3 grid md:grid-cols-2 gap-3">
                          <FieldText label="Title" value={section.title} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, title: v } : item) }))} disabled={isReadOnly} className="md:col-span-2" />
                          <FieldArea label="Description" value={section.description} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, description: v } : item) }))} disabled={isReadOnly} className="md:col-span-2" />
                          <FieldArea label="Bullet Items" value={section.bulletItems.join("\n")} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, bulletItems: v.split("\n") } : item) }))} disabled={isReadOnly} />
                          <FieldArea label="Notes" value={section.notes} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, notes: v } : item) }))} disabled={isReadOnly} />
                          <FieldText label="Area / room" value={section.areaName} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, areaName: v } : item) }))} disabled={isReadOnly} />
                          <FieldText label="Customer-visible price group (optional)" value={section.customerTitle} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, customerTitle: v } : item) }))} disabled={isReadOnly} />
                          <FieldArea label="Customer-facing scope description" value={section.clientNotes} onChange={(v) => setForm((f) => ({ ...f, sections: f.sections.map((item, i) => i === index ? { ...item, clientNotes: v } : item) }))} disabled={isReadOnly} className="md:col-span-2" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <div className="space-y-4">
          <ProposalPricingCalculator
            value={form.estimateWorkItems}
            onChange={(estimateWorkItems) => setForm((current) => ({ ...current, estimateWorkItems }))}
            areas={Array.from(new Set(form.sections.map((section) => section.areaName.trim()).filter(Boolean)))}
            disabled={isReadOnly}
            defaultWorkDayHours={estimatorDefaults.defaultWorkDayHours}
            defaultLaborCostRate={estimatorDefaults.defaultLaborCostRate ?? 0}
            makeMaterialKey={nextMaterialDraftKey}
          />

          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-base font-semibold">4. Other Project Costs</h2><p className="text-sm text-slate-500">Add direct costs and choose whether each should affect the recommended customer price.</p></div>
              <button type="button" className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, otherCosts: [...f.otherCosts, { key: `custom-${Date.now()}`, label: "Custom cost", description: "", amount: 0, includeInRecommendedPrice: true, internalNote: "" }] }))}>Add custom cost</button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {["Subcontractors", "Equipment", "Fuel/transportation", "Ferry/tolls", "Lodging", "Permits", "Disposal", "Miscellaneous"].map((label) => (
                <button key={label} type="button" className="btn btn-secondary" disabled={isReadOnly || form.otherCosts.some((cost) => cost.label === label)} onClick={() => setForm((f) => ({ ...f, otherCosts: [...f.otherCosts, { key: label.toLowerCase().replace(/[^a-z]+/g, "-"), label, description: "", amount: 0, includeInRecommendedPrice: true, internalNote: "" }] }))}>+ {label}</button>
              ))}
            </div>
            <div className="space-y-3">
              {form.otherCosts.map((cost, index) => <div key={cost.key} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-5">
                <FieldText label="Category" value={cost.label} onChange={(v) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, label: v } : item) }))} disabled={isReadOnly} />
                <FieldText label="Description" value={cost.description} onChange={(v) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, description: v } : item) }))} disabled={isReadOnly} />
                <FieldNumber label="Amount" value={cost.amount} onChange={(v) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, amount: v } : item) }))} disabled={isReadOnly} />
                <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={cost.includeInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, includeInRecommendedPrice: e.target.checked } : item) }))} />Include in recommended price</label>
                <div className="flex items-end justify-end"><button type="button" className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, otherCosts: f.otherCosts.filter((_, i) => i !== index) }))}>Remove</button></div>
              </div>)}
              {form.otherCosts.length === 0 ? <p className="text-sm text-slate-500">No other project costs.</p> : null}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-base font-semibold">5. Insurance &amp; Labor Burden</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <EstimateStat label="Labor subtotal" value={estimatorSummary.totals.directLaborCost} currency />
              <div><label className="label">Workers' compensation rate %</label><input className="input" type="text" inputMode="decimal" value={form.workersCompPercentOverride} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, workersCompPercentOverride: sanitizeNumericInput(e.target.value) }))} placeholder={String(estimatorDefaults.defaultWcPercent)} /></div>
              <EstimateStat label="Workers' compensation amount" value={estimatorSummary.totals.workersCompAmount} currency />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includeWorkersCompInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, includeWorkersCompInRecommendedPrice: e.target.checked }))} />Include workers' compensation in customer price</label>
              <div><label className="label">General-liability calculation basis</label><select className="input" value={form.generalLiabilityMode} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, generalLiabilityMode: e.target.value as typeof form.generalLiabilityMode }))}><option value="PERCENT_OF_LABOR">% of labor</option><option value="PERCENT_OF_REVENUE">% of revenue</option><option value="FLAT_AMOUNT">Flat amount</option><option value="EXCLUDED">Excluded</option></select></div>
              <div><label className="label">{form.generalLiabilityMode === "FLAT_AMOUNT" ? "General-liability flat amount" : "General-liability rate %"}</label><input className="input" type="text" inputMode="decimal" value={form.generalLiabilityMode === "FLAT_AMOUNT" ? form.generalLiabilityFlatAmount : form.generalLiabilityPercent} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, [f.generalLiabilityMode === "FLAT_AMOUNT" ? "generalLiabilityFlatAmount" : "generalLiabilityPercent"]: sanitizeNumericInput(e.target.value) }))} /></div>
              <EstimateStat label="General-liability amount" value={estimatorSummary.totals.generalLiabilityAmount} currency />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includeGeneralLiabilityInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, includeGeneralLiabilityInRecommendedPrice: e.target.checked }))} />Include general liability in customer price</label>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-base font-semibold">6. Profit &amp; Quote Price</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <EstimateStat label="Labor cost" value={estimatorSummary.totals.directLaborCost} currency /><EstimateStat label="Material cost" value={estimatorSummary.totals.materialsCost} currency /><EstimateStat label="Other project costs" value={estimatorSummary.totals.otherDirectCosts} currency /><EstimateStat label="Insurance cost" value={estimatorSummary.totals.workersCompAmount + estimatorSummary.totals.generalLiabilityAmount} currency />
              <EstimateStat label="Unit-price customer lines" value={estimatorSummary.totals.workItems.filter((item) => item.estimateMethod === "UNIT_PRICE").reduce((sum, item) => sum + item.baseCustomerPrice, 0)} currency /><EstimateStat label="Total internal/project cost" value={estimatorSummary.totals.totalInternalCost} currency />
              <div><label className="label">Desired profit margin %</label><input className="input" type="text" inputMode="decimal" value={form.desiredProfitMarginPercent} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, desiredProfitMarginPercent: sanitizeNumericInput(e.target.value) }))} /></div>
              <EstimateStat label="Profit dollars" value={estimatorSummary.totals.profitDollars} currency /><EstimateStat label="Recommended customer price" value={estimatorSummary.totals.recommendedCustomerPrice} currency highlight />
              <div><label className="label">Authorized final-price override</label><input className="input" type="text" inputMode="decimal" value={form.estimatePriceOverride} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, estimatePriceOverride: sanitizeNumericInput(e.target.value) }))} /></div>
              <EstimateStat label="Actual profit after override" value={estimatorSummary.totals.actualProfit} currency /><EstimateStat label="Actual margin after override" value={estimatorSummary.totals.actualMarginPercent} unit="%" />
            </div>
          </section>

          <section className="card p-5">
            <div className="mb-4"><h2 className="text-base font-semibold">7. Estimated Taxes &amp; Owner Take-Home</h2><p className="text-sm font-medium text-amber-700">Internal planning only. Never shown to the customer.</p></div>
            <div className="grid gap-3 md:grid-cols-3">
              <EstimateStat label="Projected profit before taxes" value={estimatorSummary.totals.projectedProfitBeforeTaxes} currency />
              <div><label className="label">Massachusetts reserve %</label><input className="input" type="text" inputMode="decimal" value={form.massTaxRate} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, massTaxRate: sanitizeNumericInput(e.target.value) }))} placeholder={String(estimatorDefaults.defaultMassTaxRate)} /></div>
              <div><label className="label">Federal reserve %</label><input className="input" type="text" inputMode="decimal" value={form.federalTaxRate} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, federalTaxRate: sanitizeNumericInput(e.target.value) }))} placeholder={String(estimatorDefaults.defaultFederalTaxRate)} /></div>
              <EstimateStat label="Total estimated tax reserve" value={estimatorSummary.totals.totalEstimatedTaxReserve} currency /><EstimateStat label="Estimated owner take-home" value={estimatorSummary.totals.estimatedOwnerTakeHome} currency />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showTaxPlanning} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, showTaxPlanning: e.target.checked }))} />Show tax planning</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includeTaxReserveInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, includeTaxReserveInRecommendedPrice: e.target.checked }))} />Include reserve in recommended price</label>
            </div>
          </section>

          <ProposalPricingCalculator
            section="advanced"
            value={form.estimateWorkItems}
            onChange={(estimateWorkItems) => setForm((current) => ({ ...current, estimateWorkItems }))}
            areas={Array.from(new Set(form.sections.map((section) => section.areaName.trim()).filter(Boolean)))}
            disabled={isReadOnly}
            defaultWorkDayHours={estimatorDefaults.defaultWorkDayHours}
            defaultLaborCostRate={estimatorDefaults.defaultLaborCostRate ?? 0}
            makeMaterialKey={nextMaterialDraftKey}
          />

          <section className="card p-5">
            <h2 className="text-base font-semibold">Estimator Summary</h2>
            {!hasEnteredEstimate ? <p className="mt-2 text-sm text-slate-600">Start with Labor: enter your crew, time, and hourly cost.</p> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <EstimateStat label="Labor" value={estimatorSummary.totals.directLaborCost} currency /><EstimateStat label="Materials" value={estimatorSummary.totals.materialsCost} currency /><EstimateStat label="Unit-price work" value={estimatorSummary.totals.workItems.filter((item) => item.estimateMethod === "UNIT_PRICE").reduce((sum, item) => sum + item.baseCustomerPrice, 0)} currency /><EstimateStat label="Other costs" value={estimatorSummary.totals.otherDirectCosts} currency />
              <EstimateStat label="Workers' compensation" value={estimatorSummary.totals.workersCompAmount} currency /><EstimateStat label="General liability" value={estimatorSummary.totals.generalLiabilityAmount} currency /><EstimateStat label="Total internal cost" value={estimatorSummary.totals.totalInternalCost} currency /><EstimateStat label="Desired profit" value={estimatorSummary.totals.profitDollars} currency />
              <EstimateStat label="Recommended customer price" value={estimatorSummary.totals.recommendedCustomerPrice} currency highlight /><EstimateStat label="Final customer price" value={displayFinalProposalPrice} currency highlight /><EstimateStat label="Estimated taxes" value={estimatorSummary.totals.totalEstimatedTaxReserve} currency /><EstimateStat label="Estimated owner take-home" value={estimatorSummary.totals.estimatedOwnerTakeHome} currency />
            </div>
          </section>

          <div className="hidden">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base font-semibold">Estimator Controls</h2>
                  <p className="text-sm text-slate-500">Set margin, other project costs, insurance, taxes, and any final override.</p>
                </div>
                {estimatorSummary.hasEstimatorData ? (
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Final customer price</div>
                    <div className="text-lg font-semibold text-slate-900">{formatCurrency(displayFinalProposalPrice)}</div>
                  </div>
                ) : null}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Desired profit margin %</label>
                  <input className="input" type="text" inputMode="decimal" value={form.desiredProfitMarginPercent} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, desiredProfitMarginPercent: sanitizeNumericInput(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">Authorized final price override</label>
                  <input className="input" type="text" inputMode="decimal" value={form.estimatePriceOverride} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, estimatePriceOverride: sanitizeNumericInput(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">Workers' comp %</label>
                  <input className="input" type="text" inputMode="decimal" value={form.workersCompPercentOverride} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, workersCompPercentOverride: sanitizeNumericInput(e.target.value) }))} placeholder={String(estimatorDefaults.defaultWcPercent)} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.includeWorkersCompInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, includeWorkersCompInRecommendedPrice: e.target.checked }))} />
                    Include workers' comp in recommended price
                  </label>
                </div>
                <div>
                  <label className="label">General liability basis</label>
                  <select className="input" value={form.generalLiabilityMode} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, generalLiabilityMode: e.target.value as typeof form.generalLiabilityMode }))}>
                    <option value="PERCENT_OF_LABOR">% of labor</option>
                    <option value="PERCENT_OF_REVENUE">% of revenue</option>
                    <option value="FLAT_AMOUNT">Flat amount</option>
                    <option value="EXCLUDED">Excluded</option>
                  </select>
                </div>
                <div>
                  <label className="label">{form.generalLiabilityMode === "FLAT_AMOUNT" ? "General liability flat amount" : "General liability rate %"}</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={form.generalLiabilityMode === "FLAT_AMOUNT" ? form.generalLiabilityFlatAmount : form.generalLiabilityPercent}
                    disabled={isReadOnly}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [f.generalLiabilityMode === "FLAT_AMOUNT" ? "generalLiabilityFlatAmount" : "generalLiabilityPercent"]: sanitizeNumericInput(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.includeGeneralLiabilityInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, includeGeneralLiabilityInRecommendedPrice: e.target.checked }))} />
                    Include general liability in recommended price
                  </label>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.showTaxPlanning} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, showTaxPlanning: e.target.checked }))} />
                    Show estimated tax planning
                  </label>
                </div>
                <div>
                  <label className="label">Mass. tax reserve %</label>
                  <input className="input" type="text" inputMode="decimal" value={form.massTaxRate} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, massTaxRate: sanitizeNumericInput(e.target.value) }))} placeholder={String(estimatorDefaults.defaultMassTaxRate)} />
                </div>
                <div>
                  <label className="label">Federal tax reserve %</label>
                  <input className="input" type="text" inputMode="decimal" value={form.federalTaxRate} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, federalTaxRate: sanitizeNumericInput(e.target.value) }))} placeholder={String(estimatorDefaults.defaultFederalTaxRate)} />
                </div>
                <div className="md:col-span-2 flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.includeTaxReserveInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, includeTaxReserveInRecommendedPrice: e.target.checked }))} />
                    Include estimated tax reserve in recommended price
                  </label>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium text-slate-900">Other Project Costs</div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isReadOnly}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        otherCosts: [
                          ...f.otherCosts,
                          { key: `other-${f.otherCosts.length + 1}`, label: "", description: "", amount: 0, includeInRecommendedPrice: true, internalNote: "" },
                        ],
                      }))
                    }
                  >
                    Add Cost
                  </button>
                </div>
                <div className="space-y-3">
                  {form.otherCosts.map((cost, index) => (
                    <div key={cost.key} className="grid gap-3 md:grid-cols-5">
                      <FieldText label="Label" value={cost.label} onChange={(v) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, label: v } : item) }))} disabled={isReadOnly} />
                      <FieldText label="Description" value={cost.description} onChange={(v) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, description: v } : item) }))} disabled={isReadOnly} />
                      <FieldNumber label="Amount" value={cost.amount} onChange={(v) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, amount: v } : item) }))} disabled={isReadOnly} />
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={cost.includeInRecommendedPrice} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, otherCosts: f.otherCosts.map((item, i) => i === index ? { ...item, includeInRecommendedPrice: e.target.checked } : item) }))} />
                          Include in price
                        </label>
                      </div>
                      <div className="flex items-end justify-end">
                        <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, otherCosts: f.otherCosts.filter((_, i) => i !== index) }))}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {form.otherCosts.length === 0 ? <div className="text-sm text-slate-500">No extra project costs yet.</div> : null}
                </div>
              </div>
              <FieldArea label="Payment Schedule" value={form.paymentSchedule} onChange={(v) => setForm((f) => ({ ...f, paymentSchedule: v }))} disabled={isReadOnly} className="mt-4" />
              <FieldArea label="Terms" value={form.termsAndConditions} onChange={(v) => setForm((f) => ({ ...f, termsAndConditions: v }))} disabled={isReadOnly} />
            </div>
            <div className="card p-5">
              <h2 className="text-base font-semibold mb-3">Estimator Summary</h2>
              {!estimatorSummary.hasEstimatorData ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Add scope items on the Scope tab to build the estimate. This summary will roll item calculations into area totals and the full proposal total.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                  <EstimateStat label="Line items subtotal" value={estimatorSummary.totals.lineItemsSubtotal} currency />
                  <EstimateStat label="Direct Labor Cost" value={estimatorSummary.totals.directLaborCost} currency />
                  <EstimateStat label="Materials" value={estimatorSummary.totals.materialsCost} currency />
                  <EstimateStat label="Other Costs" value={estimatorSummary.totals.otherDirectCosts} currency />
                  <EstimateStat label="Workers' Comp" value={estimatorSummary.totals.workersCompAmount} currency />
                  <EstimateStat label="General Liability" value={estimatorSummary.totals.generalLiabilityAmount} currency />
                  <EstimateStat label="Total Internal Cost" value={estimatorSummary.totals.totalInternalCost} currency />
                  <EstimateStat label="Recoverable Project Cost" value={estimatorSummary.totals.recoverableProjectCost} currency />
                  <EstimateStat label="Desired Profit Margin" value={estimatorSummary.totals.desiredProfitMarginPercent} unit="%" />
                  <EstimateStat label="Recommended Price" value={estimatorSummary.totals.recommendedCustomerPrice} currency />
                  <EstimateStat label="Projected Profit" value={estimatorSummary.totals.projectedProfitBeforeTaxes} currency />
                  <EstimateStat label="Estimated Taxes" value={estimatorSummary.totals.totalEstimatedTaxReserve} currency />
                  <EstimateStat label="Owner Take-Home" value={estimatorSummary.totals.estimatedOwnerTakeHome} currency />
                  <EstimateStat label="Actual Profit" value={estimatorSummary.totals.actualProfit} currency />
                  <EstimateStat label="Actual Margin" value={estimatorSummary.totals.actualMarginPercent} unit="%" />
                  <EstimateStat label="Final Proposal Price" value={displayFinalProposalPrice} currency highlight />
                </div>

                <div>
                  <h3 className="font-medium text-slate-900 mb-2">Area Rollups</h3>
                  <div className="space-y-2">
                    {estimatorSummary.areas.map((area) => (
                      <div key={area.areaName} className="rounded-md border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{area.areaName}</div>
                            <div className="text-xs text-slate-500">{area.workItems.length} scope item{area.workItems.length === 1 ? "" : "s"}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div>Internal cost: {formatCurrency(area.internalCost)}</div>
                            <div>Allocated price: {formatCurrency(area.allocatedCustomerPrice)}</div>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                          <div>Direct labor: {formatCurrency(area.directLaborCost)}</div>
                          <div>Material cost: {formatCurrency(area.materialsCost)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="font-medium text-slate-900 mb-2">Compact Summary</div>
                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div>Labor: {formatCurrency(estimatorSummary.totals.directLaborCost)}</div>
                    <div>Materials: {formatCurrency(estimatorSummary.totals.materialsCost)}</div>
                    <div>Other costs: {formatCurrency(estimatorSummary.totals.otherDirectCosts)}</div>
                    <div>Insurance: {formatCurrency(estimatorSummary.totals.workersCompAmount + estimatorSummary.totals.generalLiabilityAmount)}</div>
                    <div>Recommended price: {formatCurrency(estimatorSummary.totals.recommendedCustomerPrice)}</div>
                    <div>Owner take-home: {formatCurrency(estimatorSummary.totals.estimatedOwnerTakeHome)}</div>
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Proposal Options</h2>
              <button
                className="btn btn-secondary"
                disabled={isReadOnly}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    options: [
                      ...f.options,
                      { title: "", description: "", scope: "", price: "", isVisible: true, sortOrder: f.options.length },
                    ],
                  }))
                }
              >
                Add Option
              </button>
            </div>
            <div className="space-y-3">
              {form.options.length === 0 ? (
                <div className="text-sm text-slate-500">No options yet. Add unlimited options for this proposal.</div>
              ) : (
                form.options.map((option, index) => {
                  const collapsed = collapsedOptions[index] ?? false;
                  return (
                    <div key={index} className="rounded-md border border-slate-200">
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left flex items-center justify-between"
                        onClick={() => setCollapsedOptions((prev) => ({ ...prev, [index]: !collapsed }))}
                      >
                        <span className="text-sm font-medium">{option.title || `Option ${index + 1}`}</span>
                        <span className="text-xs text-slate-500">{collapsed ? "Expand" : "Collapse"}</span>
                      </button>
                      {!collapsed && (
                        <div className="px-3 pb-3 grid md:grid-cols-2 gap-3">
                          <FieldText
                            label="Title"
                            value={option.title}
                            onChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                options: f.options.map((current, i) => (i === index ? { ...current, title: v } : current)),
                              }))
                            }
                            disabled={isReadOnly}
                          />
                          <div>
                            <label className="label">Price</label>
                            <input
                              className="input"
                              type="text"
                              inputMode="decimal"
                              value={option.price}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  options: f.options.map((current, i) =>
                                    i === index ? { ...current, price: sanitizeNumericInput(e.target.value) } : current
                                  ),
                                }))
                              }
                            />
                          </div>
                          <FieldArea
                            label="Description"
                            value={option.description}
                            onChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                options: f.options.map((current, i) => (i === index ? { ...current, description: v } : current)),
                              }))
                            }
                            disabled={isReadOnly}
                          />
                          <div>
                            <label className="label">Default Selected</label>
                            <input
                              type="checkbox"
                              checked={option.isVisible}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  options: f.options.map((current, i) => (i === index ? { ...current, isVisible: e.target.checked } : current)),
                                }))
                              }
                            />
                          </div>
                          <div className="md:col-span-2 flex justify-end">
                            <button
                              className="btn btn-secondary mr-2"
                              disabled={isReadOnly}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  options: f.options.flatMap((current, i) =>
                                    i === index ? [current, { ...current, sortOrder: f.options.length }] : [current]
                                  ),
                                }))
                              }
                            >
                              Duplicate
                            </button>
                            <button
                              className="btn btn-secondary"
                              disabled={isReadOnly}
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  options: f.options.filter((_, i) => i !== index),
                                }))
                              }
                            >
                              Remove Option
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "paint-colors" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Paint Colors</h2>
            <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, paintColors: [...f.paintColors, { area: "", brand: "", product: "", colorName: "", colorCode: "", finish: "", notes: "", sortOrder: f.paintColors.length }] }))}>Add Row</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-2 py-2 font-medium">Area</th>
                  <th className="px-2 py-2 font-medium">Brand</th>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Color Name</th>
                  <th className="px-2 py-2 font-medium">Color Code</th>
                  <th className="px-2 py-2 font-medium">Finish</th>
                  <th className="px-2 py-2 font-medium">Notes</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {form.paintColors.map((color, index) => (
                  <tr key={index} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2"><input className="input" value={color.area} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, area: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.brand} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, brand: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.product} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, product: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.colorName} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, colorName: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.colorCode} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, colorCode: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><input className="input" value={color.finish} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, finish: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><textarea className="input min-h-20" value={color.notes} disabled={isReadOnly} onChange={(e) => setForm((f) => ({ ...f, paintColors: f.paintColors.map((item, i) => i === index ? { ...item, notes: e.target.value } : item) }))} /></td>
                    <td className="px-2 py-2"><button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, paintColors: f.paintColors.filter((_, i) => i !== index).map((item, sortOrder) => ({ ...item, sortOrder })) }))}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "attachments" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Attachments</h2>
            <div className="flex gap-2">
              <select className="input" value={selectedAttachmentCategory} onChange={(e) => setSelectedAttachmentCategory(e.target.value as (typeof ATTACHMENT_CATEGORIES)[number])} disabled={isReadOnly}>
                {ATTACHMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <button className="btn btn-secondary" disabled={isReadOnly} onClick={openAttachmentPicker}>Upload</button>
              <input ref={attachmentInputRef} type="file" className="hidden" onChange={onAttachmentSelected} />
            </div>
          </div>
          <div className="space-y-4">
            {form.attachments.length === 0 ? (
              <div className="text-sm text-slate-500">No attachments listed yet.</div>
            ) : (
              form.attachments.map((attachment, index) => (
                <div key={index} className="rounded-md border border-slate-200 p-3 flex flex-wrap gap-3 items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">{attachment.category || "Other"}</div>
                    <div className="font-medium truncate">{attachment.fileName || "Untitled file"}</div>
                    {attachment.notes ? <div className="text-sm text-slate-600 mt-1">{attachment.notes}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-secondary" disabled={!attachment.fileUrl} onClick={() => previewAttachment(attachment)}>Preview</button>
                    <a className={`btn btn-secondary ${!attachment.fileUrl ? "pointer-events-none opacity-50" : ""}`} href={attachment.fileUrl || "#"} download={attachment.fileName || "attachment"}>Download</a>
                    <button className="btn btn-secondary" disabled={isReadOnly} onClick={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((_, i) => i !== index).map((item, sortOrder) => ({ ...item, sortOrder })) }))}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "preview" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Proposal Preview</h2>
          <div className="rounded-md border border-slate-200 p-6 space-y-6 text-sm bg-white">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">I.S. Painting Proposal</div>
              <div className="text-2xl font-semibold mt-1">{form.projectName || "Untitled Proposal"}</div>
              <div className="text-slate-600 mt-2">{proposal.proposalNumber} · {customerSearch || "Customer"}</div>
              <div className="text-slate-600">{[form.address, form.city, form.state, form.zipCode].filter(Boolean).join(", ") || "Address pending"}</div>
            </div>

            <div className="text-base text-slate-800 whitespace-pre-wrap">
              {greetingSection?.description || `Hi ${customerSearch || "there"},`}
            </div>

            <PreviewSection title="Project Summary" text={form.projectSummary} />

            <div>
              <h3 className="font-semibold mb-2">Proposal Sections</h3>
              {savedSectionsPreview.length === 0 ? (
                <p className="text-slate-500">No proposal sections added.</p>
              ) : (
                <div className="space-y-4">
                  {savedSectionsPreview
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((section, index) => {
                      const pricedWorkItem = previewWorkItemsByKey.get(section.key);
                      return (
                      <div key={`${section.title}-${index}`} className="border border-slate-100 rounded-md p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-semibold text-base mb-2">{section.customerTitle || section.title}</div>
                          {pricedWorkItem && pricedWorkItem.priceVisibility === "ITEMIZED" ? (
                            <div className="font-semibold">{formatCurrency(pricedWorkItem.allocatedCustomerPrice)}</div>
                          ) : null}
                        </div>
                        {section.description ? <p className="text-slate-700 whitespace-pre-wrap mb-2">{section.description}</p> : null}
                        {section.bulletItems.filter((item) => item.trim().length > 0).length ? (
                          <ul className="list-disc ml-5 space-y-1 mb-2">
                            {section.bulletItems.filter((item) => item.trim().length > 0).map((item, bulletIndex) => <li key={bulletIndex}>{item}</li>)}
                          </ul>
                        ) : null}
                        {section.clientNotes ? <p className="text-slate-600 whitespace-pre-wrap mb-2">{section.clientNotes}</p> : null}
                        {section.notes ? <p className="text-slate-600 whitespace-pre-wrap">{section.notes}</p> : null}
                      </div>
                    );})}
                </div>
              )}
            </div>

            {groupedPreviewPrices.length > 0 ? (
              <div>
                <h3 className="font-semibold mb-2">Area Pricing</h3>
                <div className="space-y-2">
                  {groupedPreviewPrices.map((group) => (
                    <div key={group.areaName} className="border border-slate-100 rounded-md p-3 flex items-center justify-between">
                      <span>{group.areaName}</span>
                      <strong>{formatCurrency(group.total)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <PreviewSection title="Recommendations" text={form.recommendations} />
            <PreviewSection title="Important Notes" text={form.importantNotes} />

            <div>
              <h3 className="font-semibold mb-2">Options</h3>
              {savedOptionsPreview.length === 0 ? (
                <p className="text-slate-500">No options added.</p>
              ) : (
                <div className="space-y-2">
                  {savedOptionsPreview
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((o, idx) => (
                      <div key={`${o.title}-${idx}`} className="border border-slate-100 rounded-md p-3">
                        <div className="font-medium">{o.title || `Option ${idx + 1}`}</div>
                        <div className="text-slate-700">{o.description || "No description."}</div>
                        {o.isVisible ? <div className="text-xs uppercase tracking-wide text-brand-700 mt-1">Default Selected</div> : null}
                        <div className="font-semibold mt-1">{o.price.trim() ? formatCurrency(parseCurrencyValue(o.price) || 0) : "TBD"}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Paint Colors</h3>
              {savedPaintColorsPreview.length === 0 ? (
                <p className="text-slate-500">No paint colors added.</p>
              ) : (
                <div className="space-y-2">
                  {savedPaintColorsPreview
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((p, idx) => (
                      <div key={`${p.area}-${p.colorName}-${idx}`} className="border border-slate-100 rounded-md p-3">
                        <div className="font-medium">{p.area || "General"}</div>
                        <div className="text-slate-700">{p.colorName || "Unspecified"}</div>
                        <div className="text-slate-600">{[p.brand, p.product, p.colorCode, p.finish].filter(Boolean).join(" · ") || ""}</div>
                        {p.notes ? <div className="text-slate-600 mt-1">{p.notes}</div> : null}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <PreviewSection title="References" text={form.referencesText} />
            <PreviewSection title="Closing" text={form.closingText} />

            <div>
              <h3 className="font-semibold mb-2">Attachments List</h3>
              {savedAttachmentsPreview.length === 0 ? (
                <p className="text-slate-500">No attachments listed.</p>
              ) : (
                <ul className="list-disc ml-5 space-y-1">
                  {savedAttachmentsPreview
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((a, idx) => (
                      <li key={`${a.fileName}-${idx}`}>{a.category}: {a.fileName || "Untitled file"}</li>
                    ))}
                </ul>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200">
              <h3 className="font-semibold mb-2">Final Investment</h3>
              <div className="grid md:grid-cols-2 gap-2">
                <div className="font-semibold">Total Proposal Price: {formatCurrency(displayFinalProposalPrice)}</div>
              </div>
              <div className="mt-3 grid md:grid-cols-2 gap-3">
                <PreviewSection title="Payment Schedule" text={form.paymentSchedule} />
                <PreviewSection title="Terms" text={form.termsAndConditions} />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "activity" && (
        <div className="card p-5">
          <h2 className="text-base font-semibold mb-3">Activity</h2>
          <div className="space-y-3">
            {activityItems.length === 0 ? (
              <div className="text-sm text-slate-500">No activity yet.</div>
            ) : (
              activityItems.map((item, index) => (
                <div key={`${item.label}-${index}`} className="border-l-2 border-slate-200 pl-4 py-1">
                  <div className="text-sm font-medium">{item.label}</div>
                  {item.detail ? <div className="text-sm text-slate-600">{item.detail}</div> : null}
                  <div className="text-xs text-slate-500 mt-0.5">{formatDateTime(item.timestamp)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
    </div>
  );
}

function EstimateStat({
  label,
  value,
  currency,
  unit,
  highlight,
}: {
  label: string;
  value: number | null;
  currency?: boolean;
  unit?: string;
  highlight?: boolean;
}) {
  const display = value == null ? "Pending" : currency ? formatCurrency(value) : unit ? `${value}${unit}` : String(value);

  return (
    <div className={`rounded-md border px-3 py-2 ${highlight ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{display}</div>
    </div>
  );
}

function PreviewSection({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-slate-700 whitespace-pre-wrap">{text || "—"}</p>
    </div>
  );
}

function buildLegacySections(proposal: {
  scopeOfWork: string | null;
  includedWork: string | null;
  exclusions: string | null;
  recommendations: string | null;
  importantNotes: string | null;
  referencesText: string | null;
  closingText: string | null;
}) {
  const legacy = [
    ["scope_of_work", "Scope of Work", proposal.scopeOfWork],
    ["included_work", "Included Work", proposal.includedWork],
    ["excluded_work", "Excluded Work", proposal.exclusions],
    ["recommendations", "Recommendations", proposal.recommendations],
    ["important_notes", "Important Notes", proposal.importantNotes],
    ["references", "References", proposal.referencesText],
    ["closing", "Closing", proposal.closingText],
  ] as const;

  return legacy
    .filter(([, , value]) => (value || "").trim().length > 0)
    .map(([templateKey, title, value], sortOrder) => ({
      key: nextSectionDraftKey(),
      templateKey,
      title,
      description: value || "",
      bulletItems: [""],
      notes: "",
      sortOrder,
      ...EMPTY_ESTIMATE_FIELDS,
    }));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function FieldText({
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        className="input"
        inputMode="decimal"
        value={String(value)}
        onChange={(e) => {
          const next = Number(sanitizeNumericInput(e.target.value));
          onChange(Number.isFinite(next) ? next : 0);
        }}
        disabled={disabled}
      />
    </div>
  );
}

function FieldDate({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function FieldArea({
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      <textarea className="input min-h-28" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}
