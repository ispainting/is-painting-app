import { calculateMaterialQuantitySnapshot, computeProposalEstimate, computeScopeEstimate, round2, type ProposalEstimateResult } from "./proposal-pricing";

export type ProposalPricingMethod = "GROSS_MARGIN" | "MARKUP";
export type ProposalWorkCategory = "INTERIOR" | "EXTERIOR" | "PREP" | "SPECIALTY";

export type DraftValue = string | number | null | undefined;

export interface DraftMaterialLike {
  name: string;
  quantity?: DraftValue;
  unitCost?: DraftValue;
  markupPercent?: DraftValue;
  coveragePerUnit?: DraftValue;
  wastePercent?: DraftValue;
  adjustedQuantity?: DraftValue;
}

export interface DraftSectionLike {
  title: string;
  areaName?: string | null;
  workCategory?: ProposalWorkCategory | "" | null;
  surfaceType?: string | null;
  measurementValue?: DraftValue;
  coats?: DraftValue;
  calculatedLaborHours?: DraftValue;
  adjustedLaborHours?: DraftValue;
  laborSellRateOverride?: DraftValue;
  additionalCharges?: DraftValue;
  materials: DraftMaterialLike[];
}

export interface ProposalEstimatorDefaults {
  defaultLaborSellRate: number | null;
  defaultLaborCostRate: number | null;
  defaultMarkup: number;
  defaultWcPercent: number;
  defaultOverhead: number;
  defaultProposalPricingMethod: ProposalPricingMethod;
}

export interface ProposalEstimatorPricingInput {
  estimatePricingMethod?: ProposalPricingMethod | null;
  estimateTargetMarginPercent?: DraftValue;
  estimateTargetMarkupPercent?: DraftValue;
  estimatePriceOverride?: DraftValue;
  estimateSubcontractorCost?: DraftValue;
  estimateEquipmentCost?: DraftValue;
  estimateLogisticsCost?: DraftValue;
  estimateMiscProjectCost?: DraftValue;
}

export interface DraftMaterialEstimate {
  name: string;
  quantity: number;
  calculatedQuantity: number | null;
  adjustedQuantity: number | null;
  unitCost: number;
  markupPercent: number;
  materialCost: number;
  sellingPrice: number;
}

export interface DraftSectionEstimate {
  areaName: string;
  title: string;
  workCategory: ProposalWorkCategory | null;
  surfaceType: string;
  measurementValue: number;
  coats: number;
  calculatedLaborHours: number;
  adjustedLaborHours: number | null;
  effectiveLaborHours: number;
  laborSellRate: number | null;
  directLaborCostRate: number;
  directLaborCost: number;
  laborBurdenCost: number;
  loadedLaborCost: number;
  laborSellingPrice: number;
  additionalCharges: number;
  materialsCost: number;
  materialsSellingPrice: number;
  subtotal: number;
  materials: DraftMaterialEstimate[];
}

export interface DraftAreaEstimate {
  areaName: string;
  painterHours: number;
  directLaborCost: number;
  laborBurdenCost: number;
  loadedLaborCost: number;
  materialCost: number;
  materialsSellingPrice: number;
  additionalCharges: number;
  subtotal: number;
  items: DraftSectionEstimate[];
}

export interface DraftProposalEstimateSummary {
  hasEstimatorData: boolean;
  pricingMethod: ProposalPricingMethod;
  targetMarginPercent: number | null;
  targetMarkupPercent: number | null;
  manualPriceOverride: number | null;
  subcontractorCost: number;
  equipmentCost: number;
  logisticsCost: number;
  miscProjectCost: number;
  areas: DraftAreaEstimate[];
  totals: ProposalEstimateResult;
}

export function parseDraftNumber(value: DraftValue): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonNegative(value: DraftValue, fallback = 0): number {
  const parsed = parseDraftNumber(value);
  return parsed != null && parsed >= 0 ? parsed : fallback;
}

export function computeDraftMaterialEstimate(
  material: DraftMaterialLike,
  context: { measurementValue: DraftValue; coats: DraftValue; defaultMarkup: number }
): DraftMaterialEstimate | null {
  const name = material.name.trim();
  if (!name) return null;

  const measurementValue = parseNonNegative(context.measurementValue, 0);
  const coats = parseNonNegative(context.coats, 0);
  const manualQuantity = parseNonNegative(material.quantity, 0);
  const unitCost = parseNonNegative(material.unitCost, 0);
  const markupPercent = parseNonNegative(material.markupPercent, context.defaultMarkup);
  const coveragePerUnit = parseDraftNumber(material.coveragePerUnit);
  const adjustedQuantity = parseDraftNumber(material.adjustedQuantity);
  const wastePercent = parseNonNegative(material.wastePercent, 0);

  let calculatedQuantity: number | null = null;
  let effectiveQuantity = manualQuantity;

  if (coveragePerUnit != null && coveragePerUnit > 0 && measurementValue > 0 && coats > 0) {
    const quantitySnapshot = calculateMaterialQuantitySnapshot({
      measurement: measurementValue,
      coats,
      coveragePerUnit,
      wastePercent,
      adjustedQuantity: adjustedQuantity != null && adjustedQuantity >= 0 ? adjustedQuantity : null,
    });
    calculatedQuantity = quantitySnapshot.calculatedQuantity;
    effectiveQuantity = quantitySnapshot.effectiveQuantity ?? manualQuantity;
  } else if (adjustedQuantity != null && adjustedQuantity >= 0) {
    effectiveQuantity = round2(adjustedQuantity);
  }

  if (!(effectiveQuantity > 0) && calculatedQuantity == null) return null;

  const line = computeScopeEstimate({
    materials: [{ quantity: effectiveQuantity, unitCost, markupPercent }],
    labor: null,
  }).materialLines[0];

  return {
    name,
    quantity: effectiveQuantity,
    calculatedQuantity,
    adjustedQuantity: adjustedQuantity != null && adjustedQuantity >= 0 ? round2(adjustedQuantity) : null,
    unitCost,
    markupPercent,
    materialCost: line?.materialCost ?? 0,
    sellingPrice: line?.sellingPrice ?? 0,
  };
}

export function computeDraftSectionEstimate(
  section: DraftSectionLike,
  defaults: ProposalEstimatorDefaults
): DraftSectionEstimate {
  const measurementValue = parseNonNegative(section.measurementValue, 0);
  const coats = parseNonNegative(section.coats, 0);
  const calculatedLaborHours = parseNonNegative(section.calculatedLaborHours, 0);
  const adjustedLaborHours = parseDraftNumber(section.adjustedLaborHours);
  const effectiveLaborHours = round2(adjustedLaborHours != null && adjustedLaborHours >= 0 ? adjustedLaborHours : calculatedLaborHours);
  const laborSellRateOverride = parseDraftNumber(section.laborSellRateOverride);
  const laborSellRate = effectiveLaborHours > 0
    ? (laborSellRateOverride != null && laborSellRateOverride >= 0 ? laborSellRateOverride : defaults.defaultLaborSellRate)
    : null;
  const directLaborCostRate = defaults.defaultLaborCostRate ?? 0;
  const directLaborCost = round2(effectiveLaborHours * directLaborCostRate);
  const laborBurdenCost = round2(directLaborCost * (defaults.defaultWcPercent / 100));
  const loadedLaborCost = round2(directLaborCost + laborBurdenCost);
  const additionalCharges = parseNonNegative(section.additionalCharges, 0);

  const materials = section.materials
    .map((material) => computeDraftMaterialEstimate(material, { measurementValue, coats, defaultMarkup: defaults.defaultMarkup }))
    .filter((material): material is DraftMaterialEstimate => material != null);

  const materialsCost = round2(materials.reduce((sum, material) => sum + material.materialCost, 0));
  const materialsSellingPrice = round2(materials.reduce((sum, material) => sum + material.sellingPrice, 0));
  const laborSellingPrice = laborSellRate != null ? round2(effectiveLaborHours * laborSellRate) : 0;
  const subtotal = round2(laborSellingPrice + materialsSellingPrice + additionalCharges);

  return {
    areaName: section.areaName?.trim() || "General Area",
    title: section.title.trim() || "Untitled Scope Item",
    workCategory: section.workCategory || null,
    surfaceType: section.surfaceType?.trim() || "",
    measurementValue,
    coats,
    calculatedLaborHours,
    adjustedLaborHours: adjustedLaborHours != null && adjustedLaborHours >= 0 ? round2(adjustedLaborHours) : null,
    effectiveLaborHours,
    laborSellRate,
    directLaborCostRate,
    directLaborCost,
    laborBurdenCost,
    loadedLaborCost,
    laborSellingPrice,
    additionalCharges,
    materialsCost,
    materialsSellingPrice,
    subtotal,
    materials,
  };
}

export function computeDraftProposalEstimateSummary(input: {
  sections: DraftSectionLike[];
  defaults: ProposalEstimatorDefaults;
  pricing: ProposalEstimatorPricingInput;
}): DraftProposalEstimateSummary {
  const sections = input.sections.map((section) => computeDraftSectionEstimate(section, input.defaults));
  const hasEstimatorData = sections.some((section) =>
    section.measurementValue > 0 ||
    section.effectiveLaborHours > 0 ||
    section.additionalCharges > 0 ||
    section.materials.length > 0
  );

  const pricingMethod = input.pricing.estimatePricingMethod ?? input.defaults.defaultProposalPricingMethod;
  const targetMarginPercent = parseDraftNumber(input.pricing.estimateTargetMarginPercent);
  const targetMarkupPercent = parseDraftNumber(input.pricing.estimateTargetMarkupPercent);
  const manualPriceOverride = parseDraftNumber(input.pricing.estimatePriceOverride);
  const subcontractorCost = parseNonNegative(input.pricing.estimateSubcontractorCost, 0);
  const equipmentCost = parseNonNegative(input.pricing.estimateEquipmentCost, 0);
  const logisticsCost = parseNonNegative(input.pricing.estimateLogisticsCost, 0);
  const miscProjectCost = parseNonNegative(input.pricing.estimateMiscProjectCost, 0);

  const areasByName = new Map<string, DraftAreaEstimate>();
  for (const section of sections) {
    const areaName = section.areaName || "General Area";
    const existing = areasByName.get(areaName);
    if (!existing) {
      areasByName.set(areaName, {
        areaName,
        painterHours: section.effectiveLaborHours,
        directLaborCost: section.directLaborCost,
        laborBurdenCost: section.laborBurdenCost,
        loadedLaborCost: section.loadedLaborCost,
        materialCost: section.materialsCost,
        materialsSellingPrice: section.materialsSellingPrice,
        additionalCharges: section.additionalCharges,
        subtotal: section.subtotal,
        items: [section],
      });
      continue;
    }

    existing.painterHours = round2(existing.painterHours + section.effectiveLaborHours);
    existing.directLaborCost = round2(existing.directLaborCost + section.directLaborCost);
    existing.laborBurdenCost = round2(existing.laborBurdenCost + section.laborBurdenCost);
    existing.loadedLaborCost = round2(existing.loadedLaborCost + section.loadedLaborCost);
    existing.materialCost = round2(existing.materialCost + section.materialsCost);
    existing.materialsSellingPrice = round2(existing.materialsSellingPrice + section.materialsSellingPrice);
    existing.additionalCharges = round2(existing.additionalCharges + section.additionalCharges);
    existing.subtotal = round2(existing.subtotal + section.subtotal);
    existing.items.push(section);
  }

  const totals = computeProposalEstimate({
    workItems: sections.map((section) => ({
      calculatedLaborHours: section.calculatedLaborHours,
      adjustedLaborHours: section.adjustedLaborHours,
      directLaborCostRate: section.directLaborCostRate,
      materialsCost: section.materialsCost,
    })),
    wcPercent: input.defaults.defaultWcPercent,
    overheadPercent: input.defaults.defaultOverhead,
    subcontractorCost,
    equipmentCost,
    logisticsCost,
    miscDirectCost: miscProjectCost,
    pricingMethod,
    targetMarginPercent,
    targetMarkupPercent,
    manualPriceOverride,
  });

  return {
    hasEstimatorData,
    pricingMethod,
    targetMarginPercent,
    targetMarkupPercent,
    manualPriceOverride,
    subcontractorCost,
    equipmentCost,
    logisticsCost,
    miscProjectCost,
    areas: Array.from(areasByName.values()),
    totals,
  };
}
