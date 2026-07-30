"use client";

import { useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { toast } from "sonner";

const CATEGORY_OPTIONS = [
  "paint",
  "materials",
  "labor",
  "tools",
  "equipment",
  "rentals",
  "fuel",
  "subcontractor",
  "travel",
  "ferry",
  "payroll_related",
  "office",
  "advertising",
  "insurance",
  "vehicle",
  "meals",
  "other",
] as const;

type CategoryValue = (typeof CATEGORY_OPTIONS)[number];

type ExtractedValue<T> = {
  value: T | null;
  confidence: number;
};

type ExtractedReceiptData = {
  vendor: ExtractedValue<string>;
  date: ExtractedValue<string>;
  total: ExtractedValue<number>;
  category: ExtractedValue<string>;
  description: ExtractedValue<string>;
  rawText: string | null;
  overallConfidence: number;
};

type ExpenseIntakePanelProps = {
  onCancel: () => void;
  onSaved?: () => void;
  fixedJobId?: number;
  fixedJobName?: string;
};

function numberToInput(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

export function ExpenseIntakePanel({ onCancel, onSaved, fixedJobId, fixedJobName }: ExpenseIntakePanelProps) {
  const utils = api.useUtils();
  const metaQuery = api.expenses.meta.useQuery();

  const [uploading, setUploading] = useState(false);
  const [attachmentId, setAttachmentId] = useState<number | null>(null);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
  const [extractionData, setExtractionData] = useState<ExtractedReceiptData | null>(null);
  const [descriptionManuallyCleared, setDescriptionManuallyCleared] = useState(false);

  const [form, setForm] = useState({
    vendor: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    category: "materials" as CategoryValue,
    description: "",
    notes: "",
    jobId: fixedJobId ? String(fixedJobId) : "",
  });

  const extractReceipt = api.expenses.extractReceipt.useMutation({
    onSuccess: (result) => {
      if (!result.data || result.status === "failed") {
        setExtractionMessage(result.message || "Extraction failed.");
        if (result.status === "failed") {
          toast.error(result.message || "AI reading failed.");
        }
        return;
      }

      const data = result.data as ExtractedReceiptData;
      setExtractionData(data);
      setExtractionMessage(result.message || null);

      setForm((prev) => {
        const nextVendor = data.vendor.value ?? prev.vendor;
        const fallbackDescription = nextVendor.trim() ? `Receipt from ${nextVendor.trim()}` : "Receipt";

        return {
          ...prev,
          vendor: nextVendor,
          expenseDate: data.date.value ?? prev.expenseDate,
          amount: data.total.value != null ? numberToInput(data.total.value) : prev.amount,
          category:
            data.category.value
            && data.category.confidence >= 0.85
            && CATEGORY_OPTIONS.includes(data.category.value as CategoryValue)
              ? (data.category.value as CategoryValue)
              : prev.category,
          description: data.description.value ?? (prev.description.trim() ? prev.description : fallbackDescription),
        };
      });

      setDescriptionManuallyCleared(false);
      toast.success("Receipt read successfully.");
    },
    onError: (error) => {
      setExtractionMessage(error.message || "Extraction failed.");
      toast.error(error.message || "AI reading failed.");
    },
  });

  const createExpense = api.expenses.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.expenses.list.invalidate(),
        utils.expenses.stats.invalidate(),
        utils.expenses.meta.invalidate(),
        fixedJobId ? utils.jobs.byId.invalidate({ id: fixedJobId }) : Promise.resolve(),
      ]);
      toast.success("Expense created");
      onSaved?.();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create expense");
    },
  });

  const jobs = useMemo(() => metaQuery.data?.jobs ?? [], [metaQuery.data?.jobs]);

  async function uploadAndExtract(file: File) {
    setUploading(true);
    setExtractionMessage("Uploading receipt...");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/expenses/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const uploadJson = (await uploadRes.json()) as { attachment?: { id: number }; error?: string };
      if (!uploadRes.ok || !uploadJson.attachment?.id) {
        throw new Error(uploadJson.error || "Upload failed");
      }

      setAttachmentId(uploadJson.attachment.id);
      setExtractionMessage("Reading receipt with AI...");
      extractReceipt.mutate({ attachmentId: uploadJson.attachment.id, forceNewTask: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setExtractionMessage(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!form.amount || Number.isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.error("Enter a valid total amount");
      return;
    }

    const trimmedDescription = form.description.trim();
    const trimmedVendor = form.vendor.trim();
    const fallbackDescription = trimmedVendor ? `Receipt from ${trimmedVendor}` : "Receipt";
    const descriptionToSave = trimmedDescription
      ? trimmedDescription
      : (descriptionManuallyCleared ? undefined : fallbackDescription);

    createExpense.mutate({
      vendor: form.vendor || undefined,
      expenseDate: new Date(form.expenseDate),
      amount: Number(form.amount),
      category: form.category,
      description: descriptionToSave,
      notes: form.notes || undefined,
      jobId: fixedJobId ?? (form.jobId ? Number(form.jobId) : undefined),
      status: "pending",
      attachmentIds: attachmentId ? [attachmentId] : [],
      extractedRawText: extractionData?.rawText || undefined,
      extractedStructured: extractionData || undefined,
      extractedConfidence: extractionData?.overallConfidence,
      lineItems: [],
    });
  }

  const viewReceiptHref = attachmentId ? `/api/expenses/attachments/${attachmentId}/preview` : null;

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Add Expense</h2>
        {(uploading || extractReceipt.isPending) && <p className="text-sm text-brand-700">Processing receipt...</p>}
      </div>

      {fixedJobId && (
        <p className="mt-2 text-sm text-slate-600">
          Adding expense to: <span className="font-medium text-slate-900">{fixedJobName || `Job #${fixedJobId}`}</span>
        </p>
      )}

      <div className="mt-3">
        <label className="label">Upload Receipt</label>
        <input
          type="file"
          className="input"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void uploadAndExtract(file);
            event.currentTarget.value = "";
          }}
        />
      </div>

      {viewReceiptHref && (
        <div className="mt-3 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">Receipt Preview</p>
          <a href={viewReceiptHref} target="_blank" rel="noreferrer" className="block mt-2">
            <img
              src={viewReceiptHref}
              alt="Receipt preview"
              className="h-[250px] w-full rounded border border-slate-200 object-contain bg-slate-50"
            />
          </a>
        </div>
      )}

      {extractionMessage && <p className="mt-3 text-sm text-slate-600">{extractionMessage}</p>}

      <div className="grid gap-3 md:grid-cols-2 mt-4">
        <div>
          <label className="label">Total</label>
          <input
            type="number"
            step="0.01"
            className="input text-base"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Vendor</label>
          <input
            className="input text-base"
            value={form.vendor}
            onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            className="input text-base"
            value={form.expenseDate}
            onChange={(e) => setForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Category</label>
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as CategoryValue }))}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>

        {!fixedJobId && (
          <div>
            <label className="label">Job</label>
            <select
              className="input"
              value={form.jobId}
              onChange={(e) => setForm((prev) => ({ ...prev, jobId: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>{job.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="md:col-span-2">
          <label className="label">Description</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => {
              const value = e.target.value;
              setDescriptionManuallyCleared(value.trim().length === 0);
              setForm((prev) => ({ ...prev, description: value }));
            }}
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary px-8 py-3 text-base font-semibold" onClick={submit} disabled={createExpense.isPending}>
          {createExpense.isPending ? "Saving..." : "Save Expense"}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
