"use client";

import { useMemo } from "react";
import { api } from "@/trpc/react";
import { calculatePaintMaterialQuantity, calculateProductionHours, computeScopeEstimate } from "@/lib/proposal-pricing";
import { formatCurrency } from "@/lib/utils";

export type SectionMaterialDraft = {
  key: string;
  inventoryItemId: number | null;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
  markupPercent: string;
  coveragePerUnit: string;
  wastePercent: string;
  calculatedQuantity: string;
  adjustedQuantity: string;
};

export type SectionEstimateDraft = {
  areaName: string;
  workCategory: "INTERIOR" | "EXTERIOR" | "PREP" | "SPECIALTY" | "";
  surfaceType: string;
  measurementType: string;
  measurementValue: string;
  coats: string;
  prepLevel: string;
  productionRateId: number | null;
  calculatedLaborHours: string;
  adjustedLaborHours: string;
  materials: SectionMaterialDraft[];
  laborSellRateOverride: string;
  additionalCharges: string;
};

function toNonNegativeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function basisForMeasurementType(measurementType: string) {
  if (measurementType === "LINEAR_FT") return "LINEAR_FT_PER_HOUR";
  if (measurementType === "COUNT") return "HOURS_PER_ITEM";
  if (measurementType === "FIXED_HOURS") return "FIXED_HOURS";
  return "SQFT_PER_HOUR";
}

function measurementTypeForBasis(basis: string) {
  if (basis === "LINEAR_FT_PER_HOUR") return "LINEAR_FT";
  if (basis === "HOURS_PER_ITEM") return "COUNT";
  if (basis === "FIXED_HOURS") return "FIXED_HOURS";
  return "SQFT";
}

function calculateEffectiveMaterialQuantity(input: {
  quantity: string;
  measurementValue: string;
  coats: string;
  coveragePerUnit: string;
  wastePercent: string;
  adjustedQuantity: string;
}) {
  const manualQuantity = toNonNegativeNumber(input.quantity);
  const measurementValue = toNonNegativeNumber(input.measurementValue);
  const coats = toNonNegativeNumber(input.coats);
  const coveragePerUnit = toNonNegativeNumber(input.coveragePerUnit);
  const wastePercent = toNonNegativeNumber(input.wastePercent);
  const adjustedQuantity = input.adjustedQuantity.trim() ? toNonNegativeNumber(input.adjustedQuantity) : null;

  let calculatedQuantity: number | null = null;
  let effectiveQuantity = manualQuantity;

  if (coveragePerUnit > 0 && measurementValue > 0 && coats > 0) {
    calculatedQuantity = calculatePaintMaterialQuantity({
      measurement: measurementValue,
      coats,
      coveragePerUnit,
      wastePercent,
      adjustedQuantity: adjustedQuantity ?? undefined,
    });
    effectiveQuantity = adjustedQuantity != null ? adjustedQuantity : calculatedQuantity;
  } else if (adjustedQuantity != null) {
    effectiveQuantity = adjustedQuantity;
  }

  return { calculatedQuantity, effectiveQuantity };
}

export function SectionMaterialsAndLabor({
  value,
  onChange,
  disabled,
  makeMaterialKey,
}: {
  value: SectionEstimateDraft;
  onChange: (next: SectionEstimateDraft) => void;
  disabled?: boolean;
  makeMaterialKey: () => string;
}) {
  const inventory = api.inventory.list.useQuery();
  const productionRates = api.productionRates.list.useQuery();
  const config = api.config.get.useQuery();

  const defaultLaborSellRate = config.data?.defaultLaborSellRate != null ? Number(config.data.defaultLaborSellRate) : null;
  const defaultLaborCostRate = config.data?.defaultLaborCostRate != null ? Number(config.data.defaultLaborCostRate) : null;
  const defaultWcPercent = config.data != null ? Number(config.data.defaultWcPercent) : 3.5;
  const defaultMarkup = config.data != null ? Number(config.data.defaultMarkup) : 27;

  const filteredRates = useMemo(() => {
    const basis = basisForMeasurementType(value.measurementType);
    const normalizedSurface = value.surfaceType.trim().toLowerCase();
    const coats = value.coats.trim() ? Number(value.coats) : null;
    const prepLevel = value.prepLevel.trim().toLowerCase();

    return (productionRates.data ?? []).filter((rate) => {
      if (value.workCategory && rate.category !== value.workCategory) return false;
      if (basis && rate.basis !== basis) return false;
      if (normalizedSurface && rate.surfaceType.trim().toLowerCase() !== normalizedSurface) return false;
      if (rate.coats != null && coats != null && rate.coats !== coats) return false;
      if (prepLevel && rate.prepLevel && rate.prepLevel.trim().toLowerCase() !== prepLevel) return false;
      return true;
    });
  }, [productionRates.data, value.workCategory, value.measurementType, value.surfaceType, value.coats, value.prepLevel]);

  const selectedProductionRate = productionRates.data?.find((rate) => rate.id === value.productionRateId) ?? null;
  const suggestedRate = filteredRates.find((rate) => rate.isDefault) ?? filteredRates[0] ?? null;

  const calculatedHours = useMemo(() => {
    if (!selectedProductionRate) return 0;
    return calculateProductionHours({
      measurement: toNonNegativeNumber(value.measurementValue),
      productionRate: Number(selectedProductionRate.rateValue),
      basis: selectedProductionRate.basis,
      fixedHours: selectedProductionRate.basis === "FIXED_HOURS" ? Number(selectedProductionRate.rateValue) : undefined,
    });
  }, [selectedProductionRate, value.measurementValue]);

  const laborHours = toNonNegativeNumber(value.adjustedLaborHours || value.calculatedLaborHours);
  const laborSellRate = value.laborSellRateOverride.trim() ? toNonNegativeNumber(value.laborSellRateOverride) : defaultLaborSellRate;
  const missingLaborRate = laborHours > 0 && laborSellRate == null;
  const directLaborCostRate = defaultLaborCostRate ?? 0;

  const materialRows = useMemo(
    () =>
      value.materials.map((material) => {
        const quantity = calculateEffectiveMaterialQuantity({
          quantity: material.quantity,
          measurementValue: value.measurementValue,
          coats: value.coats,
          coveragePerUnit: material.coveragePerUnit,
          wastePercent: material.wastePercent,
          adjustedQuantity: material.adjustedQuantity,
        });
        const markupPercent = material.markupPercent.trim() ? toNonNegativeNumber(material.markupPercent) : defaultMarkup;
        const line = computeScopeEstimate({
          materials: [{ quantity: quantity.effectiveQuantity, unitCost: toNonNegativeNumber(material.unitCost), markupPercent }],
          labor: null,
        }).materialLines[0];

        return {
          ...material,
          markupPercent,
          calculatedQuantity: quantity.calculatedQuantity,
          effectiveQuantity: quantity.effectiveQuantity,
          line,
        };
      }),
    [value.materials, value.measurementValue, value.coats, defaultMarkup]
  );

  const estimate = useMemo(() => {
    return computeScopeEstimate({
      materials: materialRows
        .filter((material) => material.name.trim().length > 0 && material.effectiveQuantity > 0)
        .map((material) => ({
          quantity: material.effectiveQuantity,
          unitCost: toNonNegativeNumber(material.unitCost),
          markupPercent: material.markupPercent,
        })),
      labor: laborHours > 0 && laborSellRate != null ? { hours: laborHours, sellRate: laborSellRate } : null,
      additionalCharges: toNonNegativeNumber(value.additionalCharges),
    });
  }, [materialRows, laborHours, laborSellRate, value.additionalCharges]);

  const directLaborCost = laborHours > 0 ? laborHours * directLaborCostRate : 0;
  const laborBurdenCost = directLaborCost * (defaultWcPercent / 100);
  const loadedLaborCost = directLaborCost + laborBurdenCost;

  const syncCalculatedHours = (next: SectionEstimateDraft, rateId: number | null) => {
    const rate = productionRates.data?.find((item) => item.id === rateId) ?? null;
    if (!rate) {
      onChange({ ...next, productionRateId: null, calculatedLaborHours: next.measurementType === "FIXED_HOURS" ? next.measurementValue : next.calculatedLaborHours });
      return;
    }

    onChange({
      ...next,
      productionRateId: rate.id,
      workCategory: next.workCategory || rate.category,
      surfaceType: next.surfaceType || rate.surfaceType,
      measurementType: measurementTypeForBasis(rate.basis),
      calculatedLaborHours: String(
        calculateProductionHours({
          measurement: toNonNegativeNumber(next.measurementValue),
          productionRate: Number(rate.rateValue),
          basis: rate.basis,
          fixedHours: rate.basis === "FIXED_HOURS" ? Number(rate.rateValue) : undefined,
        })
      ),
    });
  };

  const updateMaterial = (key: string, patch: Partial<SectionMaterialDraft>) => {
    onChange({
      ...value,
      materials: value.materials.map((material) => (material.key === key ? { ...material, ...patch } : material)),
    });
  };

  const addMaterial = () => {
    onChange({
      ...value,
      materials: [
        ...value.materials,
        {
          key: makeMaterialKey(),
          inventoryItemId: null,
          name: "",
          unit: "unit",
          quantity: "",
          unitCost: "0",
          markupPercent: "",
          coveragePerUnit: "",
          wastePercent: "0",
          calculatedQuantity: "",
          adjustedQuantity: "",
        },
      ],
    });
  };

  const removeMaterial = (key: string) => {
    onChange({ ...value, materials: value.materials.filter((material) => material.key !== key) });
  };

  const selectCatalogItem = (key: string, inventoryItemId: number) => {
    const item = inventory.data?.find((entry) => entry.id === inventoryItemId);
    if (!item) return;
    updateMaterial(key, {
      inventoryItemId: item.id,
      name: item.name,
      unit: item.unit,
      quantity: "",
      unitCost: String(Number(item.costPerUnit)),
      coveragePerUnit: item.coveragePerUnit == null ? "" : String(Number(item.coveragePerUnit)),
      wastePercent: String(Number(item.defaultWastePercent ?? 0)),
      markupPercent: item.defaultMarkupPercent != null ? String(Number(item.defaultMarkupPercent)) : "",
    });
  };

  return (
    <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Estimator Inputs</h3>
          <p className="text-xs text-slate-500">Category, surface, hours, materials, and internal cost breakdown for this scope item.</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-slate-500">Scope subtotal</div>
          <div className="font-semibold">{formatCurrency(estimate.subtotal)}</div>
        </div>
      </div>

      {missingLaborRate ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No default labor sell rate is configured. Set one in Settings or enter a scope-level sell rate before this labor can contribute to the recommendation.
        </div>
      ) : null}

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="label">Area</label>
          <input className="input" value={value.areaName} onChange={(e) => onChange({ ...value, areaName: e.target.value })} disabled={disabled} placeholder="Kitchen" />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={value.workCategory} onChange={(e) => onChange({ ...value, workCategory: e.target.value as SectionEstimateDraft["workCategory"] })} disabled={disabled}>
            <option value="">Select category</option>
            <option value="INTERIOR">Interior</option>
            <option value="EXTERIOR">Exterior</option>
            <option value="PREP">Prep</option>
            <option value="SPECIALTY">Specialty</option>
          </select>
        </div>
        <div>
          <label className="label">Surface / work type</label>
          <input className="input" value={value.surfaceType} onChange={(e) => onChange({ ...value, surfaceType: e.target.value })} disabled={disabled} placeholder="Walls" />
        </div>
        <div>
          <label className="label">Prep level</label>
          <input className="input" value={value.prepLevel} onChange={(e) => onChange({ ...value, prepLevel: e.target.value })} disabled={disabled} placeholder="Normal" />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="label">Measurement type</label>
          <select className="input" value={value.measurementType} onChange={(e) => onChange({ ...value, measurementType: e.target.value })} disabled={disabled}>
            <option value="SQFT">Square feet</option>
            <option value="LINEAR_FT">Linear feet</option>
            <option value="COUNT">Count</option>
            <option value="FIXED_HOURS">Fixed hours</option>
          </select>
        </div>
        <div>
          <label className="label">Measurement value</label>
          <input
            className="input"
            inputMode="decimal"
            value={value.measurementValue}
            onChange={(e) => {
              const next = { ...value, measurementValue: e.target.value };
              if (selectedProductionRate) {
                syncCalculatedHours(next, selectedProductionRate.id);
                return;
              }
              onChange(next);
            }}
            disabled={disabled}
            placeholder="620"
          />
        </div>
        <div>
          <label className="label">Coats</label>
          <input className="input" inputMode="numeric" value={value.coats} onChange={(e) => onChange({ ...value, coats: e.target.value })} disabled={disabled} placeholder="2" />
        </div>
        <div>
          <label className="label">Production rate</label>
          <select className="input" value={value.productionRateId ?? ""} onChange={(e) => syncCalculatedHours(value, e.target.value ? Number(e.target.value) : null)} disabled={disabled}>
            <option value="">Manual hours / select later</option>
            {filteredRates.map((rate) => (
              <option key={rate.id} value={rate.id}>
                {rate.name} · {rate.surfaceType} · {Number(rate.rateValue)} · {rate.basis}
              </option>
            ))}
          </select>
          {!selectedProductionRate && suggestedRate ? (
            <p className="mt-1 text-xs text-slate-500">Suggested: {suggestedRate.name}</p>
          ) : null}
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div>
          <label className="label">Calculated labor hours</label>
          <input className="input bg-slate-100" value={value.calculatedLaborHours || (selectedProductionRate ? String(calculatedHours) : "0")} readOnly disabled />
        </div>
        <div>
          <label className="label">Manual labor-hours adjustment</label>
          <input className="input" inputMode="decimal" value={value.adjustedLaborHours} onChange={(e) => onChange({ ...value, adjustedLaborHours: e.target.value })} disabled={disabled} placeholder="Optional override" />
        </div>
        <div>
          <label className="label">Labor sell rate</label>
          <input className="input" inputMode="decimal" value={value.laborSellRateOverride} onChange={(e) => onChange({ ...value, laborSellRateOverride: e.target.value })} disabled={disabled} placeholder={defaultLaborSellRate != null ? `Default ${defaultLaborSellRate}` : "Not configured"} />
        </div>
        <div>
          <label className="label">Additional charges</label>
          <input className="input" inputMode="decimal" value={value.additionalCharges} onChange={(e) => onChange({ ...value, additionalCharges: e.target.value })} disabled={disabled} />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Painter Hours</div>
          <div className="mt-1 font-medium">{laborHours.toFixed(2)}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Direct Labor Cost</div>
          <div className="mt-1 font-medium">{formatCurrency(directLaborCost)}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Labor Burden</div>
          <div className="mt-1 font-medium">{formatCurrency(laborBurdenCost)}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Loaded Labor Cost</div>
          <div className="mt-1 font-medium">{formatCurrency(loadedLaborCost)}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="label mb-0">Materials from Inventory</label>
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={addMaterial}>
            Add Material
          </button>
        </div>

        {value.materials.length === 0 ? (
          <div className="text-xs text-slate-500">No materials added to this scope item yet.</div>
        ) : (
          <div className="space-y-3">
            {materialRows.map((material) => (
              <div key={material.key} className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
                <div className="grid md:grid-cols-6 gap-2 items-end">
                  <div className="md:col-span-2">
                    <label className="label">Catalog item</label>
                    <select
                      className="input"
                      value={material.inventoryItemId ?? ""}
                      onChange={(e) => (e.target.value ? selectCatalogItem(material.key, Number(e.target.value)) : updateMaterial(material.key, { inventoryItemId: null }))}
                      disabled={disabled}
                    >
                      <option value="">Custom / not in catalog</option>
                      {inventory.data?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {!material.inventoryItemId ? (
                      <input className="input mt-1" placeholder="Material name" value={material.name} onChange={(e) => updateMaterial(material.key, { name: e.target.value })} disabled={disabled} />
                    ) : null}
                  </div>
                  <div>
                    <label className="label">Manual qty</label>
                    <input className="input" inputMode="decimal" value={material.quantity} onChange={(e) => updateMaterial(material.key, { quantity: e.target.value })} disabled={disabled} />
                  </div>
                  <div>
                    <label className="label">Unit</label>
                    <input className="input" value={material.unit} onChange={(e) => updateMaterial(material.key, { unit: e.target.value })} disabled={disabled} />
                  </div>
                  <div>
                    <label className="label">Unit cost</label>
                    <input className="input" inputMode="decimal" value={material.unitCost} onChange={(e) => updateMaterial(material.key, { unitCost: e.target.value })} disabled={disabled} />
                  </div>
                  <div className="flex items-end gap-2">
                    <button type="button" className="btn btn-secondary w-full" disabled={disabled} onClick={() => removeMaterial(material.key)}>
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-6 gap-2">
                  <div>
                    <label className="label">Coverage / unit</label>
                    <input className="input" inputMode="decimal" value={material.coveragePerUnit} onChange={(e) => updateMaterial(material.key, { coveragePerUnit: e.target.value })} disabled={disabled} placeholder="350" />
                  </div>
                  <div>
                    <label className="label">Waste %</label>
                    <input className="input" inputMode="decimal" value={material.wastePercent} onChange={(e) => updateMaterial(material.key, { wastePercent: e.target.value })} disabled={disabled} placeholder="10" />
                  </div>
                  <div>
                    <label className="label">Calculated qty</label>
                    <input className="input bg-slate-100" value={material.calculatedQuantity != null ? String(material.calculatedQuantity) : ""} readOnly disabled />
                  </div>
                  <div>
                    <label className="label">Adjusted qty</label>
                    <input className="input" inputMode="decimal" value={material.adjustedQuantity} onChange={(e) => updateMaterial(material.key, { adjustedQuantity: e.target.value })} disabled={disabled} placeholder="Optional override" />
                  </div>
                  <div>
                    <label className="label">Markup %</label>
                    <input className="input" inputMode="decimal" value={material.markupPercent} onChange={(e) => updateMaterial(material.key, { markupPercent: e.target.value })} disabled={disabled} placeholder={`${defaultMarkup}`} />
                  </div>
                  <div>
                    <label className="label">Effective qty</label>
                    <input className="input bg-slate-100" value={String(material.effectiveQuantity || 0)} readOnly disabled />
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-2 text-sm">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Material Cost</div>
                    <div className="mt-1 font-medium">{formatCurrency(material.line?.materialCost ?? 0)}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Sell Price</div>
                    <div className="mt-1 font-medium">{formatCurrency(material.line?.sellingPrice ?? 0)}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Calculation</div>
                    <div className="mt-1 text-slate-700">
                      {material.calculatedQuantity != null
                        ? `${toNonNegativeNumber(value.measurementValue)} × ${toNonNegativeNumber(value.coats)} coats ÷ ${toNonNegativeNumber(material.coveragePerUnit)} coverage, plus ${toNonNegativeNumber(material.wastePercent)}% waste`
                        : "Using manual quantity for this material line."}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-3 text-sm pt-2 border-t border-slate-200">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Materials Cost</div>
          <div className="mt-1 font-medium">{formatCurrency(estimate.materialsCost)}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Materials Sell</div>
          <div className="mt-1 font-medium">{formatCurrency(estimate.materialsSellingPrice)}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Labor Sell</div>
          <div className="mt-1 font-medium">{formatCurrency(estimate.laborSellingPrice)}</div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Scope Subtotal</div>
          <div className="mt-1 font-medium">{formatCurrency(estimate.subtotal)}</div>
        </div>
      </div>
    </div>
  );
}
