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
  return {
    key,
    label: "Crew labor",
    mode: "HOURS",
    workers: "",
    hoursPerWorker: "",
    days: "",
    hoursPerDay: String(defaultWorkDayHours),
    hourlyCost: defaultLaborCostRate > 0 ? String(defaultLaborCostRate) : "",
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

  const materialSubtotal = laborMaterials.materials.reduce((total, material) => {
    return total + (material.type === "MANUAL_TOTAL"
      ? numberValue(material.manualTotal)
      : numberValue(material.quantity) * numberValue(material.unitCost));
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
                      <TextField label="Cost per hour" value={line.hourlyCost} disabled={disabled} onChange={(next) => updateLabor(line.key, { hourlyCost: next })} />
                      <TextField label="Override labor total (optional)" value={line.manualTotalOverride} disabled={disabled} onChange={(next) => updateLabor(line.key, { manualTotalOverride: next })} />
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
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">2. Materials</h2><strong>{formatCurrency(materialSubtotal)}</strong></div>
        <MaterialsEditor
          disabled={disabled}
          inventory={inventory.data ?? []}
          materials={laborMaterials.materials}
          makeMaterialKey={makeMaterialKey}
          measurementValue=""
          addMaterial={(type = "CUSTOM") => replaceItem({ ...laborMaterials, materials: [...laborMaterials.materials, {
            key: makeMaterialKey(), inventoryItemId: null, type, name: "", unit: "unit", quantity: "", unitCost: "", manualTotal: "", coveragePerUnit: "", wastePercent: "0", adjustedQuantity: "", note: "", priceSourceType: null, priceSourceLabel: "", priceSourceExpenseId: null, priceSourceExpenseLineItemId: null,
          }] })}
          updateMaterial={(key, patch) => replaceItem({ ...laborMaterials, materials: laborMaterials.materials.map((item) => item.key === key ? { ...item, ...patch } : item) })}
          removeMaterial={(key) => replaceItem({ ...laborMaterials, materials: laborMaterials.materials.filter((item) => item.key !== key) })}
        />
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">3. Unit-Price Work</h2><p className="text-sm text-slate-500">Customer selling prices for repeatable services.</p></div><button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => onChange([...value, createUnitItem(value.length)])}>Add unit-price line</button></div>
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
                <TextField label="Internal labor allowance" value={unit.laborAllowance} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, laborAllowance: next } })} />
                <TextField label="Internal material allowance" value={unit.materialAllowance} disabled={disabled} onChange={(next) => replaceItem({ ...item, unitPrice: { ...unit, materialAllowance: next } })} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm"><span>{numberValue(unit.quantity)} × {formatCurrency(numberValue(unit.pricePerUnit))} = <strong>{formatCurrency(calculated)}</strong>{unit.lineTotalOverride.trim() ? ` · Using ${formatCurrency(total)}` : ""}</span><button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => onChange(value.filter((current) => current.key !== item.key))}>Remove</button></div>
            </div>;
          })}
          {unitItems.length === 0 ? <p className="text-sm text-slate-500">Add a line or choose a cabinet pricing template.</p> : null}
        </div>
      </section>
      </> : null}

      {section === "advanced" ? <details className="card p-5">
        <summary className="cursor-pointer text-base font-semibold">8. Advanced Production Calculator</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div><label className="label">Saved production rate</label><select className="input" value={productionItem?.production?.productionRateId ?? ""} disabled={disabled} onChange={(event) => {
            const rate = productionRates.data?.find((entry) => entry.id === Number(event.target.value));
            if (!rate) return;
            const item = productionItem ?? createProductionItem(value.length, defaultWorkDayHours, defaultLaborCostRate);
            replaceItem({ ...item, production: { ...item.production!, productionRateId: rate.id, workCategory: rate.category, surfaceType: rate.surfaceType, measurementUnit: rate.basis === "LINEAR_FT_PER_HOUR" ? "Linear feet" : rate.basis === "HOURS_PER_ITEM" ? "Items" : "Square feet", productionRateBasis: rate.basis, productionRateValue: String(Number(rate.rateValue)) } });
          }}><option value="">Select rate</option>{productionRates.data?.map((rate) => <option key={rate.id} value={rate.id}>{rate.category} · {rate.surfaceType} · {rate.basis}</option>)}</select></div>
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
  return <div><label className="label">Area (optional)</label><select className="input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Unassigned</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select></div>;
}

function TextField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div><label className="label">{label}</label><input className="input" type="text" inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}