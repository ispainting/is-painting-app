"use client";

import { useMemo } from "react";
import { api } from "@/trpc/react";
import { computeScopeEstimate } from "@/lib/proposal-pricing";
import { formatCurrency } from "@/lib/utils";

export type SectionMaterialDraft = {
  key: string;
  inventoryItemId: number | null;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
  markupPercent: string;
};

export type SectionEstimateDraft = {
  materials: SectionMaterialDraft[];
  estimatedLaborHours: string;
  laborSellRateOverride: string;
  additionalCharges: string;
};

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Materials & Labor estimator for one Proposal scope (ProposalSection).
 * Materials come from the reusable Inventory catalog; nothing here is
 * hard-coded. Company defaults (labor sell rate, material markup) come from
 * Settings and are only used as a starting point — everything is editable
 * per line and snapshotted on save, so later catalog/settings changes never
 * rewrite an already-saved estimate.
 */
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
  const config = api.config.get.useQuery();

  const defaultLaborSellRate = config.data?.defaultLaborSellRate != null ? Number(config.data.defaultLaborSellRate) : null;
  const defaultMarkup = config.data ? Number(config.data.defaultMarkup) : 27;

  const laborSellRate = value.laborSellRateOverride.trim() ? toNumber(value.laborSellRateOverride) : defaultLaborSellRate;
  const laborHours = toNumber(value.estimatedLaborHours);
  const missingLaborRate = laborHours > 0 && laborSellRate == null;

  const estimate = useMemo(() => {
    return computeScopeEstimate({
      materials: value.materials
        .filter((m) => m.name.trim().length > 0 && toNumber(m.quantity) > 0)
        .map((m) => ({
          quantity: toNumber(m.quantity),
          unitCost: toNumber(m.unitCost),
          markupPercent: m.markupPercent.trim() ? toNumber(m.markupPercent) : defaultMarkup,
        })),
      labor: laborHours > 0 && laborSellRate != null ? { hours: laborHours, sellRate: laborSellRate } : null,
      additionalCharges: toNumber(value.additionalCharges),
    });
  }, [value.materials, value.estimatedLaborHours, value.additionalCharges, laborSellRate, laborHours, defaultMarkup]);

  const addMaterial = () => {
    onChange({
      ...value,
      materials: [
        ...value.materials,
        { key: makeMaterialKey(), inventoryItemId: null, name: "", unit: "unit", quantity: "1", unitCost: "0", markupPercent: "" },
      ],
    });
  };

  const updateMaterial = (key: string, patch: Partial<SectionMaterialDraft>) => {
    onChange({
      ...value,
      materials: value.materials.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    });
  };

  const removeMaterial = (key: string) => {
    onChange({ ...value, materials: value.materials.filter((m) => m.key !== key) });
  };

  const selectCatalogItem = (key: string, inventoryItemId: number) => {
    const item = inventory.data?.find((i) => i.id === inventoryItemId);
    if (!item) return;
    updateMaterial(key, {
      inventoryItemId: item.id,
      name: item.name,
      unit: item.unit,
      unitCost: String(Number(item.costPerUnit)),
      markupPercent: item.defaultMarkupPercent != null ? String(Number(item.defaultMarkupPercent)) : "",
    });
  };

  return (
    <div className="md:col-span-2 border border-slate-200 rounded-md p-3 space-y-3 bg-slate-50/50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Materials & Labor Estimate (internal)</h3>
        <span className="text-sm text-slate-600">Scope subtotal: {formatCurrency(estimate.subtotal)}</span>
      </div>

      {missingLaborRate && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          No labor sell rate is configured. Set a default in Settings or enter a rate above — labor will not be priced until then.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="label">Estimated painter-hours</label>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={value.estimatedLaborHours}
            onChange={(e) => onChange({ ...value, estimatedLaborHours: e.target.value })}
            disabled={disabled}
            placeholder="0"
          />
        </div>
        <div>
          <label className="label">Labor sell rate ($/hr)</label>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={value.laborSellRateOverride}
            onChange={(e) => onChange({ ...value, laborSellRateOverride: e.target.value })}
            disabled={disabled}
            placeholder={defaultLaborSellRate != null ? `Default ${defaultLaborSellRate}` : "Not configured"}
          />
        </div>
        <div>
          <label className="label">Labor selling price</label>
          <input className="input bg-slate-100" value={formatCurrency(estimate.laborSellingPrice)} disabled readOnly />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="label mb-0">Materials</label>
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={addMaterial}>
            Add Material
          </button>
        </div>

        {value.materials.length === 0 ? (
          <div className="text-xs text-slate-500">No materials added to this scope yet.</div>
        ) : (
          <div className="space-y-2">
            {value.materials.map((m) => {
              const markupPercent = m.markupPercent.trim() ? toNumber(m.markupPercent) : defaultMarkup;
              const line = computeScopeEstimate({
                materials: [{ quantity: toNumber(m.quantity), unitCost: toNumber(m.unitCost), markupPercent }],
                labor: null,
              });
              return (
                <div key={m.key} className="grid md:grid-cols-6 gap-2 items-end">
                  <div className="md:col-span-2">
                    <label className="label">Catalog item</label>
                    <select
                      className="input"
                      value={m.inventoryItemId ?? ""}
                      onChange={(e) => (e.target.value ? selectCatalogItem(m.key, Number(e.target.value)) : updateMaterial(m.key, { inventoryItemId: null }))}
                      disabled={disabled}
                    >
                      <option value="">Custom / not in catalog</option>
                      {inventory.data?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {!m.inventoryItemId && (
                      <input
                        className="input mt-1"
                        placeholder="Material name"
                        value={m.name}
                        onChange={(e) => updateMaterial(m.key, { name: e.target.value })}
                        disabled={disabled}
                      />
                    )}
                  </div>
                  <div>
                    <label className="label">Qty</label>
                    <input className="input" inputMode="decimal" value={m.quantity} onChange={(e) => updateMaterial(m.key, { quantity: e.target.value })} disabled={disabled} />
                  </div>
                  <div>
                    <label className="label">Unit cost</label>
                    <input className="input" inputMode="decimal" value={m.unitCost} onChange={(e) => updateMaterial(m.key, { unitCost: e.target.value })} disabled={disabled} />
                  </div>
                  <div>
                    <label className="label">Markup %</label>
                    <input className="input" inputMode="decimal" placeholder={`${defaultMarkup}`} value={m.markupPercent} onChange={(e) => updateMaterial(m.key, { markupPercent: e.target.value })} disabled={disabled} />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="label">Sell price</label>
                      <input className="input bg-slate-100" value={formatCurrency(line.materialLines[0]?.sellingPrice ?? 0)} disabled readOnly />
                    </div>
                    <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => removeMaterial(m.key)}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
        <div>
          <label className="label">Additional scope charges</label>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={value.additionalCharges}
            onChange={(e) => onChange({ ...value, additionalCharges: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="label">Materials cost (internal)</label>
          <input className="input bg-slate-100" value={formatCurrency(estimate.materialsCost)} disabled readOnly />
        </div>
        <div>
          <label className="label">Materials selling price</label>
          <input className="input bg-slate-100" value={formatCurrency(estimate.materialsSellingPrice)} disabled readOnly />
        </div>
      </div>
    </div>
  );
}
