"use client";

import { useMemo } from "react";
import { api } from "@/trpc/react";
import { calculateProductionHours } from "@/lib/proposal-pricing";
import { formatCurrency } from "@/lib/utils";
import {
  MaterialsEditor,
  type LaborLineDraft,
  type SectionEstimateDraft,
} from "./SectionMaterialsAndLabor";

export type PricingWorkItemDraft = SectionEstimateDraft & {
  key: string;
  templateKey: string;
  title: string;
  description: string;
  bulletItems: string[];
  notes: string;
  sortOrder: number;
};

const emptyEstimateFields = {
  areaName: "",
  phaseName: "",
  workCategoryLabel: "",
  customerTitle: "",
  priceVisibilityMode: "HIDDEN" as const,
  clientNotes: "",
  internalNotes: "",
  materials: [],
  unitPrice: null,
  manualTotal: null,
  production: null,
};

export function createDefaultPricingWorkItems(defaultWorkDayHours = 8, defaultLaborCostRate = 0): PricingWorkItemDraft[] {
  return [{
    key: "pricing-labor-materials",
    templateKey: "pricing",
    title: "Labor and materials",
    description: "",
    bulletItems: [],
    notes: "",
    sortOrder: 0,
    ...emptyEstimateFields,
    estimateMethod: "LABOR_AND_MATERIALS",
    laborLines: [createLaborLine("pricing-labor-1", defaultWorkDayHours, defaultLaborCostRate)],
  }];
}

function createLaborLine(key: string, defaultWorkDayHours: number, defaultLaborCostRate: number): LaborLineDraft {
  const effectiveRate = defaultLaborCostRate > 0 ? defaultLaborCostRate : 23;
  return {
    key,
    label: "Crew labor",
    mode: "HOURS",
    workers: "",
    hoursPerWorker: "",
    days: "",
    hoursPerDay: String(defaultWorkDayHours),
    hourlyCost: String(effectiveRate),
    manualTotalOverride: "",
    internalNote: "",
  };
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function laborMode(line: LaborLineDraft) {
  return line.manualTotalOverride.trim() && !line.workers.trim() ? "MANUAL" : line.mode;
}

function laborPreview(line: LaborLineDraft, defaultWorkDayHours: number) {
  const workers = numberValue(line.workers);
  const hourlyCost = numberValue(line.hourlyCost);
  const totalWorkerHours = line.mode === "DAYS"
    ? workers * numberValue(line.days) * numberValue(line.hoursPerDay)
    : workers * numberValue(line.hoursPerWorker);
  const calculated = totalWorkerHours * hourlyCost;
  const days = line.mode === "DAYS"
    ? numberValue(line.days)
    : defaultWorkDayHours > 0 ? numberValue(line.hoursPerWorker) / defaultWorkDayHours : 0;
  return {
    totalWorkerHours,
    calculated,
    used: line.manualTotalOverride.trim() ? numberValue(line.manualTotalOverride) : calculated,
    days,
  };
}

function nextKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ProposalPricingCalculator({
  value,
  onChange,
  areas,
  disabled,
  defaultWorkDayHours,
  defaultLaborCostRate,
  makeMaterialKey,
  section = "core",
}: {
  value: PricingWorkItemDraft[];
  onChange: (next: PricingWorkItemDraft[]) => void;
  areas: string[];
  disabled?: boolean;
  defaultWorkDayHours: number;
  defaultLaborCostRate: number;
  makeMaterialKey: () => string;
  section?: "core" | "advanced";
}) {
  const inventory = api.inventory.list.useQuery();
  const templates = api.estimatingTemplates.list.useQuery({ activeOnly: true });
  const productionRates = api.productionRates.list.useQuery();
  const laborMaterials = value.find((item) => item.key === "pricing-labor-materials") ?? createDefaultPricingWorkItems(defaultWorkDayHours, defaultLaborCostRate)[0]!;
  const unitItems = value.filter((item) => item.estimateMethod === "UNIT_PRICE");
  const productionItem = value.find((item) => item.estimateMethod === "PRODUCTION_RATE");

  const replaceItem = (next: PricingWorkItemDraft) => {
    const exists = value.some((item) => item.key === next.key);
    onChange(exists ? value.map((item) => item.key === next.key ? next : item) : [...value, next]);
  };

  const updateLabor = (key: string, patch: Partial<LaborLineDraft>) => {
    replaceItem({
      ...laborMaterials,
      laborLines: laborMaterials.laborLines.map((line) => line.key === key ? { ...line, ...patch } : line),
    });
  };

  const laborTotals = useMemo(
    () => laborMaterials.laborLines.reduce((totals, line) => {
      const preview = laborPreview(line, defaultWorkDayHours);
      return {
        workers: totals.workers + numberValue(line.workers),
        hours: totals.hours + preview.totalWorkerHours,
        cost: totals.cost + preview.used,
      };
    }, { workers: 0, hours: 0, cost: 0 }),
    [laborMaterials.laborLines, defaultWorkDayHours]
  );

  const getMaterialAmount = (material: any) => {
    if (material.type === "MANUAL_TOTAL" || (material.manualTotal?.trim() && !material.quantity?.trim())) {
      return numberValue(material.manualTotal);
    }
    const q = numberValue(material.quantity);
    const u = numberValue(material.unitCost);
    if (q > 0 && u > 0) return q * u;
    if (material.manualTotal?.trim()) return numberValue(material.manualTotal);
    return u;
  };

  const materialSubtotal = laborMaterials.materials.reduce((total, material) => {
    return total + getMaterialAmount(material);
  }, 0);

  return (
    <div className="space-y-4">
      {section === "core" ? <>
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">1. Labor &amp; Schedule</h2>
            <p className="text-sm text-slate-500">Start here with your crew, time, and hourly cost.</p>
          </div>
          <button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => replaceItem({
            ...laborMaterials,
            laborLines: [...laborMaterials.laborLines, createLaborLine(nextKey("pricing-labor"), defaultWorkDayHours, defaultLaborCostRate)],
          })}>Add another labor group</button>
        </div>
        <div className="space-y-3">
          {laborMaterials.laborLines.map((line, index) => {
            const preview = laborPreview(line, defaultWorkDayHours);
            const selectedMode = laborMode(line);
            return (
              <div key={line.key} className="rounded-md border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <TextField label="Labor group" value={line.label} disabled={disabled} onChange={(next) => updateLabor(line.key, { label: next })} />
                  <div>
                    <label className="label">Calculate labor</label>
                    <select className="input" value={selectedMode} disabled={disabled} onChange={(event) => {
                      const mode = event.target.value as "HOURS" | "DAYS" | "MANUAL";
                      updateLabor(line.key, mode === "MANUAL"
                        ? { mode: "HOURS", workers: "", manualTotalOverride: line.manualTotalOverride || "" }
                        : { mode, manualTotalOverride: selectedMode === "MANUAL" ? "" : line.manualTotalOverride });
                    }}>
                      <option value="HOURS">Calculate by hours</option>
                      <option value="DAYS">Calculate by days</option>
                      <option value="MANUAL">Enter labor total manually</option>
                    </select>
                  </div>
                  {selectedMode === "MANUAL" ? (
                    <TextField label="Manual labor total" value={line.manualTotalOverride} disabled={disabled} onChange={(next) => updateLabor(line.key, { manualTotalOverride: next })} />
                  ) : (
                    <>
                      <TextField label="Number of workers" value={line.workers} disabled={disabled} onChange={(next) => updateLabor(line.key, { workers: next })} />
                      {line.mode === "HOURS" ? (
                        <TextField label="Hours per worker" value={line.hoursPerWorker} disabled={disabled} onChange={(next) => updateLabor(line.key, { hoursPerWorker: next })} />
                      ) : (
                        <TextField label="Number of days" value={line.days} disabled={disabled} onChange={(next) => updateLabor(line.key, { days: next })} />
                      )}
                      {line.mode === "DAYS" ? <TextField label="Hours per day" value={line.hoursPerDay} disabled={disabled} onChange={(next) => updateLabor(line.key, { hoursPerDay: next })} /> : null}
                      <TextField label="Hourly pay rate" value={line.hourlyCost} disabled={disabled} onChange={(next) => updateLabor(line.key, { hourlyCost: next })} />
                      <TextField label="Manual labor total (optional)" value={line.manualTotalOverride} disabled={disabled} onChange={(next) => updateLabor(line.key, { manualTotalOverride: next })} />
                    </>
                  )}
                  <AreaField value={laborMaterials.areaName} areas={areas} disabled={disabled} onChange={(areaName) => replaceItem({ ...laborMaterials, areaName })} />
                </div>
                <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                  {selectedMode === "MANUAL" ? (
                    <div>Manual labor total = <strong>{formatCurrency(preview.used)}</strong></div>
                  ) : line.mode === "DAYS" ? (
                    <div>{numberValue(line.workers)} workers × {numberValue(line.days)} days × {numberValue(line.hoursPerDay)} hours/day × {formatCurrency(numberValue(line.hourlyCost))}/hour = <strong>{formatCurrency(preview.calculated)}</strong></div>
                  ) : (
                    <div>{numberValue(line.workers)} workers × {numberValue(line.hoursPerWorker)} hours × {formatCurrency(numberValue(line.hourlyCost))}/hour = <strong>{formatCurrency(preview.calculated)}</strong></div>
                  )}
                  {line.manualTotalOverride.trim() && preview.calculated > 0 ? <div className="mt-1 text-slate-600">Calculated amount preserved: {formatCurrency(preview.calculated)} · Using override: {formatCurrency(preview.used)}</div> : null}
                  <div className="mt-2 grid gap-2 text-slate-600 sm:grid-cols-4">
                    <span>Crew size: {numberValue(line.workers)}</span>
                    {line.mode === "DAYS" ? <span>Project days: {preview.days}</span> : null}
                    <span>Worker-hours: {preview.totalWorkerHours}</span>
                    <span>Labor cost: {formatCurrency(preview.used)}</span>
                  </div>
                </div>
                {laborMaterials.laborLines.length > 1 ? <div className="mt-3 text-right"><button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => replaceItem({ ...laborMaterials, laborLines: laborMaterials.laborLines.filter((_, itemIndex) => itemIndex !== index) })}>Remove group</button></div> : null}
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-3">
          <strong>Crew size: {laborTotals.workers}</strong><strong>Total worker-hours: {laborTotals.hours}</strong><strong>Labor subtotal: {formatCurrency(laborTotals.cost)}</strong>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold">2. Materials</h2>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(materialSubtotal)}</span>
            </div>
            <p className="text-sm text-slate-500">Add a description and amount. Reviewed receipt prices can eventually provide catalog pricing; receipt review does not currently create or update inventory items.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={disabled}
              onClick={() => replaceItem({
                ...laborMaterials,
                materials: [
                  ...laborMaterials.materials,
                  {
                    key: makeMaterialKey(),
                    inventoryItemId: null,
                    type: "CUSTOM",
                    name: "",
                    unit: "unit",
                    quantity: "1",
                    unitCost: "",
                    manualTotal: "",
                    coveragePerUnit: "",
                    wastePercent: "0",
                    adjustedQuantity: "",
                    note: "",
                    priceSourceType: null,
                    priceSourceLabel: "",
                    priceSourceExpenseId: null,
                    priceSourceExpenseLineItemId: null,
                  },
                ],
              })}
            >
              Add material cost
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={disabled}
              onClick={() => replaceItem({
                ...laborMaterials,
                materials: [
                  ...laborMaterials.materials,
                  {
                    key: makeMaterialKey(),
                    inventoryItemId: null,
                    type: "MANUAL_TOTAL",
                    name: "Materials total",
                    unit: "unit",
                    quantity: "",
                    unitCost: "",
                    manualTotal: "",
                    coveragePerUnit: "",
                    wastePercent: "0",
                    adjustedQuantity: "",
                    note: "",
                    priceSourceType: "MANUAL",
                    priceSourceLabel: "Manual material total",
                    priceSourceExpenseId: null,
                    priceSourceExpenseLineItemId: null,
                  },
                ],
              })}
            >
              Enter one material total
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {laborMaterials.materials.map((material, matIndex) => {
            const currentAmount = material.type === "MANUAL_TOTAL"
              ? material.manualTotal
              : material.manualTotal?.trim()
                ? material.manualTotal
                : material.unitCost;

            return (
              <div key={material.key} className="rounded-md border border-slate-200 p-3 bg-white">
                <div className="grid gap-3 md:grid-cols-[1fr,180px,auto] items-end">
                  <TextField
                    label="Material or description"
                    value={material.name}
                    disabled={disabled}
                    onChange={(nextName) => replaceItem({
                      ...laborMaterials,
                      materials: laborMaterials.materials.map((m) => m.key === material.key ? { ...m, name: nextName } : m),
                    })}
                  />
                  <div>
                    <label className="label">Amount</label>
                    <input
                      className="input"
                      type="text"
                      inputMode="decimal"
                      value={currentAmount}
                      disabled={disabled}
                      placeholder="$0.00"
                      onChange={(e) => {
                        const amt = e.target.value;
                        replaceItem({
                          ...laborMaterials,
                          materials: laborMaterials.materials.map((m) =>
                            m.key === material.key
                              ? {
                                  ...m,
                                  manualTotal: amt,
                                  unitCost: amt,
                                  quantity: m.quantity?.trim() ? m.quantity : "1",
                                }
                              : m
                          ),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <button
                      className="btn btn-secondary text-sm"
                      type="button"
                      disabled={disabled}
                      onClick={() => replaceItem({
                        ...laborMaterials,
                        materials: laborMaterials.materials.filter((m) => m.key !== material.key),
                      })}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <details className="mt-2 pt-2 border-t border-slate-100">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900 select-none">
                    Use inventory or receipt pricing
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-4 bg-slate-50 p-3 rounded-md">
                    <div>
                      <label className="label text-xs">Catalog item</label>
                      <select
                        className="input text-xs"
                        disabled={disabled}
                        value={material.inventoryItemId ?? ""}
                        onChange={(e) => {
                          const item = inventory.data?.find((entry) => entry.id === Number(e.target.value));
                          if (!item) return;
                          const costStr = String(Number(item.costPerUnit));
                          replaceItem({
                            ...laborMaterials,
                            materials: laborMaterials.materials.map((m) =>
                              m.key === material.key
                                ? {
                                    ...m,
                                    inventoryItemId: item.id,
                                    type: "CATALOG",
                                    name: m.name.trim() || item.name,
                                    unit: item.unit,
                                    unitCost: costStr,
                                    manualTotal: costStr,
                                    quantity: m.quantity?.trim() ? m.quantity : "1",
                                    coveragePerUnit: item.coveragePerUnit == null ? "" : String(Number(item.coveragePerUnit)),
                                    wastePercent: String(Number(item.defaultWastePercent ?? 0)),
                                    priceSourceType: "INVENTORY_DEFAULT",
                                    priceSourceLabel: "Latest catalog price",
                                    priceSourceExpenseId: null,
                                    priceSourceExpenseLineItemId: null,
                                  }
                                : m
                            ),
                          });
                        }}
                      >
                        <option value="">None / Custom</option>
                        {inventory.data?.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {formatCurrency(Number(item.costPerUnit))}
                          </option>
                        ))}
                      </select>
                    </div>

                    <TextField
                      label="Unit"
                      value={material.unit}
                      disabled={disabled}
                      onChange={(next) => replaceItem({
                        ...laborMaterials,
                        materials: laborMaterials.materials.map((m) => m.key === material.key ? { ...m, unit: next } : m),
                      })}
                    />

                    <TextField
                      label="Quantity"
                      value={material.quantity}
                      disabled={disabled}
                      onChange={(next) => replaceItem({
                        ...laborMaterials,
                        materials: laborMaterials.materials.map((m) => {
                          if (m.key !== material.key) return m;
                          const total = (numberValue(next) * numberValue(m.unitCost)).toFixed(2);
                          return { ...m, quantity: next, manualTotal: numberValue(next) > 0 ? total : m.manualTotal };
                        }),
                      })}
                    />

                    <TextField
                      label="Unit cost"
                      value={material.unitCost}
                      disabled={disabled}
                      onChange={(next) => replaceItem({
                        ...laborMaterials,
                        materials: laborMaterials.materials.map((m) => {
                          if (m.key !== material.key) return m;
                          const total = (numberValue(m.quantity || "1") * numberValue(next)).toFixed(2);
                          return { ...m, unitCost: next, manualTotal: total };
                        }),
                      })}
                    />

                    <TextField
                      label="Coverage / unit"
                      value={material.coveragePerUnit}
                      disabled={disabled}
                      onChange={(next) => replaceItem({
                        ...laborMaterials,
                        materials: laborMaterials.materials.map((m) => m.key === material.key ? { ...m, coveragePerUnit: next } : m),
                      })}
                    />

                    <TextField
                      label="Waste %"
                      value={material.wastePercent}
                      disabled={disabled}
                      onChange={(next) => replaceItem({
                        ...laborMaterials,
                        materials: laborMaterials.materials.map((m) => m.key === material.key ? { ...m, wastePercent: next } : m),
                      })}
                    />

                    <div className="md:col-span-2">
                      <TextField
                        label="Notes"
                        value={material.note}
                        disabled={disabled}
                        onChange={(next) => replaceItem({
                          ...laborMaterials,
                          materials: laborMaterials.materials.map((m) => m.key === material.key ? { ...m, note: next } : m),
                        })}
                      />
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
          {laborMaterials.materials.length === 0 ? (
            <p className="text-sm text-slate-500">No material costs entered yet. Click "Add material cost" above.</p>
          ) : null}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">3. Cabinet &amp; Unit Pricing</h2><p className="text-sm text-slate-500">Price repeatable work by quantity. Current templates are for cabinet refinishing; more services can be added later.</p></div><button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => onChange([...value, createUnitItem(value.length)])}>Add unit-price line</button></div>
        <div className="space-y-3">
          {unitItems.map((item) => {
            const unit = item.unitPrice!;
            const calculated = numberValue(unit.quantity) * numberValue(unit.pricePerUnit);
            const total = unit.lineTotalOverride.trim() ? numberValue(unit.lineTotalOverride) : calculated;
            return <div key={item.key} className="rounded-md border border-slate-200 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div><label className="label">Pricing template</label><select className="input" value={unit.templateId ?? ""} disabled={disabled} onChange={(event) => {
                  const template = templates.data?.find((entry) => entry.id === Number(event.target.value));
                  if (!template) return;
                  replaceItem({ ...item, title: template.serviceName, unitPrice: { ...unit, templateId: template.id, serviceName: template.serviceName, variantName: template.variantName, unitLabel: template.unitLabel, pricePerUnit: String(Number(template.defaultPricePerUnit)), laborAllowance: template.defaultLaborAllowance == null ? "" : String(Number(template.defaultLaborAllowance)), materialAllowance: template.defaultMaterialAllowance == null ? "" : String(Number(template.defaultMaterialAllowance)), rateSource: template.rateSource } });
                }}><option value="">Select template</option>{templates.data?.map((template) => <option key={template.id} value={template.id}>{template.serviceName} · {template.variantName} · {formatCurrency(Number(template.defaultPricePerUnit))}/{template.unitLabel}</option>)}</select></div>
                <TextField label="Service" value={unit.serviceName} disabled={disabled} onChange={(next) => replaceItem({ ...item, title: next || item.title, unitPrice: { ...unit, serviceName: next } })} />
                <TextField label="Finish / system" value={unit.variantName} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, variantName: next } })} />
                <TextField label="Quantity" value={unit.quantity} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, quantity: next } })} />
                <TextField label="Unit" value={unit.unitLabel} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, unitLabel: next } })} />
                <TextField label="Customer price per unit" value={unit.pricePerUnit} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, pricePerUnit: next, rateSource: "MANUAL" } })} />
                <TextField label="Final line-total override" value={unit.lineTotalOverride} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, lineTotalOverride: next } })} />
                <AreaField value={item.areaName} areas={areas} disabled={disabled} onChange={(areaName) => replaceItem({ ...item, areaName })} />
              </div>
              <details className="mt-3 rounded-md border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium">Optional internal cost estimate</summary>
                <p className="mt-2 text-xs text-slate-500">These costs help estimate profit and are never shown to the customer.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <TextField label="Estimated labor cost for this line (internal, optional)" value={unit.laborAllowance} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, laborAllowance: next } })} />
                  <TextField label="Estimated material cost for this line (internal, optional)" value={unit.materialAllowance} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, materialAllowance: next } })} />
                </div>
              </details>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm"><span>{numberValue(unit.quantity)} × {formatCurrency(numberValue(unit.pricePerUnit))} = <strong>{formatCurrency(calculated)}</strong>{unit.lineTotalOverride.trim() ? ` · Using ${formatCurrency(total)}` : ""}</span><button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => onChange(value.filter((current) => current.key !== item.key))}>Remove</button></div>
            </div>;
          })}
          {unitItems.length === 0 ? <p className="text-sm text-slate-500">Add cabinet doors using Milesi, Advance, or Gallery pricing.</p> : null}
        </div>
      </section>
      </> : null}

      {section === "advanced" && !productionRates.isLoading && (productionRates.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-slate-500">Production-rate calculator becomes available after rates are added in Settings.</p>
      ) : null}

      {section === "advanced" && (productionRates.data?.length ?? 0) > 0 ? <details className="card p-5">
        <summary className="cursor-pointer text-base font-semibold">8. Advanced Production Calculator</summary>
        <p className="mt-2 text-sm text-slate-500">Uses measured quantity and a saved production rate to estimate labor hours.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div><label className="label">Saved production rate</label><select className="input" value={productionItem?.production?.productionRateId ?? ""} disabled={disabled} onChange={(event) => {
            const rate = productionRates.data?.find((entry) => entry.id === Number(event.target.value));
            if (!rate) return;
            const item = productionItem ?? createProductionItem(value.length, defaultWorkDayHours, defaultLaborCostRate);
            replaceItem({ ...item, production: { ...item.production!, productionRateId: rate.id, workCategory: rate.category, surfaceType: rate.surfaceType, measurementUnit: rate.basis === "LINEAR_FT_PER_HOUR" ? "Linear feet" : rate.basis === "HOURS_PER_ITEM" ? "Items" : "Square feet", productionRateBasis: rate.basis, productionRateValue: String(Number(rate.rateValue)) } });
          }}><option value="">Select a production rate</option>{productionRates.data?.map((rate) => <option key={rate.id} value={rate.id}>{rate.category} · {rate.surfaceType} · {rate.basis}</option>)}</select></div>
          {productionItem ? <>
            <TextField label="Measurement" value={productionItem.production!.measurementValue} disabled={disabled} onChange={(next) => replaceItem({ ...productionItem, production: { ...productionItem.production!, measurementValue: next } })} />
            <TextField label="Production rate" value={productionItem.production!.productionRateValue} disabled={disabled} onChange={(next) => replaceItem({ ...productionItem, production: { ...productionItem.production!, productionRateValue: next } })} />
            <TextField label="Crew size" value={productionItem.production!.crewSize} disabled={disabled} onChange={(next) => replaceItem({ ...productionItem, production: { ...productionItem.production!, crewSize: next } })} />
            <TextField label="Hours per day" value={productionItem.production!.hoursPerDay} disabled={disabled} onChange={(next) => replaceItem({ ...productionItem, production: { ...productionItem.production!, hoursPerDay: next } })} />
            <TextField label="Hourly cost" value={productionItem.production!.hourlyCostPerWorker} disabled={disabled} onChange={(next) => replaceItem({ ...productionItem, production: { ...productionItem.production!, hourlyCostPerWorker: next } })} />
            <TextField label="Adjusted labor hours" value={productionItem.production!.adjustedLaborHours} disabled={disabled} onChange={(next) => replaceItem({ ...productionItem, production: { ...productionItem.production!, adjustedLaborHours: next } })} />
            <AreaField value={productionItem.areaName} areas={areas} disabled={disabled} onChange={(areaName) => replaceItem({ ...productionItem, areaName })} />
            <ProductionResult item={productionItem} />
          </> : <p className="text-sm text-slate-500 md:col-span-3">Choose a saved production rate to begin.</p>}
        </div>
      </details> : null}
    </div>
  );
}

function createUnitItem(sortOrder: number): PricingWorkItemDraft {
  return { key: nextKey("pricing-unit"), templateKey: "pricing", title: "Unit-price work", description: "", bulletItems: [], notes: "", sortOrder, ...emptyEstimateFields, estimateMethod: "UNIT_PRICE", laborLines: [], unitPrice: { templateId: null, serviceName: "", variantName: "", unitLabel: "", quantity: "", pricePerUnit: "", lineTotalOverride: "", laborAllowance: "", materialAllowance: "", note: "", rateSource: "MANUAL" } };
}

function createProductionItem(sortOrder: number, workDayHours: number, laborRate: number): PricingWorkItemDraft {
  return { key: "pricing-production", templateKey: "pricing", title: "Production estimate", description: "", bulletItems: [], notes: "", sortOrder, ...emptyEstimateFields, estimateMethod: "PRODUCTION_RATE", laborLines: [], production: { workCategory: "", surfaceType: "", measurementUnit: "Square feet", measurementValue: "", productionRateBasis: "SQFT_PER_HOUR", productionRateValue: "", calculatedLaborHours: "", adjustedLaborHours: "", crewSize: "", hoursPerDay: String(workDayHours), hourlyCostPerWorker: laborRate > 0 ? String(laborRate) : "", note: "", productionRateId: null } };
}

function ProductionResult({ item }: { item: PricingWorkItemDraft }) {
  const production = item.production!;
  const measurement = numberValue(production.measurementValue);
  const rate = numberValue(production.productionRateValue);
  const calculated = measurement > 0 && rate > 0 ? calculateProductionHours({ measurement, productionRate: rate, basis: production.productionRateBasis, fixedHours: production.productionRateBasis === "FIXED_HOURS" ? rate : undefined }) : 0;
  const hours = production.adjustedLaborHours.trim() ? numberValue(production.adjustedLaborHours) : calculated;
  return <div className="rounded-md bg-slate-50 p-3 text-sm md:col-span-4">Calculated hours: {calculated.toFixed(2)} · Using: {hours.toFixed(2)} hours · Labor cost: {formatCurrency(hours * numberValue(production.hourlyCostPerWorker))}</div>;
}

function AreaField({ value, areas, onChange, disabled }: { value: string; areas: string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <div><label className="label">Room or project area (optional)</label><select className="input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select><p className="mt-1 text-xs text-slate-500">Use this to group pricing by room or part of the project. Leave Unassigned for whole-project costs.</p></div>;
}

function TextField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div><label className="label">{label}</label><input className="input" type="text" inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}