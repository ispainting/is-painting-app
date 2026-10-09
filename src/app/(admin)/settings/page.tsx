"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

type ProposalPricingMethod = "GROSS_MARGIN" | "MARKUP";
type GeneralLiabilityMode = "PERCENT_OF_LABOR" | "PERCENT_OF_REVENUE" | "FLAT_AMOUNT" | "EXCLUDED";
type UnitPriceRateSource = "SEEDED" | "MANUAL" | "HISTORICAL";

type SettingsFormState = {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  googleReviewUrl: string;
  defaultWcPercent: number;
  defaultGlPercent: number;
  defaultOverhead: number;
  defaultMarkup: number;
  defaultTaxPercent: number;
  defaultLaborSellRate: string;
  defaultLaborCostRate: string;
  defaultProposalPricingMethod: ProposalPricingMethod;
  defaultDesiredProfitMarginPercent: number;
  defaultGeneralLiabilityMode: GeneralLiabilityMode;
  defaultMassTaxRate: number;
  defaultFederalTaxRate: number;
  defaultWorkDayHours: number;
};

type TemplateRecord = {
  id: number;
  serviceName: string;
  variantName: string;
  unitLabel: string;
  defaultPricePerUnit: number;
  defaultLaborAllowance: number | null;
  defaultMaterialAllowance: number | null;
  notes: string | null;
  isActive: boolean;
  effectiveDate: string;
  rateSource: UnitPriceRateSource;
  comparableJobsCount: number;
  latestComparableCompletedAt: string | null;
};

type TemplateDraft = {
  serviceName: string;
  variantName: string;
  unitLabel: string;
  defaultPricePerUnit: string;
  defaultLaborAllowance: string;
  defaultMaterialAllowance: string;
  notes: string;
  isActive: boolean;
  effectiveDate: string;
  rateSource: UnitPriceRateSource;
};

const emptyTemplateDraft = (): TemplateDraft => ({
  serviceName: "",
  variantName: "",
  unitLabel: "Door",
  defaultPricePerUnit: "",
  defaultLaborAllowance: "",
  defaultMaterialAllowance: "",
  notes: "",
  isActive: true,
  effectiveDate: new Date().toISOString().slice(0, 10),
  rateSource: "MANUAL",
});

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNullableNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function formatDateInput(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const stringValue = readString(value);
  return stringValue ? stringValue.slice(0, 10) : "";
}

function normalizeTemplateRecord(value: unknown): TemplateRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = readNumber(record.id, 0);
  if (id <= 0) return null;

  return {
    id,
    serviceName: readString(record.serviceName),
    variantName: readString(record.variantName),
    unitLabel: readString(record.unitLabel),
    defaultPricePerUnit: readNumber(record.defaultPricePerUnit, 0),
    defaultLaborAllowance: readNullableNumber(record.defaultLaborAllowance),
    defaultMaterialAllowance: readNullableNumber(record.defaultMaterialAllowance),
    notes: readNullableString(record.notes),
    isActive: readBoolean(record.isActive, true),
    effectiveDate: formatDateInput(record.effectiveDate),
    rateSource: (readString(record.rateSource) || "MANUAL") as UnitPriceRateSource,
    comparableJobsCount: readNumber(record.comparableJobsCount, 0),
    latestComparableCompletedAt: readNullableString(record.latestComparableCompletedAt),
  };
}

function toTemplateDraft(template: TemplateRecord): TemplateDraft {
  return {
    serviceName: template.serviceName,
    variantName: template.variantName,
    unitLabel: template.unitLabel,
    defaultPricePerUnit: String(template.defaultPricePerUnit),
    defaultLaborAllowance: template.defaultLaborAllowance == null ? "" : String(template.defaultLaborAllowance),
    defaultMaterialAllowance: template.defaultMaterialAllowance == null ? "" : String(template.defaultMaterialAllowance),
    notes: template.notes ?? "",
    isActive: template.isActive,
    effectiveDate: template.effectiveDate,
    rateSource: template.rateSource,
  };
}

function readObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function areTemplateDraftsEqual(left: TemplateDraft, right: TemplateDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canSaveTemplateDraft(draft: TemplateDraft) {
  return draft.serviceName.trim().length > 0
    && draft.variantName.trim().length > 0
    && draft.unitLabel.trim().length > 0
    && draft.defaultPricePerUnit.trim().length > 0
    && Number.isFinite(Number(draft.defaultPricePerUnit))
    && Number(draft.defaultPricePerUnit) >= 0;
}

function serializeTemplateDraft(draft: TemplateDraft) {
  return {
    serviceName: draft.serviceName.trim(),
    variantName: draft.variantName.trim(),
    unitLabel: draft.unitLabel.trim(),
    defaultPricePerUnit: Number(draft.defaultPricePerUnit) || 0,
    defaultLaborAllowance: draft.defaultLaborAllowance.trim() === "" ? null : Number(draft.defaultLaborAllowance) || 0,
    defaultMaterialAllowance: draft.defaultMaterialAllowance.trim() === "" ? null : Number(draft.defaultMaterialAllowance) || 0,
    notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
    isActive: draft.isActive,
    effectiveDate: draft.effectiveDate ? new Date(draft.effectiveDate) : undefined,
    rateSource: draft.rateSource,
  };
}

export default function SettingsPage() {
  const utils = api.useUtils();
  const { data } = api.config.get.useQuery();
  const update = api.config.update.useMutation({
    onSuccess: () => {
      utils.config.get.invalidate();
      toast.success("Saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const templates = api.estimatingTemplates.list.useQuery({ activeOnly: false });
  const updateTemplate = api.estimatingTemplates.update.useMutation({
    onSuccess: () => {
      templates.refetch();
      toast.success("Template saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const createTemplate = api.estimatingTemplates.create.useMutation({
    onSuccess: () => {
      templates.refetch();
      setNewTemplate(emptyTemplateDraft());
      toast.success("Template created");
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState<SettingsFormState>({
    companyName: "",
    companyPhone: "",
    companyEmail: "",
    companyAddress: "",
    googleReviewUrl: "",
    defaultWcPercent: 0,
    defaultGlPercent: 0,
    defaultOverhead: 0,
    defaultMarkup: 0,
    defaultTaxPercent: 0,
    defaultLaborSellRate: "",
    defaultLaborCostRate: "",
    defaultProposalPricingMethod: "GROSS_MARGIN",
    defaultDesiredProfitMarginPercent: 35,
    defaultGeneralLiabilityMode: "PERCENT_OF_REVENUE",
    defaultMassTaxRate: 5,
    defaultFederalTaxRate: 12,
    defaultWorkDayHours: 8,
  });
  const [templateDrafts, setTemplateDrafts] = useState<Record<number, TemplateDraft>>({});
  const [newTemplate, setNewTemplate] = useState<TemplateDraft>(emptyTemplateDraft);

  const templateRecords = Array.isArray(templates.data)
    ? templates.data.map(normalizeTemplateRecord).filter((template): template is TemplateRecord => template != null)
    : [];

  useEffect(() => {
    if (data) {
      const configRecord = readObject(data);
      setForm({
        companyName: data.companyName ?? "",
        companyPhone: data.companyPhone ?? "",
        companyEmail: data.companyEmail ?? "",
        companyAddress: data.companyAddress ?? "",
        googleReviewUrl: data.googleReviewUrl ?? "",
        defaultWcPercent: Number(data.defaultWcPercent ?? 0),
        defaultGlPercent: Number(data.defaultGlPercent ?? 0),
        defaultOverhead: Number(data.defaultOverhead ?? 0),
        defaultMarkup: Number(data.defaultMarkup ?? 0),
        defaultTaxPercent: Number(data.defaultTaxPercent ?? 0),
        defaultLaborSellRate: data.defaultLaborSellRate == null ? "" : String(Number(data.defaultLaborSellRate)),
        defaultLaborCostRate: data.defaultLaborCostRate == null ? "" : String(Number(data.defaultLaborCostRate)),
        defaultProposalPricingMethod: data.defaultProposalPricingMethod,
        defaultDesiredProfitMarginPercent: readNumber(configRecord.defaultDesiredProfitMarginPercent, 35),
        defaultGeneralLiabilityMode: (readString(configRecord.defaultGeneralLiabilityMode) || "PERCENT_OF_REVENUE") as GeneralLiabilityMode,
        defaultMassTaxRate: readNumber(configRecord.defaultMassTaxRate, 5),
        defaultFederalTaxRate: readNumber(configRecord.defaultFederalTaxRate, 12),
        defaultWorkDayHours: readNumber(configRecord.defaultWorkDayHours, 8),
      });
    }
  }, [data]);

  useEffect(() => {
    setTemplateDrafts(Object.fromEntries(templateRecords.map((template) => [template.id, toTemplateDraft(template)])));
  }, [templates.data]);

  return (
    <>
      <PageHeader title="Settings" description="Company info and pricing defaults" />
      <div className="card p-5 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company name" value={form.companyName} onChange={(v) => setForm((f) => ({ ...f, companyName: v }))} />
          <Field label="Phone" value={form.companyPhone} onChange={(v) => setForm((f) => ({ ...f, companyPhone: v }))} />
          <Field label="Email" value={form.companyEmail} onChange={(v) => setForm((f) => ({ ...f, companyEmail: v }))} />
          <Field label="Google review URL" value={form.googleReviewUrl} onChange={(v) => setForm((f) => ({ ...f, googleReviewUrl: v }))} />
          <div className="col-span-2">
            <Field label="Address" value={form.companyAddress} onChange={(v) => setForm((f) => ({ ...f, companyAddress: v }))} />
          </div>
          <NumField label="WC %" value={form.defaultWcPercent} onChange={(v) => setForm((f) => ({ ...f, defaultWcPercent: v }))} />
          <NumField label="GL %" value={form.defaultGlPercent} onChange={(v) => setForm((f) => ({ ...f, defaultGlPercent: v }))} />
          <NumField label="Overhead %" value={form.defaultOverhead} onChange={(v) => setForm((f) => ({ ...f, defaultOverhead: v }))} />
          <NumField label="Markup %" value={form.defaultMarkup} onChange={(v) => setForm((f) => ({ ...f, defaultMarkup: v }))} />
          <NumField label="Tax %" value={form.defaultTaxPercent} onChange={(v) => setForm((f) => ({ ...f, defaultTaxPercent: v }))} />
          <div>
            <label className="label">Default labor sell rate ($/painter-hour)</label>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="Not configured"
              value={form.defaultLaborSellRate}
              onChange={(e) => setForm((f) => ({ ...f, defaultLaborSellRate: e.target.value }))}
            />
            <p className="text-xs text-slate-500 mt-1">
              Required before Proposal scopes with estimated labor hours can be priced. Leave blank to keep unconfigured.
            </p>
          </div>
          <div>
            <label className="label">Default labor cost rate ($/hr, internal, optional)</label>
            <input
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="Not tracked"
              value={form.defaultLaborCostRate}
              onChange={(e) => setForm((f) => ({ ...f, defaultLaborCostRate: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Default proposal pricing method</label>
            <select
              className="input"
              value={form.defaultProposalPricingMethod}
              onChange={(e) => setForm((f) => ({ ...f, defaultProposalPricingMethod: e.target.value as "GROSS_MARGIN" | "MARKUP" }))}
            >
              <option value="GROSS_MARGIN">Gross margin</option>
              <option value="MARKUP">Markup</option>
            </select>
          </div>
          <NumField label="Default profit margin %" value={form.defaultDesiredProfitMarginPercent} onChange={(v) => setForm((f) => ({ ...f, defaultDesiredProfitMarginPercent: v }))} />
          <div>
            <label className="label">General liability basis</label>
            <select className="input" value={form.defaultGeneralLiabilityMode} onChange={(e) => setForm((f) => ({ ...f, defaultGeneralLiabilityMode: e.target.value as typeof form.defaultGeneralLiabilityMode }))}>
              <option value="PERCENT_OF_LABOR">% of labor</option>
              <option value="PERCENT_OF_REVENUE">% of revenue</option>
              <option value="FLAT_AMOUNT">Flat amount</option>
              <option value="EXCLUDED">Excluded</option>
            </select>
          </div>
          <NumField label="Mass. tax reserve %" value={form.defaultMassTaxRate} onChange={(v) => setForm((f) => ({ ...f, defaultMassTaxRate: v }))} />
          <NumField label="Federal tax reserve %" value={form.defaultFederalTaxRate} onChange={(v) => setForm((f) => ({ ...f, defaultFederalTaxRate: v }))} />
          <NumField label="Default work day hours" value={form.defaultWorkDayHours} onChange={(v) => setForm((f) => ({ ...f, defaultWorkDayHours: v }))} />
        </div>
        <button
          className="btn btn-primary mt-5"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({
              ...form,
              defaultLaborSellRate: form.defaultLaborSellRate.trim() === "" ? null : Number(form.defaultLaborSellRate),
              defaultLaborCostRate: form.defaultLaborCostRate.trim() === "" ? null : Number(form.defaultLaborCostRate),
            })
          }
        >
          {update.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>

      <div className="card p-5 max-w-4xl mt-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Unit-Price Templates</h2>
          <p className="text-sm text-slate-500">Editable company defaults for repeatable work like cabinet doors. Changes stay local until you save each row.</p>
        </div>
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 mb-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Add Template</h3>
            <p className="text-xs text-slate-500">Use this for drawers, cabinet boxes, islands, repairs, or any repeatable unit-price work.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Service" value={newTemplate.serviceName} onChange={(value) => setNewTemplate((current) => ({ ...current, serviceName: value }))} />
            <Field label="Variant" value={newTemplate.variantName} onChange={(value) => setNewTemplate((current) => ({ ...current, variantName: value }))} />
            <Field label="Unit" value={newTemplate.unitLabel} onChange={(value) => setNewTemplate((current) => ({ ...current, unitLabel: value }))} />
            <TextNumberField label="Default price" value={newTemplate.defaultPricePerUnit} onChange={(value) => setNewTemplate((current) => ({ ...current, defaultPricePerUnit: value }))} />
            <TextNumberField label="Labor allowance" value={newTemplate.defaultLaborAllowance} onChange={(value) => setNewTemplate((current) => ({ ...current, defaultLaborAllowance: value }))} />
            <TextNumberField label="Material allowance" value={newTemplate.defaultMaterialAllowance} onChange={(value) => setNewTemplate((current) => ({ ...current, defaultMaterialAllowance: value }))} />
            <div>
              <label className="label">Effective date</label>
              <input className="input" type="date" value={newTemplate.effectiveDate} onChange={(e) => setNewTemplate((current) => ({ ...current, effectiveDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Rate source</label>
              <select className="input" value={newTemplate.rateSource} onChange={(e) => setNewTemplate((current) => ({ ...current, rateSource: e.target.value as UnitPriceRateSource }))}>
                <option value="MANUAL">Manual</option>
                <option value="SEEDED">Seeded</option>
                <option value="HISTORICAL">Historical suggestion</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="label">Notes</label>
              <textarea className="input min-h-24" value={newTemplate.notes} onChange={(e) => setNewTemplate((current) => ({ ...current, notes: e.target.value }))} placeholder="Optional internal guidance for when this unit price should be used." />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={newTemplate.isActive} onChange={(e) => setNewTemplate((current) => ({ ...current, isActive: e.target.checked }))} />
              Active template
            </label>
            <button
              className="btn btn-primary"
              disabled={createTemplate.isPending || !canSaveTemplateDraft(newTemplate)}
              onClick={() => createTemplate.mutate(serializeTemplateDraft(newTemplate))}
            >
              {createTemplate.isPending ? "Saving…" : "Create template"}
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {templateRecords.map((template) => {
            const draft = templateDrafts[template.id] ?? toTemplateDraft(template);
            const original = toTemplateDraft(template);
            const isDirty = !areTemplateDraftsEqual(draft, original);

            return (
              <div key={template.id} className="rounded-md border border-slate-200 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Service" value={draft.serviceName} onChange={(value) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, serviceName: value } }))} />
                  <Field label="Variant" value={draft.variantName} onChange={(value) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, variantName: value } }))} />
                  <Field label="Unit" value={draft.unitLabel} onChange={(value) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, unitLabel: value } }))} />
                  <TextNumberField label="Default price" value={draft.defaultPricePerUnit} onChange={(value) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, defaultPricePerUnit: value } }))} />
                  <TextNumberField label="Labor allowance" value={draft.defaultLaborAllowance} onChange={(value) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, defaultLaborAllowance: value } }))} />
                  <TextNumberField label="Material allowance" value={draft.defaultMaterialAllowance} onChange={(value) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, defaultMaterialAllowance: value } }))} />
                  <div>
                    <label className="label">Effective date</label>
                    <input className="input" type="date" value={draft.effectiveDate} onChange={(e) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, effectiveDate: e.target.value } }))} />
                  </div>
                  <div>
                    <label className="label">Rate source</label>
                    <select className="input" value={draft.rateSource} onChange={(e) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, rateSource: e.target.value as UnitPriceRateSource } }))}>
                      <option value="MANUAL">Manual</option>
                      <option value="SEEDED">Seeded</option>
                      <option value="HISTORICAL">Historical suggestion</option>
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <label className="label">Notes</label>
                    <textarea className="input min-h-24" value={draft.notes} onChange={(e) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, notes: e.target.value } }))} />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={draft.isActive} onChange={(e) => setTemplateDrafts((current) => ({ ...current, [template.id]: { ...draft, isActive: e.target.checked } }))} />
                      Active
                    </label>
                    <span>{isDirty ? "Unsaved changes" : "Saved"}</span>
                    <span>
                      Comparable jobs: {template.comparableJobsCount} · Latest comparable project: {template.latestComparableCompletedAt ? new Date(template.latestComparableCompletedAt).toLocaleDateString() : "Not available yet"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-secondary" disabled={!isDirty} onClick={() => setTemplateDrafts((current) => ({ ...current, [template.id]: original }))}>
                      Reset
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={updateTemplate.isPending || !isDirty || !canSaveTemplateDraft(draft)}
                      onClick={() => updateTemplate.mutate({ id: template.id, data: serializeTemplateDraft(draft) })}
                    >
                      {updateTemplate.isPending ? "Saving…" : "Save row"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step="0.01"
        className="input"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

function TextNumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
