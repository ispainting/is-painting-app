"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

type UploadState = "queued" | "uploading" | "success" | "failed" | "canceled";
type ExtractionStatus = "idle" | "queued" | "processing" | "completed" | "failed" | "needs_review";

type UploadItem = {
  id: string;
  file: File;
  status: UploadState;
  progress: number;
  error?: string;
  attachmentId?: number;
};

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

type ExtractionState = {
  status: ExtractionStatus;
  message?: string;
  attachmentId?: number;
  data?: ExtractedReceiptData | null;
  provider?: string;
  model?: string;
};

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_FILE_BYTES = 12 * 1024 * 1024;

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

const STATUS_OPTIONS = ["pending", "approved", "rejected"] as const;
const UPLOAD_REQUEST_TIMEOUT_MS = 60_000;
const EXTRACTION_UI_TIMEOUT_MS = 75_000;

function numberToInput(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

function toExtractionStatus(value: string): ExtractionStatus {
  if (value === "queued") return "queued";
  if (value === "processing") return "processing";
  if (value === "completed") return "completed";
  if (value === "needs_review") return "needs_review";
  if (value === "failed") return "failed";
  return "failed";
}

export default function ExpensesPage() {
  const searchParams = useSearchParams();
  const utils = api.useUtils();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const xhrMap = useRef<Map<string, XMLHttpRequest>>(new Map());
  const extractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | (typeof STATUS_OPTIONS)[number]>("");
  const [category, setCategory] = useState<"" | (typeof CATEGORY_OPTIONS)[number]>("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "vendor" | "status" | "createdAt">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [saveBehavior, setSaveBehavior] = useState<"close" | "next">("close");
  const [replacementTarget, setReplacementTarget] = useState<{ expenseId: number; oldAttachmentId?: number } | null>(null);

  const [form, setForm] = useState({
    vendor: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    category: "materials" as (typeof CATEGORY_OPTIONS)[number],
    jobId: "",
    description: "",
  });
  const requestedJobId = Number(searchParams.get("jobId"));
  const jobIsLocked = Number.isInteger(requestedJobId) && requestedJobId > 0;

  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<number[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [extractionState, setExtractionState] = useState<ExtractionState>({ status: "idle" });
  const listQuery = api.expenses.list.useQuery({
    search: search || undefined,
    status: status || undefined,
    category: category || undefined,
    sortBy,
    sortDir,
  });
  const statsQuery = api.expenses.stats.useQuery();
  const metaQuery = api.expenses.meta.useQuery();

  useEffect(() => {
    if (!jobIsLocked || !metaQuery.data?.jobs.some((job) => job.id === requestedJobId)) return;
    setForm((prev) => ({ ...prev, jobId: String(requestedJobId) }));
    setShowAddExpense(true);
  }, [jobIsLocked, metaQuery.data?.jobs, requestedJobId]);

  const extractReceipt = api.expenses.extractReceipt.useMutation({
    onSuccess: (result) => {
      clearExtractionTimeout();

      if (result.status === "failed" || !result.data) {
        setExtractionState({
          status: "failed",
          message: result.message,
          attachmentId: result.attachmentId,
          data: null,
          provider: result.provider,
          model: result.model,
        });
        toast.error(result.message || "AI reading failed");
        return;
      }

      applyExtractedData(result.data);
      setExtractionState({
        status: toExtractionStatus(result.status),
        message: result.message,
        attachmentId: result.attachmentId,
        data: result.data,
        provider: result.provider,
        model: result.model,
      });

      if (result.status === "needs_review") {
        toast.warning("Receipt read with low confidence. Please review all fields.");
      } else {
        toast.success("Receipt read successfully. Please review before saving.");
      }
    },
    onError: (error) => {
      clearExtractionTimeout();
      setExtractionState((prev) => ({
        ...prev,
        status: "failed",
        message: error.message || "AI reading failed.",
      }));
      toast.error(error.message || "AI reading failed");
    },
  });

  const approve = api.expenses.approve.useMutation({
    onSuccess: () => {
      void utils.expenses.list.invalidate();
      void utils.expenses.stats.invalidate();
      toast.success("Approved");
    },
  });

  const reject = api.expenses.reject.useMutation({
    onSuccess: () => {
      void utils.expenses.list.invalidate();
      void utils.expenses.stats.invalidate();
      toast.success("Rejected");
    },
  });

  const createExpense = api.expenses.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.expenses.list.invalidate(),
        utils.expenses.stats.invalidate(),
        utils.expenses.meta.invalidate(),
      ]);

      setForm({
        vendor: "",
        expenseDate: new Date().toISOString().slice(0, 10),
        amount: "",
        category: "materials",
        jobId: "",
        description: "",
      });
      setSelectedAttachmentIds([]);
      setExtractionState({ status: "idle" });

      if (saveBehavior === "close") {
        setShowAddExpense(false);
      }

      toast.success(saveBehavior === "next" ? "Expense saved. Ready for next review." : "Expense created");
    },
    onError: (error) => toast.error(error.message || "Failed to create expense"),
  });

  const replaceAttachment = api.expenses.replaceAttachment.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.expenses.list.invalidate(), utils.expenses.meta.invalidate()]);
      setReplacementTarget(null);
      toast.success("Receipt replaced");
    },
    onError: (error) => toast.error(error.message || "Failed to replace receipt"),
  });

  const deleteAttachment = api.expenses.deleteAttachment.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.expenses.list.invalidate(), utils.expenses.meta.invalidate()]);
      toast.success("Attachment deleted");
    },
    onError: (error) => toast.error(error.message || "Failed to delete attachment"),
  });

  const possibleDuplicate = useMemo(() => {
    const vendor = form.vendor.trim().toLowerCase();
    const amount = Number(form.amount);
    const date = form.expenseDate;
    if (!vendor || Number.isNaN(amount) || !date) return null;

    return (listQuery.data ?? []).find((expense) => {
      const sameVendor = (expense.vendor || "").trim().toLowerCase() === vendor;
      const sameTotal = Number(expense.amount) === amount;
      const sameDate = new Date(expense.expenseDate).toISOString().slice(0, 10) === date;
      return sameVendor && sameTotal && sameDate;
    }) || null;
  }, [form.vendor, form.amount, form.expenseDate, listQuery.data]);

  function clearExtractionTimeout() {
    if (!extractionTimeoutRef.current) return;
    clearTimeout(extractionTimeoutRef.current);
    extractionTimeoutRef.current = null;
  }

  function beginExtraction(attachmentId: number) {
    clearExtractionTimeout();
    setExtractionState({
      status: "processing",
      attachmentId,
      message: "Reading receipt with AI...",
      data: null,
    });

    extractionTimeoutRef.current = setTimeout(() => {
      setExtractionState((prev) => {
        if (prev.status !== "processing") return prev;
        return {
          ...prev,
          status: "failed",
          message: "AI timeout. Please retry AI reading.",
        };
      });
      toast.error("AI timeout. Please retry AI reading.");
    }, EXTRACTION_UI_TIMEOUT_MS);

    extractReceipt.mutate({ attachmentId });
  }

  function applyExtractedData(data: ExtractedReceiptData) {
    setForm((prev) => ({
      ...prev,
      vendor: data.vendor.value ?? prev.vendor,
      expenseDate: data.date.value ?? prev.expenseDate,
      amount: data.total.value != null ? numberToInput(data.total.value) : prev.amount,
      category: data.category.value && CATEGORY_OPTIONS.includes(data.category.value as (typeof CATEGORY_OPTIONS)[number])
        ? (data.category.value as (typeof CATEGORY_OPTIONS)[number])
        : "materials",
      description: data.description.value ?? prev.description,
    }));
  }

  function queueFiles(fileList: FileList | File[]) {
    const next: UploadItem[] = [];
    for (const file of Array.from(fileList)) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      const validMime = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());
      const validExt = ALLOWED_EXTENSIONS.includes(extension);
      if (!validMime || !validExt) {
        toast.error(`${file.name}: unsupported format`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name}: file exceeds 12MB limit`);
        continue;
      }

      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "queued",
        progress: 0,
      });
    }

    if (next.length === 0) return;
    setUploads((prev) => [...next, ...prev]);
    next.forEach((item) => startUpload(item));
  }

  function removeUpload(id: string) {
    const upload = uploads.find((item) => item.id === id);
    if (upload?.attachmentId) {
      setSelectedAttachmentIds((prev) => prev.filter((attachmentId) => attachmentId !== upload.attachmentId));
    }
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }

  function startUpload(item: UploadItem) {
    const xhr = new XMLHttpRequest();
    xhrMap.current.set(item.id, xhr);
    xhr.timeout = UPLOAD_REQUEST_TIMEOUT_MS;

    setUploads((prev) =>
      prev.map((u) => (u.id === item.id ? { ...u, status: "uploading", progress: 0, error: undefined } : u))
    );

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, progress } : u)));
    };

    xhr.onload = () => {
      xhrMap.current.delete(item.id);
      let json: { attachment?: { id: number }; error?: string } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = {};
      }

      if (xhr.status >= 200 && xhr.status < 300 && json.attachment?.id) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === item.id
              ? { ...u, status: "success", progress: 100, attachmentId: json.attachment?.id }
              : u
          )
        );

        setSelectedAttachmentIds((prev) => Array.from(new Set([...prev, json.attachment!.id])));
        void Promise.all([
          utils.expenses.meta.invalidate(),
          utils.expenses.stats.invalidate(),
          utils.expenses.list.invalidate(),
        ]);

        if (replacementTarget) {
          replaceAttachment.mutate({
            expenseId: replacementTarget.expenseId,
            newAttachmentId: json.attachment.id,
            oldAttachmentId: replacementTarget.oldAttachmentId,
          });
        } else {
          setShowAddExpense(true);
          setExtractionState({
            status: "queued",
            attachmentId: json.attachment.id,
            message: "Receipt uploaded. Starting AI reading...",
          });
          beginExtraction(json.attachment.id);
        }

        toast.success("Receipt attached. Review the fields before saving.");
      } else {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === item.id
              ? {
                  ...u,
                  status: "failed",
                  error: json.error || "Upload failed",
                }
              : u
          )
        );
        toast.error(json.error || "Upload failed");
      }
    };

    xhr.onerror = () => {
      xhrMap.current.delete(item.id);
      setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: "failed", error: "Network error" } : u)));
      toast.error("Network error while uploading receipt");
    };

    xhr.ontimeout = () => {
      xhrMap.current.delete(item.id);
      setUploads((prev) =>
        prev.map((u) =>
          u.id === item.id
            ? { ...u, status: "failed", error: "Upload request timed out. Please retry." }
            : u
        )
      );
      toast.error("Upload timed out. Please retry.");
    };

    xhr.onabort = () => {
      xhrMap.current.delete(item.id);
      setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: "canceled", error: "Upload canceled" } : u)));
    };

    const formData = new FormData();
    formData.append("file", item.file);
    xhr.open("POST", "/api/expenses/uploads");
    xhr.withCredentials = true;
    xhr.send(formData);
  }

  function cancelUpload(id: string) {
    const xhr = xhrMap.current.get(id);
    if (xhr) xhr.abort();
  }

  function retryUpload(id: string) {
    const item = uploads.find((u) => u.id === id);
    if (!item) return;
    startUpload(item);
  }

  function onDropFiles(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files?.length) {
      queueFiles(event.dataTransfer.files);
    }
  }

  function submitExpense(behavior: "close" | "next") {
    if (!form.jobId) {
      toast.error("Select a Job before adding the expense.");
      return;
    }
    if (!form.amount || Number.isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.error("Enter a valid total amount");
      return;
    }

    setSaveBehavior(behavior);
    createExpense.mutate({
      vendor: form.vendor || undefined,
      expenseDate: new Date(form.expenseDate),
      description: form.description || undefined,
      amount: Number(form.amount),
      category: form.category,
      jobId: Number(form.jobId),
      attachmentIds: selectedAttachmentIds,
      extractedRawText: extractionState.data?.rawText || undefined,
      extractedStructured: extractionState.data || undefined,
      extractedConfidence: extractionState.data?.overallConfidence,
    });
  }

  const expenses = listQuery.data ?? [];
  const isLoading = listQuery.isLoading;

  const emptyState = !isLoading && expenses.length === 0;
  const canSubmitExpense = Boolean(
    form.jobId
    && form.vendor.trim()
    && form.expenseDate
    && CATEGORY_OPTIONS.includes(form.category)
    && Number.isFinite(Number(form.amount))
    && Number(form.amount) > 0
  );

  const summaryCards = [
    { label: "Total Expenses", value: formatCurrency(statsQuery.data?.totalExpenses ?? 0) },
    { label: "Pending Uploads", value: String(statsQuery.data?.pendingUploads ?? 0) },
    { label: "Expense Count", value: String(statsQuery.data?.expenseCount ?? 0) },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Track spend and manage receipt uploads."
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary min-h-11" onClick={() => setShowUpload((v) => !v)}>Upload Receipt</button>
            <button className="btn btn-primary min-h-11" onClick={() => setShowAddExpense((v) => !v)}>Add Expense</button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="card p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="text-xl font-semibold text-slate-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {showUpload && (
        <section className="card p-4 mb-6">
          <h2 className="text-base font-semibold">Upload Receipts</h2>
          <p className="text-sm text-slate-500 mt-1">
            Supports PDF, JPG, JPEG, PNG, WebP, and HEIC/HEIF up to 12MB.
          </p>
          <div
            className={`mt-4 rounded-lg border-2 border-dashed p-6 text-center ${dragActive ? "border-brand-500 bg-brand-50" : "border-slate-300"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDropFiles}
          >
            <p className="text-sm">Take a photo or choose a receipt file</p>
            <div className="mt-3 grid gap-2 sm:flex sm:justify-center">
              <button className="btn btn-primary min-h-12 w-full sm:w-auto" onClick={() => cameraInputRef.current?.click()}>
                Take Photo
              </button>
              <button className="btn btn-secondary min-h-12 w-full sm:w-auto" onClick={() => inputRef.current?.click()}>
                Choose Photo or PDF
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) queueFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) queueFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {uploads.length > 0 && (
            <div className="mt-4 space-y-2">
              {uploads.map((upload) => (
                <div key={upload.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{upload.file.name}</p>
                      <p className="text-xs text-slate-500">{Math.round(upload.file.size / 1024)} KB</p>
                      {upload.error && <p className="text-xs text-red-600 mt-1">{upload.error}</p>}
                    </div>
                    <div className="flex gap-2">
                      {upload.status === "uploading" && (
                        <button className="btn btn-secondary text-xs" onClick={() => cancelUpload(upload.id)}>
                          Cancel
                        </button>
                      )}
                      {(upload.status === "failed" || upload.status === "canceled") && (
                        <button className="btn btn-secondary text-xs" onClick={() => retryUpload(upload.id)}>
                          Retry
                        </button>
                      )}
                      {upload.status === "success" && (
                        <button className="btn btn-secondary min-h-11 text-xs" onClick={() => removeUpload(upload.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full ${upload.status === "failed" ? "bg-red-500" : "bg-brand-600"}`}
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showAddExpense && (
        <section className="card p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Add Expense</h2>
            {extractionState.status === "processing" && (
              <p className="text-sm text-brand-700">Reading receipt with AI...</p>
            )}
            {extractionState.status === "queued" && (
              <p className="text-sm text-slate-600">Starting AI receipt reading...</p>
            )}
          </div>

          {(extractionState.status === "failed" || extractionState.status === "needs_review") && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">Needs review</p>
              <p>{extractionState.message || "Receipt information could not be fully verified."}</p>
            </div>
          )}

          <button className="btn btn-primary mt-4 min-h-12 w-full text-base" onClick={() => setShowUpload(true)}>
            Upload Receipt
          </button>

          {uploads.some((upload) => upload.status === "success" && upload.attachmentId) && (
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" aria-live="polite">
              Receipt attached. AI fields can be reviewed and edited below.
            </p>
          )}

          {possibleDuplicate && (
            <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
              <p className="font-medium">Possible duplicate</p>
              <p>
                Existing expense #{possibleDuplicate.id} has the same vendor, total, and date.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 mt-4">
            <div>
              <label className="label">Vendor</label>
              <input className="input" value={form.vendor} onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.expenseDate} onChange={(e) => setForm((p) => ({ ...p, expenseDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Total Amount</label>
              <input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as (typeof CATEGORY_OPTIONS)[number] }))}>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt.replaceAll("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Job <span className="text-red-600">*</span></label>
              {jobIsLocked ? (
                <p className="input bg-slate-50" aria-live="polite">
                  {metaQuery.data?.jobs.find((job) => String(job.id) === form.jobId)?.name || "Loading job..."}
                </p>
              ) : (
                <select className="input" value={form.jobId} onChange={(e) => setForm((p) => ({ ...p, jobId: e.target.value }))}>
                  <option value="">Select a Job</option>
                  {(metaQuery.data?.jobs ?? []).map((job) => (
                    <option key={job.id} value={job.id}>{job.name}</option>
                  ))}
                </select>
              )}
              {jobIsLocked && <p className="mt-1 text-xs text-slate-500">Expense will be added to this Job.</p>}
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <input className="input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            <button className="btn btn-primary min-h-12 flex-1 text-base" onClick={() => submitExpense("close")} disabled={createExpense.isPending || !canSubmitExpense}>
              {createExpense.isPending ? "Saving..." : "Add Expense"}
            </button>
            <button className="btn btn-secondary min-h-12 flex-1 text-base" onClick={() => setShowAddExpense(false)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="card p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="input md:col-span-2"
            placeholder="Search vendor, description, notes, or job"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "" | (typeof STATUS_OPTIONS)[number])}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as "" | (typeof CATEGORY_OPTIONS)[number])}>
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt.replaceAll("_", " ")}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "vendor" | "status" | "createdAt") }>
              <option value="date">Sort: Date</option>
              <option value="amount">Sort: Amount</option>
              <option value="vendor">Sort: Vendor</option>
              <option value="status">Sort: Status</option>
              <option value="createdAt">Sort: Created</option>
            </select>
            <select className="input" value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium text-right">Amount</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Job</th>
              <th className="px-4 py-2 font-medium">Receipt</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : emptyState ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-base font-medium text-slate-900">No expenses yet.</p>
                  <div className="flex justify-center gap-2 mt-4">
                    <button className="btn btn-secondary" onClick={() => setShowUpload(true)}>Upload Receipt</button>
                    <button className="btn btn-primary" onClick={() => setShowAddExpense(true)}>Add Expense</button>
                  </div>
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{e.vendor || "—"}</td>
                  <td className="px-4 py-2">{formatDate(e.expenseDate)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(Number(e.amount))}</td>
                  <td className="px-4 py-2 capitalize">{e.category.replaceAll("_", " ")}</td>
                  <td className="px-4 py-2">{e.job?.name || "—"}</td>
                  <td className="px-4 py-2">
                    {e.attachments.length === 0 ? (
                      <span className="text-slate-500">No</span>
                    ) : (
                      <div className="space-y-2">
                        {e.attachments.slice(0, 2).map((attachment) => (
                          <div key={attachment.id} className="rounded-md border border-slate-200 p-2">
                            {attachment.mimeType.startsWith("image/") ? (
                              <img
                                src={`/api/expenses/attachments/${attachment.id}/preview`}
                                alt={attachment.originalFilename}
                                className="h-12 w-12 rounded object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded border border-slate-200 text-xs flex items-center justify-center bg-slate-50">PDF</div>
                            )}
                            <div className="mt-1 text-xs text-slate-600 truncate max-w-[180px]">{attachment.originalFilename}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <a className="btn btn-secondary text-xs" href={`/api/expenses/attachments/${attachment.id}/preview`} target="_blank" rel="noreferrer">Preview</a>
                              <a className="btn btn-secondary text-xs" href={`/api/expenses/attachments/${attachment.id}/download`} target="_blank" rel="noreferrer">Download</a>
                              <button
                                className="btn btn-secondary text-xs"
                                onClick={() => {
                                  setReplacementTarget({ expenseId: e.id, oldAttachmentId: attachment.id });
                                  replaceInputRef.current?.click();
                                }}
                              >
                                Replace
                              </button>
                              <button className="btn btn-danger text-xs" onClick={() => deleteAttachment.mutate({ id: attachment.id })}>Delete</button>
                            </div>
                          </div>
                        ))}
                        {e.attachments.length > 2 && <p className="text-xs text-slate-500">+{e.attachments.length - 2} more</p>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 capitalize">{e.status}</td>
                  <td className="px-4 py-2 text-right">
                    {e.status === "pending" && (
                      <div className="flex gap-1 justify-end">
                        <button
                          className="btn btn-secondary text-xs"
                          onClick={() => approve.mutate({ id: e.id })}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-danger text-xs"
                          onClick={() => reject.mutate({ id: e.id })}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(e) => {
          if (!e.target.files?.length) return;
          queueFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
    </>
  );
}
