import {
  computeProposalEstimate,
  type ProposalEstimateMethod,
  type ProposalGeneralLiabilityMode,
  type ProposalLaborMode,
  type ProposalMaterialLineType,
  type ProposalMaterialPriceSourceType,
  type ProposalPriceVisibilityMode,
  type ProposalProductionRateBasis,
  type ProposalUnitPriceRateSource,
} from "./proposal-estimate-engine";
import { round2 } from "./proposal-pricing";

export type DraftValue = string | number | null | undefined;

export interface DraftLaborLineLike {
  key: string;
  label: string;
  mode: ProposalLaborMode;
  workers?: DraftValue;
  hoursPerWorker?: DraftValue;
  days?: DraftValue;
  hoursPerDay?: DraftValue;
  hourlyCost?: DraftValue;
  manualTotalOverride?: DraftValue;
  internalNote?: string;
}

export interface DraftMaterialLike {
  key: string;
  type: ProposalMaterialLineType;
  inventoryItemId?: number | null;
  name: string;
  unit: string;
  quantity?: DraftValue;
  unitCost?: DraftValue;
  manualTotal?: DraftValue;
  coveragePerUnit?: DraftValue;
  wastePercent?: DraftValue;
  adjustedQuantity?: DraftValue;
  note?: string;
  priceSourceType?: ProposalMaterialPriceSourceType | null;
  priceSourceLabel?: string;
  priceSourceExpenseId?: number | null;
  priceSourceExpenseLineItemId?: number | null;
}

export interface DraftSectionLike {
  key: string;
  templateKey: string;
  title: string;
  customerTitle?: string;
  areaName?: string;
  phaseName?: string;
  workCategoryLabel?: string;
  description?: string;
  bulletItems?: string[];
  notes?: string;
  sortOrder?: number;
  estimateMethod?: ProposalEstimateMethod | "" | null;
  priceVisibilityMode: ProposalPriceVisibilityMode;
  clientNotes?: string;
  internalNotes?: string;
  laborLines: DraftLaborLineLike[];
  materials: DraftMaterialLike[];
  unitPrice?: {
    templateId?: number | null;
    serviceName: string;
    variantName: string;
    unitLabel: string;
    quantity?: DraftValue;
    pricePerUnit?: DraftValue;
    lineTotalOverride?: DraftValue;
    laborAllowance?: DraftValue;
    materialAllowance?: DraftValue;
    note?: string;
    rateSource: ProposalUnitPriceRateSource;
  } | null;
  manualTotal?: {
    customerTotal?: DraftValue;
    internalCost?: DraftValue;
    note?: string;
  } | null;
  production?: {
    workCategory?: string;
    surfaceType?: string;
    measurementUnit?: string;
    measurementValue?: DraftValue;
    productionRateBasis: ProposalProductionRateBasis;
    productionRateValue?: DraftValue;
    calculatedLaborHours?: DraftValue;
    adjustedLaborHours?: DraftValue;
    crewSize?: DraftValue;
    hoursPerDay?: DraftValue;
    hourlyCostPerWorker?: DraftValue;
    note?: string;
    productionRateId?: number | null;
  } | null;
}

export interface ProposalEstimatorDefaults {
  defaultLaborCostRate: number | null;
  defaultWcPercent: number;
  defaultDesiredProfitMarginPercent: number;
  defaultGlPercent: number;
  defaultGeneralLiabilityMode: ProposalGeneralLiabilityMode;
  defaultMassTaxRate: number;
  defaultFederalTaxRate: number;
  defaultWorkDayHours: number;
}

export interface ProposalEstimatorPricingInput {
  desiredProfitMarginPercent?: DraftValue;
  estimatePriceOverride?: DraftValue;
  workersCompPercentOverride?: DraftValue;
  includeWorkersCompInRecommendedPrice?: boolean;
  generalLiabilityMode?: ProposalGeneralLiabilityMode | null;
  generalLiabilityPercent?: DraftValue;
  generalLiabilityFlatAmount?: DraftValue;
  includeGeneralLiabilityInRecommendedPrice?: boolean;
  massTaxRate?: DraftValue;
  federalTaxRate?: DraftValue;
  showTaxPlanning?: boolean;
  includeTaxReserveInRecommendedPrice?: boolean;
  otherCosts: Array<{
    key: string;
    label: string;
    description?: string;
    amount?: DraftValue;
    includeInRecommendedPrice: boolean;
    internalNote?: string;
  }>;
}

export interface DraftAreaEstimate {
  areaName: string;
  workItems: Array<{
    key: string;
    title: string;
    estimateMethod: ProposalEstimateMethod;
    allocatedCustomerPrice: number;
    directLaborCost: number;
    materialsCost: number;
    internalCost: number;
  }>;
  directLaborCost: number;
  materialsCost: number;
  internalCost: number;
  allocatedCustomerPrice: number;
}

function parseDraftNumber(value: DraftValue): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonNegative(value: DraftValue, fallback = 0) {
  const parsed = parseDraftNumber(value);
  return parsed != null && parsed >= 0 ? parsed : fallback;
}

export function computeDraftProposalEstimateSummary(input: {
  sections: DraftSectionLike[];
  defaults: ProposalEstimatorDefaults;
  pricing: ProposalEstimatorPricingInput;
}) {
  const summary = computeProposalEstimate({
    workItems: input.sections
      .filter((section) => (section.estimateMethod ?? null) != null)
      .map((section) => ({
        key: section.key,
        title: section.title,
        customerTitle: section.customerTitle,
        description: section.description,
        areaName: section.areaName,
        phaseName: section.phaseName,
        workCategoryLabel: section.workCategoryLabel,
        estimateMethod: section.estimateMethod as ProposalEstimateMethod,
        priceVisibility: section.priceVisibilityMode,
        internalNotes: section.internalNotes,
        clientNotes: section.clientNotes,
        laborLines: section.laborLines.map((line) => ({
          key: line.key,
          label: line.label,
          mode: line.mode,
          workers: parseNonNegative(line.workers, 0),
          hoursPerWorker: parseDraftNumber(line.hoursPerWorker),
          days: parseDraftNumber(line.days),
          hoursPerDay: parseDraftNumber(line.hoursPerDay),
          hourlyCost: parseNonNegative(line.hourlyCost, input.defaults.defaultLaborCostRate ?? 0),
          manualTotalOverride: parseDraftNumber(line.manualTotalOverride),
          internalNote: line.internalNote,
        })),
        materials: section.materials.map((material) => ({
          key: material.key,
          type: material.type,
          inventoryItemId: material.inventoryItemId ?? null,
          name: material.name,
          unit: material.unit,
          quantity: parseDraftNumber(material.quantity),
          unitCost: parseNonNegative(material.unitCost, 0),
          manualTotal: parseDraftNumber(material.manualTotal),
          coveragePerUnit: parseDraftNumber(material.coveragePerUnit),
          wastePercent: parseNonNegative(material.wastePercent, 0),
          adjustedQuantity: parseDraftNumber(material.adjustedQuantity),
          note: material.note,
          priceSourceType: material.priceSourceType ?? null,
          priceSourceLabel: material.priceSourceLabel,
          priceSourceExpenseId: material.priceSourceExpenseId ?? null,
          priceSourceExpenseLineItemId: material.priceSourceExpenseLineItemId ?? null,
        })),
        unitPrice: section.unitPrice
          ? {
              templateId: section.unitPrice.templateId ?? null,
              serviceName: section.unitPrice.serviceName,
              variantName: section.unitPrice.variantName,
              unitLabel: section.unitPrice.unitLabel,
              quantity: parseNonNegative(section.unitPrice.quantity, 0),
              pricePerUnit: parseNonNegative(section.unitPrice.pricePerUnit, 0),
              lineTotalOverride: parseDraftNumber(section.unitPrice.lineTotalOverride),
              laborAllowance: parseDraftNumber(section.unitPrice.laborAllowance),
              materialAllowance: parseDraftNumber(section.unitPrice.materialAllowance),
              note: section.unitPrice.note,
              rateSource: section.unitPrice.rateSource,
            }
          : null,
        manualTotal: section.manualTotal
          ? {
              customerTotal: parseNonNegative(section.manualTotal.customerTotal, 0),
              internalCost: parseDraftNumber(section.manualTotal.internalCost),
              note: section.manualTotal.note,
            }
          : null,
        production: section.production
          ? {
              workCategory: section.production.workCategory,
              surfaceType: section.production.surfaceType,
              measurementUnit: section.production.measurementUnit,
              measurementValue: parseNonNegative(section.production.measurementValue, 0),
              productionRateBasis: section.production.productionRateBasis,
              productionRateValue: parseNonNegative(section.production.productionRateValue, 0),
              calculatedLaborHours: parseDraftNumber(section.production.calculatedLaborHours),
              adjustedLaborHours: parseDraftNumber(section.production.adjustedLaborHours),
              crewSize: parseDraftNumber(section.production.crewSize),
              hoursPerDay: parseDraftNumber(section.production.hoursPerDay),
              hourlyCostPerWorker: parseDraftNumber(section.production.hourlyCostPerWorker) ?? input.defaults.defaultLaborCostRate ?? 0,
              note: section.production.note,
            }
          : null,
      })),
    settings: {
      desiredProfitMarginPercent: parseDraftNumber(input.pricing.desiredProfitMarginPercent) ?? input.defaults.defaultDesiredProfitMarginPercent,
      finalPriceOverride: parseDraftNumber(input.pricing.estimatePriceOverride),
      workersCompPercent: parseDraftNumber(input.pricing.workersCompPercentOverride) ?? input.defaults.defaultWcPercent,
      includeWorkersCompInRecommendedPrice: input.pricing.includeWorkersCompInRecommendedPrice ?? true,
      generalLiabilityMode: input.pricing.generalLiabilityMode ?? input.defaults.defaultGeneralLiabilityMode,
      generalLiabilityPercent: parseDraftNumber(input.pricing.generalLiabilityPercent) ?? input.defaults.defaultGlPercent,
      generalLiabilityFlatAmount: parseDraftNumber(input.pricing.generalLiabilityFlatAmount),
      includeGeneralLiabilityInRecommendedPrice: input.pricing.includeGeneralLiabilityInRecommendedPrice ?? true,
      massTaxRate: parseDraftNumber(input.pricing.massTaxRate) ?? input.defaults.defaultMassTaxRate,
      federalTaxRate: parseDraftNumber(input.pricing.federalTaxRate) ?? input.defaults.defaultFederalTaxRate,
      showTaxPlanning: input.pricing.showTaxPlanning ?? true,
      includeTaxReserveInRecommendedPrice: input.pricing.includeTaxReserveInRecommendedPrice ?? false,
      defaultWorkDayHours: input.defaults.defaultWorkDayHours,
      otherCosts: input.pricing.otherCosts.map((line) => ({
        key: line.key,
        label: line.label,
        description: line.description,
        amount: parseNonNegative(line.amount, 0),
        includeInRecommendedPrice: line.includeInRecommendedPrice,
        internalNote: line.internalNote,
      })),
    },
  });

  const areasByName = new Map<string, DraftAreaEstimate>();
  for (const workItem of summary.workItems) {
    const areaName = workItem.areaName || "General";
    const existing = areasByName.get(areaName);
    if (!existing) {
      areasByName.set(areaName, {
        areaName,
        workItems: [{
          key: workItem.key,
          title: workItem.title,
          estimateMethod: workItem.estimateMethod,
          allocatedCustomerPrice: workItem.allocatedCustomerPrice,
          directLaborCost: workItem.directLaborCost,
          materialsCost: workItem.materialsCost,
          internalCost: workItem.internalCost,
        }],
        directLaborCost: workItem.directLaborCost,
        materialsCost: workItem.materialsCost,
        internalCost: workItem.internalCost,
        allocatedCustomerPrice: workItem.allocatedCustomerPrice,
      });
      continue;
    }

    existing.workItems.push({
      key: workItem.key,
      title: workItem.title,
      estimateMethod: workItem.estimateMethod,
      allocatedCustomerPrice: workItem.allocatedCustomerPrice,
      directLaborCost: workItem.directLaborCost,
      materialsCost: workItem.materialsCost,
      internalCost: workItem.internalCost,
    });
    existing.directLaborCost = round2(existing.directLaborCost + workItem.directLaborCost);
    existing.materialsCost = round2(existing.materialsCost + workItem.materialsCost);
    existing.internalCost = round2(existing.internalCost + workItem.internalCost);
    existing.allocatedCustomerPrice = round2(existing.allocatedCustomerPrice + workItem.allocatedCustomerPrice);
  }

  return {
    hasEstimatorData: summary.workItems.length > 0 || summary.otherCosts.length > 0,
    areas: Array.from(areasByName.values()),
    totals: summary,
  };
}
