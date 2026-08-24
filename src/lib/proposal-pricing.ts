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
