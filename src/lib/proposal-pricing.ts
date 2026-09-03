/**
 * Proposal estimating / pricing engine.
 *
 * Pure calculation functions only — no Prisma, no I/O. All values that come from
 * the material catalog or company settings must be resolved by the caller and
 * passed in explicitly, then snapshotted onto the Proposal record. This module
 * never re-reads "live" catalog/settings values, so a saved estimate is never
 * silently rewritten by a later catalog or settings change.
 *
 * Calculation model:
 *   material cost           = quantity × unit cost
 *   material selling price  = material cost × (1 + markup% / 100)
 *   labor selling price     = estimated labor hours × labor sell rate
 *   scope subtotal          = labor selling price + materials selling price + additional charges
 *   proposal total          = sum(scope subtotals) − discount, then + tax
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeProposalProjectName(projectName: string | null | undefined): string {
  const normalized = (projectName ?? "").trim();
  return normalized.length > 0 ? normalized : "Untitled Proposal";
}

export function calculateProductionHours(input: {
  measurement: number;
  productionRate: number;
  basis: "SQFT_PER_HOUR" | "LINEAR_FT_PER_HOUR" | "HOURS_PER_ITEM" | "FIXED_HOURS";
  fixedHours?: number;
  adjustedHours?: number;
}): number {
  if (input.adjustedHours != null && Number.isFinite(input.adjustedHours) && input.adjustedHours >= 0) {
    return round2(input.adjustedHours);
  }

  if (input.basis === "FIXED_HOURS") {
    const hours = input.fixedHours ?? 0;
    if (!Number.isFinite(hours) || hours < 0) {
      throw new Error("Fixed hours must be a non-negative number.");
    }
    return round2(hours);
  }

  if (!Number.isFinite(input.measurement) || input.measurement < 0) {
    throw new Error("Measurement must be a non-negative number.");
  }
  if (!Number.isFinite(input.productionRate) || input.productionRate <= 0) {
    throw new Error("Production rate must be a positive number.");
  }

  if (input.basis === "HOURS_PER_ITEM") {
    return round2(input.measurement * input.productionRate);
  }

  return round2(input.measurement / input.productionRate);
}

export function calculatePaintMaterialQuantity(input: {
  measurement: number;
  coats: number;
  coveragePerUnit: number;
  wastePercent?: number;
  adjustedQuantity?: number;
}): number {
  if (input.adjustedQuantity != null && Number.isFinite(input.adjustedQuantity) && input.adjustedQuantity >= 0) {
    return round2(input.adjustedQuantity);
  }

  if (!Number.isFinite(input.measurement) || input.measurement <= 0) {
    throw new Error("Measurement must be greater than zero.");
  }
  if (!Number.isFinite(input.coats) || input.coats <= 0) {
    throw new Error("Coats must be greater than zero.");
  }
  if (!Number.isFinite(input.coveragePerUnit) || input.coveragePerUnit <= 0) {
    throw new Error("Coverage per unit must be greater than zero.");
  }

  const baseQty = (input.measurement * input.coats) / input.coveragePerUnit;
  const wastePct = input.wastePercent ?? 0;
  if (!Number.isFinite(wastePct) || wastePct < 0) {
    throw new Error("Waste percent must be a non-negative number.");
  }

  return round2(baseQty * (1 + wastePct / 100));
}

export function calculateMarkupPrice(input: { cost: number; markupPercent: number }): number {
  if (!Number.isFinite(input.cost) || input.cost < 0) {
    throw new Error("Cost must be a non-negative number.");
  }
  if (!Number.isFinite(input.markupPercent) || input.markupPercent < 0) {
    throw new Error("Markup percent must be a non-negative number.");
  }
  return round2(input.cost * (1 + input.markupPercent));
}

export function calculateGrossMarginPrice(input: { cost: number; desiredMarginPercent: number }): number {
  if (!Number.isFinite(input.cost) || input.cost < 0) {
    throw new Error("Cost must be a non-negative number.");
  }
  if (!Number.isFinite(input.desiredMarginPercent) || input.desiredMarginPercent < 0 || input.desiredMarginPercent >= 100) {
    throw new Error("Desired gross margin must be between 0 and 100 exclusive.");
  }

  return round2(input.cost / (1 - input.desiredMarginPercent / 100));
}

export function calculateEffectiveSalesRate(input: { finalProposalPrice: number; estimatedPainterHours: number }): number {
  if (!Number.isFinite(input.finalProposalPrice) || input.finalProposalPrice < 0) {
    throw new Error("Final proposal price must be a non-negative number.");
  }
  if (!Number.isFinite(input.estimatedPainterHours) || input.estimatedPainterHours <= 0) {
    return 0;
  }
  return round2(input.finalProposalPrice / input.estimatedPainterHours);
}

export type ProductionRateBasis =
  | "SQFT_PER_HOUR"
  | "LINEAR_FT_PER_HOUR"
  | "HOURS_PER_ITEM"
  | "FIXED_HOURS";

export interface ProductionRateProfile {
  category: string;
  surfaceType: string;
  basis: ProductionRateBasis;
  coats?: number | null;
  prepLevel?: string | null;
  isActive: boolean;
  isDefault: boolean;
}

function normalizedProfileValue(value: number | string | null | undefined): string {
  return value == null || String(value).trim() === "" ? "__NULL__" : String(value).trim().toLowerCase();
}

export function productionRateProfileKey(rate: Pick<ProductionRateProfile, "category" | "surfaceType" | "basis" | "coats" | "prepLevel">): string {
  return [rate.category, rate.surfaceType, rate.basis, normalizedProfileValue(rate.coats), normalizedProfileValue(rate.prepLevel)].join("|").toLowerCase();
}

export function findProductionRateProfileConflicts(rates: readonly ProductionRateProfile[]) {
  const activeProfiles = new Set<string>();
  const activeDefaults = new Set<string>();
  const duplicateActiveProfiles: string[] = [];
  const duplicateActiveDefaults: string[] = [];
  const inactiveDefaults: string[] = [];

  for (const rate of rates) {
    const key = productionRateProfileKey(rate);
    if (!rate.isActive && rate.isDefault) inactiveDefaults.push(key);
    if (!rate.isActive) continue;
    if (activeProfiles.has(key)) duplicateActiveProfiles.push(key);
    activeProfiles.add(key);
    if (rate.isDefault) {
      if (activeDefaults.has(key)) duplicateActiveDefaults.push(key);
      activeDefaults.add(key);
    }
  }

  return { duplicateActiveProfiles, duplicateActiveDefaults, inactiveDefaults };
}

export function calculateDimensionMeasurements(input: {
  length: number;
  width: number;
  height: number;
  openingDeduction?: number;
}) {
  const values = [input.length, input.width, input.height, input.openingDeduction ?? 0];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Room dimensions and opening deduction must be non-negative numbers.");
  }
  return {
    ceilingArea: round2(input.length * input.width),
    wallArea: round2(Math.max(0, 2 * (input.length + input.width) * input.height - (input.openingDeduction ?? 0))),
  };
}

export function calculateMaterialQuantitySnapshot(input: {
  measurement: number;
  coats: number;
  coveragePerUnit: number | null;
  wastePercent: number;
  adjustedQuantity?: number | null;
}) {
  if (input.adjustedQuantity != null) {
    if (!Number.isFinite(input.adjustedQuantity) || input.adjustedQuantity < 0) {
      throw new Error("Adjusted material quantity must be non-negative.");
    }
  }
  const calculatedQuantity = input.coveragePerUnit == null
    ? null
    : calculatePaintMaterialQuantity({
        measurement: input.measurement,
        coats: input.coats,
        coveragePerUnit: input.coveragePerUnit,
        wastePercent: input.wastePercent,
      });
  return {
    calculatedQuantity,
    effectiveQuantity: input.adjustedQuantity != null ? round2(input.adjustedQuantity) : calculatedQuantity,
  };
}

export interface ProposalEstimateInput {
  workItems: Array<{
    calculatedLaborHours: number;
    adjustedLaborHours?: number | null;
    directLaborCostRate: number;
    materialsCost: number;
  }>;
  wcPercent: number;
  overheadPercent: number;
  subcontractorCost?: number;
  equipmentCost?: number;
  logisticsCost?: number;
  miscDirectCost?: number;
  pricingMethod: "GROSS_MARGIN" | "MARKUP";
  targetMarginPercent?: number | null;
  targetMarkupPercent?: number | null;
  manualPriceOverride?: number | null;
}

export interface ProposalEstimateResult {
  totalPainterHours: number;
  directLaborCost: number;
  wcCost: number;
  laborBurdenCost: number;
  loadedLaborCost: number;
  materialCost: number;
  subcontractorCost: number;
  equipmentCost: number;
  logisticsCost: number;
  miscDirectCost: number;
  directProjectCost: number;
  overheadDollars: number;
  trueJobCost: number;
  recommendedSellingPrice: number | null;
  finalProposalPrice: number | null;
  grossProfitDollars: number | null;
  grossMarginPercent: number | null;
  effectiveSalesRate: number;
}

export function computeProposalEstimate(input: ProposalEstimateInput): ProposalEstimateResult {
  if (!Number.isFinite(input.wcPercent) || input.wcPercent < 0) throw new Error("WC percent must be non-negative.");
  if (!Number.isFinite(input.overheadPercent) || input.overheadPercent < 0) throw new Error("Overhead percent must be non-negative.");
  const costs = [input.subcontractorCost ?? 0, input.equipmentCost ?? 0, input.logisticsCost ?? 0, input.miscDirectCost ?? 0];
  if (costs.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Direct project costs must be non-negative.");

  let totalPainterHours = 0;
  let directLaborCost = 0;
  let materialCost = 0;
  for (const item of input.workItems) {
    const effectiveHours = item.adjustedLaborHours ?? item.calculatedLaborHours;
    if (!Number.isFinite(effectiveHours) || effectiveHours < 0) throw new Error("Labor hours must be non-negative.");
    if (!Number.isFinite(item.directLaborCostRate) || item.directLaborCostRate < 0) throw new Error("Labor cost rate must be non-negative.");
    if (!Number.isFinite(item.materialsCost) || item.materialsCost < 0) throw new Error("Material cost must be non-negative.");
    totalPainterHours += effectiveHours;
    directLaborCost += effectiveHours * item.directLaborCostRate;
    materialCost += item.materialsCost;
  }

  totalPainterHours = round2(totalPainterHours);
  directLaborCost = round2(directLaborCost);
  materialCost = round2(materialCost);
  const wcCost = round2(directLaborCost * (input.wcPercent / 100));
  const laborBurdenCost = wcCost;
  const loadedLaborCost = round2(directLaborCost + laborBurdenCost);
  const subcontractorCost = round2(input.subcontractorCost ?? 0);
  const equipmentCost = round2(input.equipmentCost ?? 0);
  const logisticsCost = round2(input.logisticsCost ?? 0);
  const miscDirectCost = round2(input.miscDirectCost ?? 0);
  const directProjectCost = round2(loadedLaborCost + materialCost + subcontractorCost + equipmentCost + logisticsCost + miscDirectCost);
  const overheadDollars = round2(directProjectCost * (input.overheadPercent / 100));
  const trueJobCost = round2(directProjectCost + overheadDollars);

  let recommendedSellingPrice: number | null = null;
  if (input.pricingMethod === "GROSS_MARGIN" && input.targetMarginPercent != null) {
    recommendedSellingPrice = calculateGrossMarginPrice({ cost: trueJobCost, desiredMarginPercent: input.targetMarginPercent });
  } else if (input.pricingMethod === "MARKUP" && input.targetMarkupPercent != null) {
    recommendedSellingPrice = calculateMarkupPrice({ cost: trueJobCost, markupPercent: input.targetMarkupPercent / 100 });
  }
  const finalProposalPrice = input.manualPriceOverride ?? recommendedSellingPrice;
  const grossProfitDollars = finalProposalPrice == null ? null : round2(finalProposalPrice - trueJobCost);
  const grossMarginPercent = finalProposalPrice && finalProposalPrice > 0 && grossProfitDollars != null
    ? round2((grossProfitDollars / finalProposalPrice) * 100)
    : null;

  return {
    totalPainterHours,
    directLaborCost,
    wcCost,
    laborBurdenCost,
    loadedLaborCost,
    materialCost,
    subcontractorCost,
    equipmentCost,
    logisticsCost,
    miscDirectCost,
    directProjectCost,
    overheadDollars,
    trueJobCost,
    recommendedSellingPrice,
    finalProposalPrice,
    grossProfitDollars,
    grossMarginPercent,
    effectiveSalesRate: finalProposalPrice == null ? 0 : calculateEffectiveSalesRate({ finalProposalPrice, estimatedPainterHours: totalPainterHours }),
  };
}

export interface MaterialLineInput {
  quantity: number;
  unitCost: number;
  /** Percent, e.g. 40 means 40% markup over material cost. */
  markupPercent: number;
}

export interface MaterialLineResult {
  materialCost: number;
  sellingPrice: number;
}

export function computeMaterialLine(input: MaterialLineInput): MaterialLineResult {
  const { quantity, unitCost, markupPercent } = input;
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Material quantity must be a non-negative number.");
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error("Material unit cost must be a non-negative number.");
  }
  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    throw new Error("Material markup percent must be a non-negative number.");
  }

  const materialCost = round2(quantity * unitCost);
  const sellingPrice = round2(materialCost * (1 + markupPercent / 100));

  return { materialCost, sellingPrice };
}

export interface LaborLineInput {
  hours: number;
  sellRate: number;
  /** Optional internal cost rate; never surfaced to customer-facing output. */
  costRate?: number | null;
}

export interface LaborLineResult {
  laborCost: number | null;
  sellingPrice: number;
}

export function computeLaborLine(input: LaborLineInput): LaborLineResult {
  const { hours, sellRate, costRate } = input;
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error("Estimated labor hours must be a non-negative number.");
  }
  if (!Number.isFinite(sellRate) || sellRate < 0) {
    throw new Error("Labor sell rate must be a non-negative number.");
  }

  const sellingPrice = round2(hours * sellRate);
  const laborCost = costRate != null && Number.isFinite(costRate) ? round2(hours * costRate) : null;

  return { laborCost, sellingPrice };
}

/**
 * Thrown when a scope has estimated labor hours but no rate can be resolved
 * (no per-scope override and no configured company default). We deliberately
 * do not fall back to a hardcoded business rate — see resolveLaborSellRate.
 */
export class MissingLaborRateError extends Error {
  constructor(sectionTitle: string) {
    super(
      `"${sectionTitle}" has estimated labor hours but no labor sell rate is set. Set a default labor sell rate in Settings, or enter a rate for this scope.`
    );
    this.name = "MissingLaborRateError";
  }
}

/**
 * Resolves the labor sell rate for a scope: per-scope override wins, otherwise
 * the configured company default. Throws MissingLaborRateError if hours > 0 and
 * neither is available, rather than silently assuming a business rate.
 */
export function resolveLaborSellRate(
  hours: number,
  overrideRate: number | null,
  companyDefaultRate: number | null,
  sectionTitle: string
): number | null {
  if (!(hours > 0)) return null;
  const rate = overrideRate ?? companyDefaultRate;
  if (rate == null) {
    throw new MissingLaborRateError(sectionTitle);
  }
  return rate;
}

export interface ScopeEstimateInput {
  materials: MaterialLineInput[];
  labor: LaborLineInput | null;
  additionalCharges?: number;
}

export interface ScopeEstimateResult {
  materialLines: MaterialLineResult[];
  materialsCost: number;
  materialsSellingPrice: number;
  laborCost: number | null;
  laborSellingPrice: number;
  additionalCharges: number;
  /** Customer-facing total for this scope only. */
  subtotal: number;
}

export function computeScopeEstimate(input: ScopeEstimateInput): ScopeEstimateResult {
  const additionalCharges = input.additionalCharges ?? 0;
  if (!Number.isFinite(additionalCharges) || additionalCharges < 0) {
    throw new Error("Additional scope charges must be a non-negative number.");
  }

  const materialLines = input.materials.map(computeMaterialLine);
  const materialsCost = round2(materialLines.reduce((sum, line) => sum + line.materialCost, 0));
  const materialsSellingPrice = round2(materialLines.reduce((sum, line) => sum + line.sellingPrice, 0));

  const laborResult = input.labor ? computeLaborLine(input.labor) : null;
  const laborCost = laborResult?.laborCost ?? null;
  const laborSellingPrice = laborResult?.sellingPrice ?? 0;

  const subtotal = round2(laborSellingPrice + materialsSellingPrice + additionalCharges);

  return {
    materialLines,
    materialsCost,
    materialsSellingPrice,
    laborCost,
    laborSellingPrice,
    additionalCharges,
    subtotal,
  };
}

export interface ProposalTotalsInput {
  scopeSubtotals: number[];
  discountAmount?: number;
  discountPercent?: number;
  taxPercent?: number;
}

export interface ProposalTotalsResult {
  scopesSubtotal: number;
  discountApplied: number;
  afterDiscount: number;
  taxAmount: number;
  total: number;
}

export function computeProposalTotals(input: ProposalTotalsInput): ProposalTotalsResult {
  const scopesSubtotal = round2(input.scopeSubtotals.reduce((sum, value) => sum + value, 0));

  const discountPercentAmount = input.discountPercent
    ? round2(scopesSubtotal * (input.discountPercent / 100))
    : 0;
  const discountAmount = input.discountAmount ?? 0;
  const discountApplied = round2(Math.min(scopesSubtotal, discountAmount + discountPercentAmount));

  const afterDiscount = round2(Math.max(0, scopesSubtotal - discountApplied));
  const taxAmount = input.taxPercent ? round2(afterDiscount * (input.taxPercent / 100)) : 0;
  const total = round2(afterDiscount + taxAmount);

  return { scopesSubtotal, discountApplied, afterDiscount, taxAmount, total };
}

/**
 * Snapshot shape used to preserve an accepted Proposal's estimate onto a Job at
 * conversion time. This intentionally mirrors existing Job/JobMaterial/JobLabor
 * columns so no new Job schema is required — the estimate is preserved as real
 * JobMaterial/JobLabor rows, distinct from actual TimeEntry/Expense rows that
 * accumulate afterward.
 */
export interface ProposalEstimateSnapshot {
  scopes: Array<{
    title: string;
    laborHours: number | null;
    laborSellRate: number | null;
    laborSellingPrice: number;
    materials: Array<{
      name: string;
      unit: string;
      quantity: number;
      unitCost: number;
      materialCost: number;
      sellingPrice: number;
    }>;
    materialsCost: number;
    materialsSellingPrice: number;
    additionalCharges: number;
    subtotal: number;
  }>;
  totalAmount: number;
}

export interface JobEstimateSeed {
  materialsBudget: number;
  laborBudget: number;
  totalEstimate: number;
  materials: Array<{ name: string; quantity: number; unit: string; unitCost: number; totalCost: number }>;
  labor: Array<{ role: string; hours: number; hourlyCost: number; totalCost: number }>;
}

/**
 * Builds the payload needed to preserve an accepted Proposal's estimate on the
 * Job it converts to. Pure/no I/O: the caller persists the resulting rows.
 * Uses only the snapshot values already saved on the proposal — never re-derives
 * pricing from current catalog/settings — so future catalog changes cannot alter
 * an already-accepted estimate.
 */
export function buildJobEstimateFromProposal(snapshot: ProposalEstimateSnapshot): JobEstimateSeed {
  const materials = snapshot.scopes.flatMap((scope) =>
    scope.materials.map((material) => ({
      name: `${scope.title} — ${material.name}`,
      quantity: material.quantity,
      unit: material.unit,
      unitCost: material.unitCost,
      totalCost: material.materialCost,
    }))
  );

  const labor = snapshot.scopes
    .filter((scope) => scope.laborHours != null && scope.laborHours > 0)
    .map((scope) => ({
      role: scope.title,
      hours: scope.laborHours as number,
      hourlyCost: scope.laborSellRate ?? 0,
      totalCost: scope.laborSellingPrice,
    }));

  const materialsBudget = round2(snapshot.scopes.reduce((sum, scope) => sum + scope.materialsSellingPrice, 0));
  const laborBudget = round2(snapshot.scopes.reduce((sum, scope) => sum + scope.laborSellingPrice, 0));

  return {
    materialsBudget,
    laborBudget,
    totalEstimate: round2(snapshot.totalAmount),
    materials,
    labor,
  };
}
