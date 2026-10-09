"use client";

import { useMemo } from "react";
import { api } from "@/trpc/react";
import { calculateProductionHours } from "@/lib/proposal-pricing";
import { formatCurrency } from "@/lib/utils";

export type LaborLineDraft = {
  key: string;
  label: string;
  mode: "HOURS" | "DAYS";
  workers: string;
  hoursPerWorker: string;
  days: string;
  hoursPerDay: string;
  hourlyCost: string;
  manualTotalOverride: string;
  internalNote: string;
};

export type SectionMaterialDraft = {
  key: string;
  inventoryItemId: number | null;
  type: "CATALOG" | "CUSTOM" | "MANUAL_TOTAL";
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
  manualTotal: string;
  coveragePerUnit: string;
  wastePercent: string;
  adjustedQuantity: string;
  note: string;
  priceSourceType: "INVENTORY_DEFAULT" | "EXPENSE_HISTORY" | "MANUAL" | null;
  priceSourceLabel: string;
  priceSourceExpenseId: number | null;
  priceSourceExpenseLineItemId: number | null;
};

export type SectionEstimateDraft = {
  areaName: string;
  phaseName: string;
  workCategoryLabel: string;
  customerTitle: string;
  estimateMethod: "LABOR_AND_MATERIALS" | "UNIT_PRICE" | "MANUAL_TOTAL" | "PRODUCTION_RATE" | "";
  priceVisibilityMode: "ITEMIZED" | "GROUPED" | "HIDDEN";
  clientNotes: string;
  internalNotes: string;
  laborLines: LaborLineDraft[];
  materials: SectionMaterialDraft[];
  unitPrice: {
    templateId: number | null;
    serviceName: string;
    variantName: string;
    unitLabel: string;
    quantity: string;
    pricePerUnit: string;
    lineTotalOverride: string;
    laborAllowance: string;
    materialAllowance: string;
    note: string;
    rateSource: "SEEDED" | "MANUAL" | "HISTORICAL";
  } | null;
  manualTotal: {
    customerTotal: string;
    internalCost: string;
    note: string;
  } | null;
  production: {
    workCategory: string;
    surfaceType: string;
    measurementUnit: string;
    measurementValue: string;
    productionRateBasis: "SQFT_PER_HOUR" | "LINEAR_FT_PER_HOUR" | "HOURS_PER_ITEM" | "FIXED_HOURS";
    productionRateValue: string;
    calculatedLaborHours: string;
    adjustedLaborHours: string;
    crewSize: string;
    hoursPerDay: string;
    hourlyCostPerWorker: string;
    note: string;
    productionRateId: number | null;
  } | null;
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeLaborPreview(line: LaborLineDraft, defaultWorkDayHours: number) {
  const workers = toNumber(line.workers);
  const hourlyCost = toNumber(line.hourlyCost);
  if (line.mode === "DAYS") {
    const days = toNumber(line.days);
    const hoursPerDay = toNumber(line.hoursPerDay);
    const calculated = workers * days * hoursPerDay * hourlyCost;
    return {
      totalWorkerHours: workers * days * hoursPerDay,
      calendarDays: days,
      calculated,
      used: line.manualTotalOverride.trim() ? toNumber(line.manualTotalOverride) : calculated,
    };
  }

  const hoursPerWorker = toNumber(line.hoursPerWorker);
  const calculated = workers * hoursPerWorker * hourlyCost;
  return {
    totalWorkerHours: workers * hoursPerWorker,
    calendarDays: defaultWorkDayHours > 0 ? hoursPerWorker / defaultWorkDayHours : 0,
    calculated,
    used: line.manualTotalOverride.trim() ? toNumber(line.manualTotalOverride) : calculated,
  };
}

function computeMaterialPreview(line: SectionMaterialDraft, measurementValue: string) {
  if (line.type === "MANUAL_TOTAL") {
    return {
      quantity: 1,
      total: toNumber(line.manualTotal),
      calculatedQuantity: null as number | null,
    };
  }

  const measuredQuantity =
    toNumber(line.coveragePerUnit) > 0 && toNumber(measurementValue) > 0
      ? (toNumber(measurementValue) / toNumber(line.coveragePerUnit)) * (1 + toNumber(line.wastePercent) / 100)
      : null;
  const quantity = line.adjustedQuantity.trim()
    ? toNumber(line.adjustedQuantity)
    : measuredQuantity ?? toNumber(line.quantity);
  return {
    quantity,
    total: quantity * toNumber(line.unitCost),
    calculatedQuantity: measuredQuantity == null ? null : Number(measuredQuantity.toFixed(2)),
  };
}

export function SectionMaterialsAndLabor({
  value,
  onChange,
  disabled,
  makeMaterialKey,
  makeLaborKey,
}: {
  value: SectionEstimateDraft;
  onChange: (next: SectionEstimateDraft) => void;
  disabled?: boolean;
  makeMaterialKey: () => string;
  makeLaborKey: () => string;
}) {
  const inventory = api.inventory.list.useQuery();
  const templates = api.estimatingTemplates.list.useQuery({ activeOnly: true });
  const productionRates = api.productionRates.list.useQuery();
  const config = api.config.get.useQuery();
  const availableTemplates = templates.data ?? [];

  const defaultWorkDayHours = Number(config.data?.defaultWorkDayHours ?? 8);
  const defaultLaborCostRate = config.data?.defaultLaborCostRate == null ? 0 : Number(config.data.defaultLaborCostRate);

  const laborPreview = useMemo(
    () =>
      value.laborLines.reduce(
        (acc, line) => {
          const preview = computeLaborPreview(line, defaultWorkDayHours);
          return {
            totalWorkerHours: acc.totalWorkerHours + preview.totalWorkerHours,
            calendarDays: acc.calendarDays + preview.calendarDays,
            directLaborCost: acc.directLaborCost + preview.used,
          };
        },
        { totalWorkerHours: 0, calendarDays: 0, directLaborCost: 0 }
      ),
    [value.laborLines, defaultWorkDayHours]
  );

  const materialPreview = useMemo(
    () =>
      value.materials.reduce(
        (total, line) => total + computeMaterialPreview(line, value.production?.measurementValue ?? "").total,
        0
      ),
    [value.materials, value.production?.measurementValue]
  );

  const productionPreview = useMemo(() => {
    if (!value.production) return null;
    const measurement = toNumber(value.production.measurementValue);
    const rate = toNumber(value.production.productionRateValue);
    if (!(measurement > 0) || !(rate > 0)) return null;
    const calculated = calculateProductionHours({
      measurement,
      productionRate: rate,
      basis: value.production.productionRateBasis,
      fixedHours: value.production.productionRateBasis === "FIXED_HOURS" ? rate : undefined,
    });
    const effective = value.production.adjustedLaborHours.trim() ? toNumber(value.production.adjustedLaborHours) : calculated;
    const crewSize = Math.max(0, toNumber(value.production.crewSize));
    const hoursPerDay = toNumber(value.production.hoursPerDay) || defaultWorkDayHours;
    return {
      calculated,
      effective,
      directLaborCost: effective * (toNumber(value.production.hourlyCostPerWorker) || defaultLaborCostRate),
      calendarDays: crewSize > 0 && hoursPerDay > 0 ? effective / (crewSize * hoursPerDay) : 0,
    };
  }, [value.production, defaultLaborCostRate, defaultWorkDayHours]);

  const sectionPrice =
    value.estimateMethod === "UNIT_PRICE" && value.unitPrice
      ? (value.unitPrice.lineTotalOverride.trim() ? toNumber(value.unitPrice.lineTotalOverride) : toNumber(value.unitPrice.quantity) * toNumber(value.unitPrice.pricePerUnit))
      : value.estimateMethod === "MANUAL_TOTAL" && value.manualTotal
        ? toNumber(value.manualTotal.customerTotal)
        : value.estimateMethod === "PRODUCTION_RATE"
          ? (productionPreview?.directLaborCost ?? 0) + materialPreview
          : laborPreview.directLaborCost + materialPreview;

  const updateMaterial = (key: string, patch: Partial<SectionMaterialDraft>) => {
    onChange({ ...value, materials: value.materials.map((material) => (material.key === key ? { ...material, ...patch } : material)) });
  };

  const addMaterial = (type: SectionMaterialDraft["type"] = "CUSTOM") => {
    onChange({
      ...value,
      materials: [
        ...value.materials,
        {
          key: makeMaterialKey(),
          inventoryItemId: null,
          type,
          name: "",
          unit: "unit",
          quantity: "",
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
    });
  };

  const addLaborLine = () => {
    onChange({
      ...value,
      laborLines: [
        ...value.laborLines,
        {
          key: makeLaborKey(),
          label: value.phaseName || "Labor",
          mode: "HOURS",
          workers: "1",
          hoursPerWorker: "",
          days: "",
          hoursPerDay: String(defaultWorkDayHours),
          hourlyCost: defaultLaborCostRate > 0 ? String(defaultLaborCostRate) : "",
          manualTotalOverride: "",
          internalNote: "",
        },
      ],
    });
  };

  return (
    <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Estimate Setup</h3>
          <p className="text-xs text-slate-500">Pick the simplest method for this scope item. Production inputs stay optional.</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-slate-500">Current line estimate</div>
          <div className="font-semibold">{formatCurrency(sectionPrice)}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label">Estimate method</label>
          <select className="input" value={value.estimateMethod} disabled={disabled} onChange={(e) => onChange({ ...value, estimateMethod: e.target.value as SectionEstimateDraft["estimateMethod"] })}>
            <option value="">No pricing on this scope item</option>
            <option value="LABOR_AND_MATERIALS">Labor & materials</option>
            <option value="UNIT_PRICE">Unit-price work</option>
            <option value="MANUAL_TOTAL">Manual total</option>
            <option value="PRODUCTION_RATE">Advanced production rate</option>
          </select>
        </div>
        <div>
          <label className="label">Room or project area (optional)</label>
          <input className="input" value={value.areaName} disabled={disabled} onChange={(e) => onChange({ ...value, areaName: e.target.value })} placeholder="Kitchen cabinets" />
          <p className="mt-1 text-xs text-slate-500">Use this to group pricing by room or part of the project. Leave unassigned for whole-project costs.</p>
        </div>
        <div>
          <label className="label">Phase / category</label>
          <input className="input" value={value.phaseName} disabled={disabled} onChange={(e) => onChange({ ...value, phaseName: e.target.value })} placeholder="Preparation" />
        </div>
        <div>
          <label className="label">Optional work category</label>
          <input className="input" value={value.workCategoryLabel} disabled={disabled} onChange={(e) => onChange({ ...value, workCategoryLabel: e.target.value })} placeholder="Optional upgrades" />
        </div>
        <div>
          <label className="label">Customer-facing title</label>
          <input className="input" value={value.customerTitle} disabled={disabled} onChange={(e) => onChange({ ...value, customerTitle: e.target.value })} placeholder="Kitchen cabinets" />
        </div>
        <div>
          <label className="label">Price visibility</label>
          <select className="input" value={value.priceVisibilityMode} disabled={disabled} onChange={(e) => onChange({ ...value, priceVisibilityMode: e.target.value as SectionEstimateDraft["priceVisibilityMode"] })}>
            <option value="ITEMIZED">Show separately</option>
            <option value="GROUPED">Group into area total</option>
            <option value="HIDDEN">Hide on proposal</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Client note</label>
          <textarea className="input min-h-24" value={value.clientNotes} disabled={disabled} onChange={(e) => onChange({ ...value, clientNotes: e.target.value })} />
        </div>
        <div>
          <label className="label">Internal note</label>
          <textarea className="input min-h-24" value={value.internalNotes} disabled={disabled} onChange={(e) => onChange({ ...value, internalNotes: e.target.value })} />
        </div>
      </div>

      {value.estimateMethod === "LABOR_AND_MATERIALS" ? (
        <>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="font-medium">Labor & Schedule</h4>
                <p className="text-xs text-slate-500">Use hours or days. Manual overrides preserve the calculated value.</p>
              </div>
              <button type="button" className="btn btn-secondary" disabled={disabled} onClick={addLaborLine}>Add Labor Line</button>
            </div>
            <div className="space-y-3">
              {value.laborLines.map((line) => {
                const preview = computeLaborPreview(line, defaultWorkDayHours);
                return (
                  <div key={line.key} className="rounded-md border border-slate-200 p-3">
                    <div className="grid gap-3 md:grid-cols-4">
                      <Field label="Label" value={line.label} disabled={disabled} onChange={(next) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, label: next } : current) })} />
                      <div>
                        <label className="label">Mode</label>
                        <select className="input" value={line.mode} disabled={disabled} onChange={(e) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, mode: e.target.value as LaborLineDraft["mode"] } : current) })}>
                          <option value="HOURS">Hourly</option>
                          <option value="DAYS">Daily</option>
                        </select>
                      </div>
                      <Field label="Workers" value={line.workers} disabled={disabled} onChange={(next) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, workers: next } : current) })} />
                      <Field label="Hourly cost" value={line.hourlyCost} disabled={disabled} onChange={(next) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, hourlyCost: next } : current) })} />
                      {line.mode === "HOURS" ? (
                        <Field label="Hours per worker" value={line.hoursPerWorker} disabled={disabled} onChange={(next) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, hoursPerWorker: next } : current) })} />
                      ) : (
                        <Field label="Days" value={line.days} disabled={disabled} onChange={(next) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, days: next } : current) })} />
                      )}
                      {line.mode === "DAYS" ? (
                        <Field label="Hours per day" value={line.hoursPerDay} disabled={disabled} onChange={(next) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, hoursPerDay: next } : current) })} />
                      ) : (
                        <Field label="Est. days" value={preview.calendarDays.toFixed(2)} disabled onChange={() => undefined} />
                      )}
                      <Field label="Manual labor total" value={line.manualTotalOverride} disabled={disabled} onChange={(next) => onChange({ ...value, laborLines: value.laborLines.map((current) => current.key === line.key ? { ...current, manualTotalOverride: next } : current) })} />
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-4 text-sm text-slate-600">
                      <div>Total worker-hours: {preview.totalWorkerHours.toFixed(2)}</div>
                      <div>Calendar days: {preview.calendarDays.toFixed(2)}</div>
                      <div>Calculated labor: {formatCurrency(preview.calculated)}</div>
                      <div>Using: {formatCurrency(preview.used)}</div>
                    </div>
                  </div>
                );
              })}
              {value.laborLines.length === 0 ? <div className="text-sm text-slate-500">No labor lines yet.</div> : null}
            </div>
          </div>

          <MaterialsEditor
            disabled={disabled}
            inventory={inventory.data ?? []}
            materials={value.materials}
            makeMaterialKey={makeMaterialKey}
            measurementValue={value.production?.measurementValue ?? ""}
            addMaterial={addMaterial}
            updateMaterial={updateMaterial}
            removeMaterial={(key) => onChange({ ...value, materials: value.materials.filter((material) => material.key !== key) })}
          />
        </>
      ) : null}

      {value.estimateMethod === "UNIT_PRICE" ? (
        <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <h4 className="font-medium">Cabinet &amp; Unit Pricing</h4>
            <p className="text-xs text-slate-500">Price repeatable work by quantity. Current templates are for cabinet refinishing; more services can be added later.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Template</label>
              <select
                className="input"
                value={value.unitPrice?.templateId ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  const template = availableTemplates.find((entry) => entry.id === Number(e.target.value));
                  if (!template) return;
                  onChange({
                    ...value,
                    unitPrice: {
                      templateId: template.id,
                      serviceName: template.serviceName,
                      variantName: template.variantName,
                      unitLabel: template.unitLabel,
                      quantity: value.unitPrice?.quantity ?? "",
                      pricePerUnit: String(Number(template.defaultPricePerUnit)),
                      lineTotalOverride: value.unitPrice?.lineTotalOverride ?? "",
                      laborAllowance: template.defaultLaborAllowance == null ? "" : String(Number(template.defaultLaborAllowance)),
                      materialAllowance: template.defaultMaterialAllowance == null ? "" : String(Number(template.defaultMaterialAllowance)),
                      note: template.notes ?? "",
                      rateSource: template.rateSource,
                    },
                  });
                }}
              >
                <option value="">Select a template</option>
                {availableTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.serviceName} · {template.variantName} · {template.unitLabel} · {formatCurrency(Number(template.defaultPricePerUnit))}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Service" value={value.unitPrice?.serviceName ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), serviceName: next } })} />
            <Field label="Variant / finish" value={value.unitPrice?.variantName ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), variantName: next } })} />
            <Field label="Unit label" value={value.unitPrice?.unitLabel ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), unitLabel: next } })} />
            <Field label="Quantity" value={value.unitPrice?.quantity ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), quantity: next } })} />
            <Field label="Price per unit" value={value.unitPrice?.pricePerUnit ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), pricePerUnit: next, rateSource: "MANUAL" } })} />
            <Field label="Final line total override" value={value.unitPrice?.lineTotalOverride ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), lineTotalOverride: next } })} />
          </div>
          <details className="rounded-md border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Optional internal cost estimate</summary>
            <p className="mt-2 text-xs text-slate-500">These costs help estimate profit and are never shown to the customer.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label="Estimated labor cost for this line (internal, optional)" value={value.unitPrice?.laborAllowance ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), laborAllowance: next } })} />
              <Field label="Estimated material cost for this line (internal, optional)" value={value.unitPrice?.materialAllowance ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, unitPrice: { ...(value.unitPrice ?? emptyUnitPrice()), materialAllowance: next } })} />
            </div>
          </details>
          <div className="grid gap-2 md:grid-cols-3 text-sm text-slate-600">
            <div>Customer price per unit: {formatCurrency(toNumber(value.unitPrice?.pricePerUnit ?? ""))}</div>
            <div>Calculated total: {formatCurrency(toNumber(value.unitPrice?.quantity ?? "") * toNumber(value.unitPrice?.pricePerUnit ?? ""))}</div>
            <div>Current line estimate: {formatCurrency(sectionPrice)}</div>
          </div>
        </div>
      ) : null}

      {value.estimateMethod === "MANUAL_TOTAL" ? (
        <div className="rounded-md border border-slate-200 bg-white p-4 grid gap-3 md:grid-cols-3">
          <Field label="Customer total" value={value.manualTotal?.customerTotal ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, manualTotal: { ...(value.manualTotal ?? { customerTotal: "", internalCost: "", note: "" }), customerTotal: next } })} />
          <Field label="Internal cost" value={value.manualTotal?.internalCost ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, manualTotal: { ...(value.manualTotal ?? { customerTotal: "", internalCost: "", note: "" }), internalCost: next } })} />
          <Field label="Note" value={value.manualTotal?.note ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, manualTotal: { ...(value.manualTotal ?? { customerTotal: "", internalCost: "", note: "" }), note: next } })} />
        </div>
      ) : null}

      {!productionRates.isLoading && (productionRates.data?.length ?? 0) === 0 ? (
        <div className="text-sm text-slate-500">Production-rate calculator becomes available after rates are added in Settings.</div>
      ) : null}

      {(productionRates.data?.length ?? 0) > 0 ? <details className="rounded-md border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-medium">Advanced Production Calculator</summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-500">Uses measured quantity and a saved production rate to estimate labor hours.</p>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="label">Saved rate</label>
              <select
                className="input"
                value={value.production?.productionRateId ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  const selected = productionRates.data?.find((rate) => rate.id === Number(e.target.value));
                  if (!selected) return;
                  onChange({
                    ...value,
                    estimateMethod: "PRODUCTION_RATE",
                    production: {
                      productionRateId: selected.id,
                      workCategory: selected.category,
                      surfaceType: selected.surfaceType,
                      measurementUnit: selected.basis === "LINEAR_FT_PER_HOUR" ? "Linear feet" : selected.basis === "HOURS_PER_ITEM" ? "Item count" : selected.basis === "FIXED_HOURS" ? "Fixed hours" : "Square feet",
                      measurementValue: value.production?.measurementValue ?? "",
                      productionRateBasis: selected.basis,
                      productionRateValue: String(Number(selected.rateValue)),
                      calculatedLaborHours: value.production?.calculatedLaborHours ?? "",
                      adjustedLaborHours: value.production?.adjustedLaborHours ?? "",
                      crewSize: value.production?.crewSize ?? "",
                      hoursPerDay: value.production?.hoursPerDay ?? String(defaultWorkDayHours),
                      hourlyCostPerWorker: value.production?.hourlyCostPerWorker ?? (defaultLaborCostRate > 0 ? String(defaultLaborCostRate) : ""),
                      note: value.production?.note ?? "",
                    },
                  });
                }}
              >
                <option value="">Select a production rate</option>
                {productionRates.data?.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.category} · {rate.surfaceType} · {rate.basis} · {Number(rate.rateValue)}
                  </option>
                ))}
              </select>
            </div>
            <Field label="Measurement" value={value.production?.measurementValue ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, estimateMethod: "PRODUCTION_RATE", production: { ...(value.production ?? emptyProduction(defaultWorkDayHours, defaultLaborCostRate)), measurementValue: next } })} />
            <Field label="Rate value" value={value.production?.productionRateValue ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, estimateMethod: "PRODUCTION_RATE", production: { ...(value.production ?? emptyProduction(defaultWorkDayHours, defaultLaborCostRate)), productionRateValue: next } })} />
            <Field label="Crew size" value={value.production?.crewSize ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, estimateMethod: "PRODUCTION_RATE", production: { ...(value.production ?? emptyProduction(defaultWorkDayHours, defaultLaborCostRate)), crewSize: next } })} />
            <Field label="Hours/day" value={value.production?.hoursPerDay ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, estimateMethod: "PRODUCTION_RATE", production: { ...(value.production ?? emptyProduction(defaultWorkDayHours, defaultLaborCostRate)), hoursPerDay: next } })} />
            <Field label="Hourly cost" value={value.production?.hourlyCostPerWorker ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, estimateMethod: "PRODUCTION_RATE", production: { ...(value.production ?? emptyProduction(defaultWorkDayHours, defaultLaborCostRate)), hourlyCostPerWorker: next } })} />
            <Field label="Adjusted labor hours" value={value.production?.adjustedLaborHours ?? ""} disabled={disabled} onChange={(next) => onChange({ ...value, estimateMethod: "PRODUCTION_RATE", production: { ...(value.production ?? emptyProduction(defaultWorkDayHours, defaultLaborCostRate)), adjustedLaborHours: next } })} />
          </div>
          {productionPreview ? (
            <div className="grid gap-2 md:grid-cols-4 text-sm text-slate-600">
              <div>Calculated labor hours: {productionPreview.calculated.toFixed(2)}</div>
              <div>Using labor hours: {productionPreview.effective.toFixed(2)}</div>
              <div>Calendar days: {productionPreview.calendarDays.toFixed(2)}</div>
              <div>Direct labor cost: {formatCurrency(productionPreview.directLaborCost)}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">Enter a measurement and rate to calculate production labor.</div>
          )}

          <MaterialsEditor
            disabled={disabled}
            inventory={inventory.data ?? []}
            materials={value.materials}
            makeMaterialKey={makeMaterialKey}
            measurementValue={value.production?.measurementValue ?? ""}
            addMaterial={addMaterial}
            updateMaterial={updateMaterial}
            removeMaterial={(key) => onChange({ ...value, materials: value.materials.filter((material) => material.key !== key) })}
          />
        </div>
      </details> : null}
    </div>
  );
}

export function MaterialsEditor({
  disabled,
  inventory,
  materials,
  measurementValue,
  makeMaterialKey,
  addMaterial,
  updateMaterial,
  removeMaterial,
}: {
  disabled?: boolean;
  inventory: Array<{ id: number; name: string; unit: string; costPerUnit: unknown; coveragePerUnit: unknown; defaultWastePercent: unknown }>;
  materials: SectionMaterialDraft[];
  measurementValue: string;
  makeMaterialKey: () => string;
  addMaterial: (type?: SectionMaterialDraft["type"]) => void;
  updateMaterial: (key: string, patch: Partial<SectionMaterialDraft>) => void;
  removeMaterial: (key: string) => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="font-medium">Materials</h4>
          <p className="text-xs text-slate-500">Start with a description and amount. Reviewed receipt prices can eventually provide catalog pricing; receipt review does not currently create or update inventory items.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => addMaterial("CUSTOM")}>Add Material</button>
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => addMaterial("MANUAL_TOTAL")}>Add Manual Total</button>
        </div>
      </div>
      <div className="space-y-3">
        {materials.map((material) => {
          const preview = computeMaterialPreview(material, measurementValue);
          return (
            <div key={material.key} className="rounded-md border border-slate-200 p-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="label">Catalog item</label>
                  <select
                    className="input"
                    disabled={disabled}
                    value={material.inventoryItemId ?? ""}
                    onChange={(e) => {
                      const item = inventory.find((entry) => entry.id === Number(e.target.value));
                      if (!item) return;
                      updateMaterial(material.key, {
                        inventoryItemId: item.id,
                        type: "CATALOG",
                        name: item.name,
                        unit: item.unit,
                        unitCost: String(Number(item.costPerUnit)),
                        coveragePerUnit: item.coveragePerUnit == null ? "" : String(Number(item.coveragePerUnit)),
                        wastePercent: String(Number(item.defaultWastePercent ?? 0)),
                        priceSourceType: "INVENTORY_DEFAULT",
                        priceSourceLabel: "Latest catalog price",
                        priceSourceExpenseId: null,
                        priceSourceExpenseLineItemId: null,
                      });
                    }}
                  >
                    <option value="">Custom / none</option>
                    {inventory.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {formatCurrency(Number(item.costPerUnit))}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label="Name" value={material.name} disabled={disabled} onChange={(next) => updateMaterial(material.key, { name: next })} />
                <Field label="Unit" value={material.unit} disabled={disabled} onChange={(next) => updateMaterial(material.key, { unit: next })} />
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={material.type} disabled={disabled} onChange={(e) => updateMaterial(material.key, { type: e.target.value as SectionMaterialDraft["type"] })}>
                    <option value="CATALOG">Catalog item</option>
                    <option value="CUSTOM">Custom material</option>
                    <option value="MANUAL_TOTAL">Manual material total</option>
                  </select>
                </div>
                {material.type === "MANUAL_TOTAL" ? (
                  <Field label="Manual total" value={material.manualTotal} disabled={disabled} onChange={(next) => updateMaterial(material.key, { manualTotal: next, priceSourceType: "MANUAL", priceSourceLabel: "Manual material total" })} />
                ) : (
                  <>
                    <Field label="Quantity" value={material.quantity} disabled={disabled} onChange={(next) => updateMaterial(material.key, { quantity: next })} />
                    <Field label="Unit cost" value={material.unitCost} disabled={disabled} onChange={(next) => updateMaterial(material.key, { unitCost: next, priceSourceType: "MANUAL", priceSourceLabel: "Manual unit cost override" })} />
                    <Field label="Coverage / unit" value={material.coveragePerUnit} disabled={disabled} onChange={(next) => updateMaterial(material.key, { coveragePerUnit: next })} />
                    <Field label="Waste %" value={material.wastePercent} disabled={disabled} onChange={(next) => updateMaterial(material.key, { wastePercent: next })} />
                    <Field label="Adjusted qty" value={material.adjustedQuantity} disabled={disabled} onChange={(next) => updateMaterial(material.key, { adjustedQuantity: next })} />
                  </>
                )}
                <Field label="Notes" value={material.note} disabled={disabled} onChange={(next) => updateMaterial(material.key, { note: next })} />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3 text-sm text-slate-600">
                <div>Effective quantity: {preview.quantity.toFixed(2)}</div>
                <div>Line total: {formatCurrency(preview.total)}</div>
                <div>{material.priceSourceLabel || "Price source not selected"}</div>
              </div>
              {material.inventoryItemId ? (
                <MaterialPriceHistory
                  inventoryItemId={material.inventoryItemId}
                  onUseHistory={(history) => updateMaterial(material.key, {
                    unitCost: history.unitPrice == null ? material.unitCost : String(history.unitPrice),
                    priceSourceType: "EXPENSE_HISTORY",
                    priceSourceLabel: `${history.vendor || "Expense"} · ${history.description}`,
                    priceSourceExpenseId: history.expenseId,
                    priceSourceExpenseLineItemId: history.expenseLineItemId,
                  })}
                />
              ) : null}
              <div className="mt-3 flex justify-end">
                <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => removeMaterial(material.key)}>Remove</button>
              </div>
            </div>
          );
        })}
        {materials.length === 0 ? <div className="text-sm text-slate-500">No material lines yet.</div> : null}
      </div>
    </div>
  );
}

function MaterialPriceHistory({
  inventoryItemId,
  onUseHistory,
}: {
  inventoryItemId: number;
  onUseHistory: (history: { expenseId: number; expenseLineItemId: number; unitPrice: number | null; vendor: string | null; description: string }) => void;
}) {
  const history = api.inventory.priceHistory.useQuery({ inventoryItemId });
  if (!history.data) return null;

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Receipt / expense history</div>
      <div className="mt-1 text-sm text-slate-600">Latest known catalog price: {formatCurrency(history.data.latestKnownPrice)}</div>
      <div className="mt-2 space-y-2">
        {history.data.history.length === 0 ? (
          <div className="text-sm text-slate-500">No matching receipt history found yet.</div>
        ) : (
          history.data.history.map((item) => (
            <button key={item.expenseLineItemId} type="button" className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-left text-sm" onClick={() => onUseHistory(item)}>
              <div className="font-medium">{item.vendor || "Expense"} · {item.description}</div>
              <div className="text-slate-500">{item.unitPrice == null ? "Unit price unavailable" : formatCurrency(item.unitPrice)}{item.receiptNumber ? ` · Receipt ${item.receiptNumber}` : ""}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function emptyUnitPrice(): NonNullable<SectionEstimateDraft["unitPrice"]> {
  return {
    templateId: null,
    serviceName: "",
    variantName: "",
    unitLabel: "",
    quantity: "",
    pricePerUnit: "",
    lineTotalOverride: "",
    laborAllowance: "",
    materialAllowance: "",
    note: "",
    rateSource: "MANUAL",
  };
}

function emptyProduction(defaultWorkDayHours: number, defaultLaborCostRate: number): NonNullable<SectionEstimateDraft["production"]> {
  return {
    workCategory: "",
    surfaceType: "",
    measurementUnit: "Square feet",
    measurementValue: "",
    productionRateBasis: "SQFT_PER_HOUR",
    productionRateValue: "",
    calculatedLaborHours: "",
    adjustedLaborHours: "",
    crewSize: "",
    hoursPerDay: String(defaultWorkDayHours),
    hourlyCostPerWorker: defaultLaborCostRate > 0 ? String(defaultLaborCostRate) : "",
    note: "",
    productionRateId: null,
  };
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
