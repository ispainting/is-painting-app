import { calculateMaterialQuantitySnapshot, calculateProductionHours, round2 } from "./proposal-pricing";

export type ProposalEstimateMethod = "LABOR_AND_MATERIALS" | "UNIT_PRICE" | "MANUAL_TOTAL" | "PRODUCTION_RATE";
export type ProposalPriceVisibilityMode = "ITEMIZED" | "GROUPED" | "HIDDEN";
export type ProposalLaborMode = "HOURS" | "DAYS";
export type ProposalMaterialLineType = "CATALOG" | "CUSTOM" | "MANUAL_TOTAL";
export type ProposalMaterialPriceSourceType = "INVENTORY_DEFAULT" | "EXPENSE_HISTORY" | "MANUAL";
export type ProposalGeneralLiabilityMode = "PERCENT_OF_LABOR" | "PERCENT_OF_REVENUE" | "FLAT_AMOUNT" | "EXCLUDED";
export type ProposalUnitPriceRateSource = "SEEDED" | "MANUAL" | "HISTORICAL";
export type ProposalProductionRateBasis = "SQFT_PER_HOUR" | "LINEAR_FT_PER_HOUR" | "HOURS_PER_ITEM" | "FIXED_HOURS";

export interface ProposalEstimateLaborLineInput {
  key: string;
  label: string;
  mode: ProposalLaborMode;
  workers: number;
  hoursPerWorker?: number | null;
  days?: number | null;
  hoursPerDay?: number | null;
  hourlyCost: number;
  manualTotalOverride?: number | null;
  internalNote?: string | null;
}

export interface ProposalEstimateMaterialLineInput {
  key: string;
  type: ProposalMaterialLineType;
  inventoryItemId?: number | null;
  name: string;
  unit: string;
  quantity?: number | null;
  unitCost?: number | null;
  manualTotal?: number | null;
  coveragePerUnit?: number | null;
  wastePercent?: number | null;
  adjustedQuantity?: number | null;
  note?: string | null;
  priceSourceType?: ProposalMaterialPriceSourceType | null;
  priceSourceLabel?: string | null;
  priceSourceExpenseId?: number | null;
  priceSourceExpenseLineItemId?: number | null;
}

export interface ProposalEstimateUnitPriceInput {
  templateId?: number | null;
  serviceName: string;
  variantName: string;
  unitLabel: string;
  quantity: number;
  pricePerUnit: number;
  lineTotalOverride?: number | null;
  laborAllowance?: number | null;
  materialAllowance?: number | null;
  note?: string | null;
  rateSource: ProposalUnitPriceRateSource;
}

export interface ProposalEstimateManualTotalInput {
  customerTotal: number;
  internalCost?: number | null;
  note?: string | null;
}

export interface ProposalEstimateProductionInput {
  workCategory?: string | null;
  surfaceType?: string | null;
  measurementUnit?: string | null;
  measurementValue: number;
  productionRateBasis: ProposalProductionRateBasis;
  productionRateValue: number;
  calculatedLaborHours?: number | null;
  adjustedLaborHours?: number | null;
  crewSize?: number | null;
  hoursPerDay?: number | null;
  hourlyCostPerWorker?: number | null;
  note?: string | null;
}

export interface ProposalEstimateWorkItemInput {
  key: string;
  title: string;
  customerTitle?: string | null;
  description?: string | null;
  areaName?: string | null;
  phaseName?: string | null;
  workCategoryLabel?: string | null;
  estimateMethod: ProposalEstimateMethod;
  priceVisibility: ProposalPriceVisibilityMode;
  internalNotes?: string | null;
  clientNotes?: string | null;
  laborLines: ProposalEstimateLaborLineInput[];
  materials: ProposalEstimateMaterialLineInput[];
  unitPrice?: ProposalEstimateUnitPriceInput | null;
  manualTotal?: ProposalEstimateManualTotalInput | null;
  production?: ProposalEstimateProductionInput | null;
}

export interface ProposalEstimateOtherCostInput {
  key: string;
  label: string;
  description?: string | null;
  amount: number;
  includeInRecommendedPrice: boolean;
  internalNote?: string | null;
}

export interface ProposalEstimateSettingsInput {
  desiredProfitMarginPercent: number | null;
  finalPriceOverride?: number | null;
  workersCompPercent: number;
  includeWorkersCompInRecommendedPrice: boolean;
  generalLiabilityMode: ProposalGeneralLiabilityMode;
  generalLiabilityPercent?: number | null;
  generalLiabilityFlatAmount?: number | null;
  includeGeneralLiabilityInRecommendedPrice: boolean;
  massTaxRate: number;
  federalTaxRate: number;
  showTaxPlanning: boolean;
  includeTaxReserveInRecommendedPrice: boolean;
  defaultWorkDayHours: number;
  otherCosts: ProposalEstimateOtherCostInput[];
}

export interface ProposalEstimateRequest {
  workItems: ProposalEstimateWorkItemInput[];
  settings: ProposalEstimateSettingsInput;
}

export interface ProposalEstimateLaborLineResult {
  key: string;
  label: string;
  mode: ProposalLaborMode;
  workers: number;
  hoursPerWorker: number | null;
  days: number | null;
  hoursPerDay: number | null;
  hourlyCost: number;
  calculatedLaborCost: number;
  manualTotalOverride: number | null;
  usedLaborCost: number;
  totalWorkerHours: number;
  estimatedCalendarDays: number | null;
  isOverrideActive: boolean;
  internalNote: string | null;
}

export interface ProposalEstimateMaterialLineResult {
  key: string;
  type: ProposalMaterialLineType;
  inventoryItemId: number | null;
  name: string;
  unit: string;
  quantity: number;
  calculatedQuantity: number | null;
  adjustedQuantity: number | null;
  unitCost: number;
  manualTotal: number | null;
  lineTotal: number;
  note: string | null;
  priceSourceType: ProposalMaterialPriceSourceType | null;
  priceSourceLabel: string | null;
  priceSourceExpenseId: number | null;
  priceSourceExpenseLineItemId: number | null;
}

export interface ProposalEstimateWorkItemResult {
  key: string;
  title: string;
  customerTitle: string;
  description: string | null;
  areaName: string;
  phaseName: string | null;
  workCategoryLabel: string | null;
  estimateMethod: ProposalEstimateMethod;
  priceVisibility: ProposalPriceVisibilityMode;
  internalNotes: string | null;
  clientNotes: string | null;
  laborLines: ProposalEstimateLaborLineResult[];
  materialLines: ProposalEstimateMaterialLineResult[];
  unitPrice: ProposalEstimateUnitPriceInput | null;
  manualTotal: ProposalEstimateManualTotalInput | null;
  production: (ProposalEstimateProductionInput & {
    effectiveLaborHours: number;
    estimatedCalendarDays: number | null;
    directLaborCost: number;
  }) | null;
  totalWorkerHours: number;
  estimatedCalendarDays: number | null;
  directLaborCost: number;
  materialsCost: number;
  internalCost: number;
  baseCustomerPrice: number;
  allocatedCustomerPrice: number;
}

export interface ProposalEstimateSummary {
  workItems: ProposalEstimateWorkItemResult[];
  otherCosts: ProposalEstimateOtherCostInput[];
  lineItemsSubtotal: number;
  directLaborCost: number;
  materialsCost: number;
  otherDirectCosts: number;
  workersCompAmount: number;
  generalLiabilityAmount: number;
  totalInternalCost: number;
  recoverableProjectCost: number;
  desiredProfitMarginPercent: number | null;
  profitDollars: number;
  recommendedCustomerPrice: number;
  finalCustomerPrice: number;
  actualProfit: number;
  actualMarginPercent: number | null;
  projectedProfitBeforeTaxes: number;
  massTaxAmount: number;
  federalTaxAmount: number;
  totalEstimatedTaxReserve: number;
  estimatedOwnerTakeHome: number;
  includedOtherDirectCosts: number;
  excludedOtherDirectCosts: number;
  includeWorkersCompInRecommendedPrice: boolean;
  includeGeneralLiabilityInRecommendedPrice: boolean;
  includeTaxReserveInRecommendedPrice: boolean;
  generalLiabilityMode: ProposalGeneralLiabilityMode;
  generalLiabilityPercent: number | null;
  generalLiabilityFlatAmount: number | null;
  workersCompPercent: number;
  massTaxRate: number;
  federalTaxRate: number;
  showTaxPlanning: boolean;
}

function ensureNonNegative(value: number | null | undefined, field: string) {
  const safeValue = value ?? 0;
  if (!Number.isFinite(safeValue) || safeValue < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return safeValue;
}

function nullableTrimmed(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length ? normalized : null;
}

function computeLaborLine(line: ProposalEstimateLaborLineInput, defaultWorkDayHours: number): ProposalEstimateLaborLineResult | null {
  const workers = ensureNonNegative(line.workers, "Workers");
  const hourlyCost = ensureNonNegative(line.hourlyCost, "Hourly cost");
  const manualTotalOverride = line.manualTotalOverride == null ? null : ensureNonNegative(line.manualTotalOverride, "Labor override");

  let hoursPerWorker: number | null = null;
  let days: number | null = null;
  let hoursPerDay: number | null = null;
  let totalWorkerHours = 0;
  let estimatedCalendarDays: number | null = null;

  if (line.mode === "HOURS") {
    hoursPerWorker = ensureNonNegative(line.hoursPerWorker, "Hours per worker");
    totalWorkerHours = round2(workers * hoursPerWorker);
    estimatedCalendarDays = workers > 0 && defaultWorkDayHours > 0 ? round2(hoursPerWorker / defaultWorkDayHours) : null;
  } else {
    days = ensureNonNegative(line.days, "Days");
    hoursPerDay = ensureNonNegative(line.hoursPerDay, "Hours per day");
    totalWorkerHours = round2(workers * days * hoursPerDay);
    estimatedCalendarDays = round2(days);
  }

  if (!(totalWorkerHours > 0) && manualTotalOverride == null) {
    return null;
  }

  const calculatedLaborCost = round2(totalWorkerHours * hourlyCost);
  const usedLaborCost = manualTotalOverride != null ? round2(manualTotalOverride) : calculatedLaborCost;

  return {
    key: line.key,
    label: line.label.trim() || "Labor",
    mode: line.mode,
    workers,
    hoursPerWorker,
    days,
    hoursPerDay,
    hourlyCost,
    calculatedLaborCost,
    manualTotalOverride,
    usedLaborCost,
    totalWorkerHours,
    estimatedCalendarDays,
    isOverrideActive: manualTotalOverride != null,
    internalNote: nullableTrimmed(line.internalNote),
  };
}

function computeMaterialLine(
  line: ProposalEstimateMaterialLineInput,
  context: { measurementValue?: number | null }
): ProposalEstimateMaterialLineResult | null {
  const name = line.name.trim();
  if (!name) return null;

  const unit = line.unit.trim() || "unit";
  const unitCost = ensureNonNegative(line.unitCost, "Material unit cost");
  const manualTotal = line.manualTotal == null ? null : ensureNonNegative(line.manualTotal, "Manual material total");
  const manualQuantity = ensureNonNegative(line.quantity, "Material quantity");
  const wastePercent = ensureNonNegative(line.wastePercent, "Waste percent");
  const adjustedQuantity = line.adjustedQuantity == null ? null : ensureNonNegative(line.adjustedQuantity, "Adjusted quantity");
  let calculatedQuantity: number | null = null;
  let quantity = manualQuantity;

  if (line.type !== "MANUAL_TOTAL" && line.coveragePerUnit != null && context.measurementValue != null && context.measurementValue > 0) {
    const quantitySnapshot = calculateMaterialQuantitySnapshot({
      measurement: context.measurementValue,
      coats: 1,
      coveragePerUnit: line.coveragePerUnit,
      wastePercent,
      adjustedQuantity,
    });
    calculatedQuantity = quantitySnapshot.calculatedQuantity;
    quantity = quantitySnapshot.effectiveQuantity ?? manualQuantity;
  } else if (adjustedQuantity != null) {
    quantity = adjustedQuantity;
  }

  if (line.type === "MANUAL_TOTAL") {
    if (manualTotal == null) return null;
    return {
      key: line.key,
      type: line.type,
      inventoryItemId: line.inventoryItemId ?? null,
      name,
      unit,
      quantity: 1,
      calculatedQuantity: null,
      adjustedQuantity,
      unitCost,
      manualTotal,
      lineTotal: round2(manualTotal),
      note: nullableTrimmed(line.note),
      priceSourceType: line.priceSourceType ?? null,
      priceSourceLabel: nullableTrimmed(line.priceSourceLabel),
      priceSourceExpenseId: line.priceSourceExpenseId ?? null,
      priceSourceExpenseLineItemId: line.priceSourceExpenseLineItemId ?? null,
    };
  }

  if (!(quantity > 0)) return null;
  const lineTotal = round2(quantity * unitCost);

  return {
    key: line.key,
    type: line.type,
    inventoryItemId: line.inventoryItemId ?? null,
    name,
    unit,
    quantity,
    calculatedQuantity,
    adjustedQuantity,
    unitCost,
    manualTotal,
    lineTotal,
    note: nullableTrimmed(line.note),
    priceSourceType: line.priceSourceType ?? null,
    priceSourceLabel: nullableTrimmed(line.priceSourceLabel),
    priceSourceExpenseId: line.priceSourceExpenseId ?? null,
    priceSourceExpenseLineItemId: line.priceSourceExpenseLineItemId ?? null,
  };
}

function computeProductionResult(
  production: ProposalEstimateProductionInput | null | undefined,
  defaultWorkDayHours: number
) {
  if (!production) return null;

  const measurementValue = ensureNonNegative(production.measurementValue, "Measurement value");
  const productionRateValue = ensureNonNegative(production.productionRateValue, "Production rate");
  const calculatedLaborHours = production.calculatedLaborHours != null
    ? ensureNonNegative(production.calculatedLaborHours, "Calculated labor hours")
    : calculateProductionHours({
        measurement: measurementValue,
        productionRate: productionRateValue,
        basis: production.productionRateBasis,
        fixedHours: production.productionRateBasis === "FIXED_HOURS" ? productionRateValue : undefined,
      });
  const effectiveLaborHours = production.adjustedLaborHours != null
    ? ensureNonNegative(production.adjustedLaborHours, "Adjusted labor hours")
    : calculatedLaborHours;
  const hourlyCostPerWorker = ensureNonNegative(production.hourlyCostPerWorker, "Hourly cost per worker");
  const directLaborCost = round2(effectiveLaborHours * hourlyCostPerWorker);
  const crewSize = production.crewSize == null ? null : ensureNonNegative(production.crewSize, "Crew size");
  const hoursPerDay = production.hoursPerDay == null ? defaultWorkDayHours : ensureNonNegative(production.hoursPerDay, "Hours per day");
  const estimatedCalendarDays =
    crewSize != null && crewSize > 0 && hoursPerDay > 0
      ? round2(effectiveLaborHours / (crewSize * hoursPerDay))
      : null;

  return {
    ...production,
    measurementValue,
    productionRateValue,
    calculatedLaborHours,
    adjustedLaborHours: production.adjustedLaborHours == null ? null : effectiveLaborHours,
    crewSize,
    hoursPerDay,
    hourlyCostPerWorker,
    effectiveLaborHours,
    estimatedCalendarDays,
    directLaborCost,
  };
}

function allocateRoundedTotals(
  workItems: ProposalEstimateWorkItemResult[],
  finalCustomerPrice: number,
  lineItemsSubtotal: number
) {
  if (workItems.length === 0) return workItems;
  if (lineItemsSubtotal <= 0) {
    return workItems.map((item, index) => ({
      ...item,
      allocatedCustomerPrice: index === 0 ? finalCustomerPrice : 0,
    }));
  }

  const rawShares = workItems.map((item) => round2((item.baseCustomerPrice / lineItemsSubtotal) * finalCustomerPrice));
  const roundedSum = round2(rawShares.reduce((sum, value) => sum + value, 0));
  let remainder = round2(finalCustomerPrice - roundedSum);

  return workItems.map((item, index) => {
    const adjustment = index === workItems.length - 1 ? remainder : 0;
    remainder = index === workItems.length - 1 ? 0 : remainder;
    return {
      ...item,
      allocatedCustomerPrice: round2(rawShares[index]! + adjustment),
    };
  });
}

function computeScenarioAmounts(input: {
  price: number;
  directLaborCost: number;
  fixedInternalCostWithoutRevenueGl: number;
  includedFixedCostWithoutRevenueGl: number;
  generalLiabilityMode: ProposalGeneralLiabilityMode;
  generalLiabilityPercent: number | null;
  generalLiabilityFlatAmount: number | null;
  includeGeneralLiabilityInRecommendedPrice: boolean;
  massTaxRate: number;
  federalTaxRate: number;
  showTaxPlanning: boolean;
}) {
  const revenueGlRate = input.generalLiabilityMode === "PERCENT_OF_REVENUE"
    ? (input.generalLiabilityPercent ?? 0) / 100
    : 0;
  const generalLiabilityAmount =
    input.generalLiabilityMode === "PERCENT_OF_LABOR"
      ? round2(input.directLaborCost * ((input.generalLiabilityPercent ?? 0) / 100))
      : input.generalLiabilityMode === "PERCENT_OF_REVENUE"
        ? round2(input.price * revenueGlRate)
        : input.generalLiabilityMode === "FLAT_AMOUNT"
          ? round2(input.generalLiabilityFlatAmount ?? 0)
          : 0;
  const totalInternalCost = round2(
    input.fixedInternalCostWithoutRevenueGl
    + (input.generalLiabilityMode === "PERCENT_OF_REVENUE" ? generalLiabilityAmount : 0)
  );
  const projectedProfitBeforeTaxes = round2(input.price - totalInternalCost);
  const taxableProfit = Math.max(0, projectedProfitBeforeTaxes);
  const massTaxAmount = input.showTaxPlanning ? round2(taxableProfit * (input.massTaxRate / 100)) : 0;
  const federalTaxAmount = input.showTaxPlanning ? round2(taxableProfit * (input.federalTaxRate / 100)) : 0;
  const totalEstimatedTaxReserve = round2(massTaxAmount + federalTaxAmount);
  const estimatedOwnerTakeHome = round2(projectedProfitBeforeTaxes - totalEstimatedTaxReserve);
  const includedGeneralLiabilityAmount =
    input.includeGeneralLiabilityInRecommendedPrice && input.generalLiabilityMode === "PERCENT_OF_REVENUE"
      ? generalLiabilityAmount
      : 0;

  return {
    generalLiabilityAmount,
    totalInternalCost,
    projectedProfitBeforeTaxes,
    massTaxAmount,
    federalTaxAmount,
    totalEstimatedTaxReserve,
    estimatedOwnerTakeHome,
    recoverableProjectCost: round2(
      input.includedFixedCostWithoutRevenueGl
      + includedGeneralLiabilityAmount
    ),
  };
}

export function computeProposalEstimate(request: ProposalEstimateRequest): ProposalEstimateSummary {
  const defaultWorkDayHours = ensureNonNegative(request.settings.defaultWorkDayHours || 8, "Default work day hours") || 8;
  const workItems = request.workItems
    .map((item) => {
      const production = computeProductionResult(item.production, defaultWorkDayHours);
      const laborLines = item.estimateMethod === "PRODUCTION_RATE"
        ? []
        : item.laborLines
            .map((line) => computeLaborLine(line, defaultWorkDayHours))
            .filter((line): line is ProposalEstimateLaborLineResult => line != null);
      const materialLines = item.materials
        .map((line) => computeMaterialLine(line, { measurementValue: production?.measurementValue ?? null }))
        .filter((line): line is ProposalEstimateMaterialLineResult => line != null);

      const laborWorkerHours = round2(laborLines.reduce((sum, line) => sum + line.totalWorkerHours, 0));
      const laborCost = round2(laborLines.reduce((sum, line) => sum + line.usedLaborCost, 0));
      const productionHours = production?.effectiveLaborHours ?? 0;
      const productionLaborCost = production?.directLaborCost ?? 0;
      const totalWorkerHours = round2(laborWorkerHours + productionHours);
      const estimatedCalendarDays = item.estimateMethod === "PRODUCTION_RATE"
        ? production?.estimatedCalendarDays ?? null
        : round2(laborLines.reduce((sum, line) => sum + (line.estimatedCalendarDays ?? 0), 0)) || null;
      const materialsCost = round2(materialLines.reduce((sum, line) => sum + line.lineTotal, 0));
      const directLaborCost = round2(laborCost + productionLaborCost);
      const internalCostBase = round2(directLaborCost + materialsCost);

      let baseCustomerPrice = internalCostBase;
      if (item.estimateMethod === "UNIT_PRICE" && item.unitPrice) {
        const quantity = ensureNonNegative(item.unitPrice.quantity, "Unit quantity");
        const pricePerUnit = ensureNonNegative(item.unitPrice.pricePerUnit, "Price per unit");
        baseCustomerPrice = item.unitPrice.lineTotalOverride != null
          ? ensureNonNegative(item.unitPrice.lineTotalOverride, "Unit total override")
          : round2(quantity * pricePerUnit);
      }
      if (item.estimateMethod === "MANUAL_TOTAL" && item.manualTotal) {
        baseCustomerPrice = ensureNonNegative(item.manualTotal.customerTotal, "Manual customer total");
      }

      let internalCost = internalCostBase;
      if (item.estimateMethod === "UNIT_PRICE" && item.unitPrice) {
        internalCost = round2(
          ensureNonNegative(item.unitPrice.laborAllowance, "Labor allowance")
          + ensureNonNegative(item.unitPrice.materialAllowance, "Material allowance")
        );
      }
      if (item.estimateMethod === "MANUAL_TOTAL" && item.manualTotal) {
        internalCost = round2(ensureNonNegative(item.manualTotal.internalCost, "Manual internal cost"));
      }

      return {
        key: item.key,
        title: item.title.trim() || "Untitled scope item",
        customerTitle: item.customerTitle?.trim() || item.title.trim() || "Untitled scope item",
        description: nullableTrimmed(item.description),
        areaName: item.areaName?.trim() || "General",
        phaseName: nullableTrimmed(item.phaseName),
        workCategoryLabel: nullableTrimmed(item.workCategoryLabel),
        estimateMethod: item.estimateMethod,
        priceVisibility: item.priceVisibility,
        internalNotes: nullableTrimmed(item.internalNotes),
        clientNotes: nullableTrimmed(item.clientNotes),
        laborLines,
        materialLines,
        unitPrice: item.unitPrice ?? null,
        manualTotal: item.manualTotal ?? null,
        production,
        totalWorkerHours,
        estimatedCalendarDays,
        directLaborCost,
        materialsCost,
        internalCost,
        baseCustomerPrice: round2(baseCustomerPrice),
        allocatedCustomerPrice: round2(baseCustomerPrice),
      } satisfies ProposalEstimateWorkItemResult;
    })
    .filter((item) =>
      item.title.trim().length > 0
      || item.directLaborCost > 0
      || item.materialsCost > 0
      || item.baseCustomerPrice > 0
      || item.laborLines.length > 0
      || item.materialLines.length > 0
    );

  const lineItemsSubtotal = round2(workItems.reduce((sum, item) => sum + item.baseCustomerPrice, 0));
  const directLaborCost = round2(workItems.reduce((sum, item) => sum + item.directLaborCost, 0));
  const materialsCost = round2(workItems.reduce((sum, item) => sum + item.materialsCost, 0));
  const workItemsInternalCost = round2(workItems.reduce((sum, item) => sum + item.internalCost, 0));
  const otherCosts = request.settings.otherCosts
    .filter((line) => line.label.trim().length > 0 || line.amount > 0)
    .map((line) => ({
      ...line,
      label: line.label.trim() || "Other cost",
      amount: round2(ensureNonNegative(line.amount, "Other project cost")),
      description: nullableTrimmed(line.description),
      internalNote: nullableTrimmed(line.internalNote),
    }));
  const includedOtherDirectCosts = round2(otherCosts.filter((line) => line.includeInRecommendedPrice).reduce((sum, line) => sum + line.amount, 0));
  const excludedOtherDirectCosts = round2(otherCosts.filter((line) => !line.includeInRecommendedPrice).reduce((sum, line) => sum + line.amount, 0));
  const otherDirectCosts = round2(includedOtherDirectCosts + excludedOtherDirectCosts);
  const workersCompPercent = ensureNonNegative(request.settings.workersCompPercent, "Workers' compensation percent");
  const workersCompAmount = round2(directLaborCost * (workersCompPercent / 100));

  const glPercent = request.settings.generalLiabilityPercent == null ? null : ensureNonNegative(request.settings.generalLiabilityPercent, "General liability percent");
  const glFlatAmount = request.settings.generalLiabilityFlatAmount == null ? null : ensureNonNegative(request.settings.generalLiabilityFlatAmount, "General liability flat amount");
  const generalLiabilityMode = request.settings.generalLiabilityMode;
  const fixedGlAmount =
    generalLiabilityMode === "PERCENT_OF_LABOR"
      ? round2(directLaborCost * ((glPercent ?? 0) / 100))
      : generalLiabilityMode === "FLAT_AMOUNT"
        ? round2(glFlatAmount ?? 0)
        : 0;

  const fixedInternalCostWithoutRevenueGl = round2(workItemsInternalCost + otherDirectCosts + workersCompAmount + fixedGlAmount);
  const includedFixedCostWithoutRevenueGl = round2(
    workItemsInternalCost
    + includedOtherDirectCosts
    + (request.settings.includeWorkersCompInRecommendedPrice ? workersCompAmount : 0)
    + (
      request.settings.includeGeneralLiabilityInRecommendedPrice && generalLiabilityMode !== "PERCENT_OF_REVENUE"
        ? fixedGlAmount
        : 0
    )
  );
  const totalTaxRate = ensureNonNegative(request.settings.massTaxRate, "Mass tax rate") + ensureNonNegative(request.settings.federalTaxRate, "Federal tax rate");
  const marginRate = request.settings.desiredProfitMarginPercent == null
    ? null
    : ensureNonNegative(request.settings.desiredProfitMarginPercent, "Desired margin percent") / 100;
  const includedRevenueGlRate =
    request.settings.includeGeneralLiabilityInRecommendedPrice && generalLiabilityMode === "PERCENT_OF_REVENUE"
      ? (glPercent ?? 0) / 100
      : 0;
  const totalRevenueGlRate =
    generalLiabilityMode === "PERCENT_OF_REVENUE"
      ? (glPercent ?? 0) / 100
      : 0;

  let marginBasedPrice = lineItemsSubtotal;
  if (marginRate != null) {
    const includeTax = request.settings.includeTaxReserveInRecommendedPrice;
    const taxRate = includeTax ? totalTaxRate / 100 : 0;
    const numerator = round2(
      includeTax
        ? includedFixedCostWithoutRevenueGl - taxRate * fixedInternalCostWithoutRevenueGl
        : includedFixedCostWithoutRevenueGl
    );
    const denominator = includeTax
      ? 1 - marginRate - includedRevenueGlRate - taxRate * (1 - totalRevenueGlRate)
      : 1 - marginRate - includedRevenueGlRate;
    if (denominator <= 0) {
      throw new Error("The selected margin, tax reserve, and general liability settings do not produce a stable recommended price.");
    }
    marginBasedPrice = round2(Math.max(0, numerator / denominator));
  }

  const recommendedCustomerPrice = round2(Math.max(lineItemsSubtotal, marginBasedPrice));
  const recommendedScenario = computeScenarioAmounts({
    price: recommendedCustomerPrice,
    directLaborCost,
    fixedInternalCostWithoutRevenueGl,
    includedFixedCostWithoutRevenueGl,
    generalLiabilityMode,
    generalLiabilityPercent: glPercent,
    generalLiabilityFlatAmount: glFlatAmount,
    includeGeneralLiabilityInRecommendedPrice: request.settings.includeGeneralLiabilityInRecommendedPrice,
    massTaxRate: ensureNonNegative(request.settings.massTaxRate, "Mass tax rate"),
    federalTaxRate: ensureNonNegative(request.settings.federalTaxRate, "Federal tax rate"),
    showTaxPlanning: request.settings.showTaxPlanning || request.settings.includeTaxReserveInRecommendedPrice,
  });

  const finalCustomerPrice = request.settings.finalPriceOverride != null
    ? round2(ensureNonNegative(request.settings.finalPriceOverride, "Final price override"))
    : recommendedCustomerPrice;
  const finalScenario = computeScenarioAmounts({
    price: finalCustomerPrice,
    directLaborCost,
    fixedInternalCostWithoutRevenueGl,
    includedFixedCostWithoutRevenueGl,
    generalLiabilityMode,
    generalLiabilityPercent: glPercent,
    generalLiabilityFlatAmount: glFlatAmount,
    includeGeneralLiabilityInRecommendedPrice: request.settings.includeGeneralLiabilityInRecommendedPrice,
    massTaxRate: ensureNonNegative(request.settings.massTaxRate, "Mass tax rate"),
    federalTaxRate: ensureNonNegative(request.settings.federalTaxRate, "Federal tax rate"),
    showTaxPlanning: request.settings.showTaxPlanning || request.settings.includeTaxReserveInRecommendedPrice,
  });

  const allocatedWorkItems = allocateRoundedTotals(workItems, finalCustomerPrice, lineItemsSubtotal);
  const actualProfit = round2(finalCustomerPrice - finalScenario.totalInternalCost);
  const actualMarginPercent = finalCustomerPrice > 0 ? round2((actualProfit / finalCustomerPrice) * 100) : null;

  return {
    workItems: allocatedWorkItems,
    otherCosts,
    lineItemsSubtotal,
    directLaborCost,
    materialsCost,
    otherDirectCosts,
    workersCompAmount,
    generalLiabilityAmount: finalScenario.generalLiabilityAmount,
    totalInternalCost: finalScenario.totalInternalCost,
    recoverableProjectCost: round2(
      recommendedScenario.recoverableProjectCost
      + (request.settings.includeTaxReserveInRecommendedPrice ? recommendedScenario.totalEstimatedTaxReserve : 0)
    ),
    desiredProfitMarginPercent: request.settings.desiredProfitMarginPercent == null ? null : round2(request.settings.desiredProfitMarginPercent),
    profitDollars: round2(recommendedCustomerPrice - recommendedScenario.totalInternalCost),
    recommendedCustomerPrice,
    finalCustomerPrice,
    actualProfit,
    actualMarginPercent,
    projectedProfitBeforeTaxes: finalScenario.projectedProfitBeforeTaxes,
    massTaxAmount: finalScenario.massTaxAmount,
    federalTaxAmount: finalScenario.federalTaxAmount,
    totalEstimatedTaxReserve: finalScenario.totalEstimatedTaxReserve,
    estimatedOwnerTakeHome: finalScenario.estimatedOwnerTakeHome,
    includedOtherDirectCosts,
    excludedOtherDirectCosts,
    includeWorkersCompInRecommendedPrice: request.settings.includeWorkersCompInRecommendedPrice,
    includeGeneralLiabilityInRecommendedPrice: request.settings.includeGeneralLiabilityInRecommendedPrice,
    includeTaxReserveInRecommendedPrice: request.settings.includeTaxReserveInRecommendedPrice,
    generalLiabilityMode,
    generalLiabilityPercent: glPercent,
    generalLiabilityFlatAmount: glFlatAmount,
    workersCompPercent,
    massTaxRate: ensureNonNegative(request.settings.massTaxRate, "Mass tax rate"),
    federalTaxRate: ensureNonNegative(request.settings.federalTaxRate, "Federal tax rate"),
    showTaxPlanning: request.settings.showTaxPlanning,
  };
}
