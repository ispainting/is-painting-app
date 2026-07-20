"use client";

import { useMemo, useRef, useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

type UploadState = "queued" | "uploading" | "success" | "failed" | "canceled";
type ExtractionStatus = "idle" | "queued" | "processing" | "completed" | "failed" | "needs_review";
type ExtractionErrorCode =
  | "resource_exhausted"
  | "invalid_api_key"
  | "unauthorized"
  | "rate_limit"
  | "timeout"
  | "bad_request"
  | "network_error"
  | "not_found"
  | "unknown";

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

type ExtractedLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  confidence: number;
};

type SuggestedJob = {
  jobId: number | null;
  jobName: string | null;
  confidence: number;
  reason: string | null;
};

type ExtractedReceiptData = {
  vendor: ExtractedValue<string>;
  date: ExtractedValue<string>;
  subtotal: ExtractedValue<number>;
  tax: ExtractedValue<number>;
  total: ExtractedValue<number>;
  paymentMethod: ExtractedValue<string>;
  receiptNumber: ExtractedValue<string>;
  invoiceNumber: ExtractedValue<string>;
  category: ExtractedValue<string>;
  description: ExtractedValue<string>;
  items: ExtractedLineItem[];
  rawText: string | null;
  overallConfidence: number;
  suggestedJob?: SuggestedJob;
};

type ExtractionState = {
  status: ExtractionStatus;
  message?: string;
  errorCode?: ExtractionErrorCode;
  attachmentId?: number;
  data?: ExtractedReceiptData | null;
  provider?: string;
  model?: string;
};

type EditableLineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  confidence: number;
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
const SUCCESS_UPLOAD_ROW_TTL_MS = 1_200;
const EXTRACTION_UI_TIMEOUT_MS = 75_000;

function numberToInput(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

function inputToOptionalNumber(value: string) {
  const parsed = Number(value);
  if (!value.trim() || Number.isNaN(parsed)) return undefined;
  return parsed;
}

function inputToNullableNumber(value: string) {
  const parsed = Number(value);
  if (!value.trim() || Number.isNaN(parsed)) return null;
  return parsed;
}

function confidenceLabel(value: number) {
  if (value >= 0.85) return "High";
  if (value >= 0.65) return "Medium";
  if (value > 0) return "Low";
  return "Needs review";
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
  const utils = api.useUtils();
  const inputRef = useRef<HTMLInputElement | null>(null);
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
  const [jobSearch, setJobSearch] = useState("");
  const [saveBehavior, setSaveBehavior] = useState<"close" | "next">("close");
  const [replacementTarget, setReplacementTarget] = useState<{ expenseId: number; oldAttachmentId?: number } | null>(null);

  const [form, setForm] = useState({
    vendor: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    subtotal: "",
    tax: "",
    category: "materials" as (typeof CATEGORY_OPTIONS)[number],
    paymentMethod: "",
    receiptNumber: "",
    invoiceNumber: "",
    jobId: "",
    employeeId: "",
    description: "",
    notes: "",
    status: "pending" as (typeof STATUS_OPTIONS)[number],
  });

  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<number[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [extractionState, setExtractionState] = useState<ExtractionState>({ status: "idle" });
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);

  const listQuery = api.expenses.list.useQuery({
    search: search || undefined,
    status: status || undefined,
    category: category || undefined,
    sortBy,
    sortDir,
  });
  const statsQuery = api.expenses.stats.useQuery();
  const metaQuery = api.expenses.meta.useQuery();

  const extractReceipt = api.expenses.extractReceipt.useMutation({
    onSuccess: (result) => {
      clearExtractionTimeout();
      const extractedData = (result.data ?? null) as ExtractedReceiptData | null;

      if (result.status === "failed" || !extractedData) {
        setExtractionState({
          status: "failed",
          message: result.message,
          errorCode: (result.errorCode as ExtractionErrorCode | undefined) ?? "unknown",
          attachmentId: result.attachmentId,
          data: null,
          provider: result.provider,
          model: result.model,
        });
        toast.error(result.message || "AI reading failed");
        return;
      }

      applyExtractedData(extractedData);
      setExtractionState({
        status: toExtractionStatus(result.status),
        message: result.message,
        attachmentId: result.attachmentId,
        data: extractedData,
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
        errorCode: "unknown",
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
        subtotal: "",
        tax: "",
        category: "materials",
        paymentMethod: "",
        receiptNumber: "",
        invoiceNumber: "",
        jobId: "",
        employeeId: "",
        description: "",
        notes: "",
        status: "pending",
      });
      setSelectedAttachmentIds([]);
      setLineItems([]);
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

  const allAvailableAttachments = useMemo(() => {
    const orphan = metaQuery.data?.orphanAttachments ?? [];
    const fromQueue = uploads
      .filter((u) => u.status === "success" && u.attachmentId)
      .map((u) => ({
        id: u.attachmentId as number,
        originalFilename: u.file.name,
        mimeType: u.file.type,
        sizeBytes: u.file.size,
        uploadedAt: new Date(),
      }));

    const map = new Map<number, (typeof orphan)[number] | (typeof fromQueue)[number]>();
    [...fromQueue, ...orphan].forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  }, [metaQuery.data?.orphanAttachments, uploads]);

  const filteredJobs = useMemo(() => {
    const jobs = metaQuery.data?.jobs ?? [];
    const needle = jobSearch.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) => job.name.toLowerCase().includes(needle));
  }, [metaQuery.data?.jobs, jobSearch]);

  const primaryAttachmentId = selectedAttachmentIds[0] ?? extractionState.attachmentId;
  const viewReceiptHref = primaryAttachmentId
    ? `/api/expenses/attachments/${primaryAttachmentId}/preview`
    : null;

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

  function beginExtraction(attachmentId: number, forceNewTask = false) {
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

    extractReceipt.mutate({ attachmentId, forceNewTask });
  }

  function beginExtractionWithConfirmation(attachmentId: number, forceNewTask = false) {
    if (forceNewTask) {
      const confirmed = window.confirm(
        "Start a brand new AI extraction task for this receipt? This can consume additional Manus API credits.",
      );
      if (!confirmed) return;
    }
    beginExtraction(attachmentId, forceNewTask);
  }

  function applyExtractedData(data: ExtractedReceiptData) {
    setForm((prev) => ({
      ...prev,
      vendor: data.vendor.value ?? prev.vendor,
      expenseDate: data.date.value ?? prev.expenseDate,
      amount: data.total.value != null ? numberToInput(data.total.value) : prev.amount,
      subtotal: data.subtotal.value != null ? numberToInput(data.subtotal.value) : prev.subtotal,
      tax: data.tax.value != null ? numberToInput(data.tax.value) : prev.tax,
      category: data.category.value && CATEGORY_OPTIONS.includes(data.category.value as (typeof CATEGORY_OPTIONS)[number])
        ? (data.category.value as (typeof CATEGORY_OPTIONS)[number])
        : prev.category,
      paymentMethod: data.paymentMethod.value ?? prev.paymentMethod,
      receiptNumber: data.receiptNumber.value ?? prev.receiptNumber,
      invoiceNumber: data.invoiceNumber.value ?? prev.invoiceNumber,
      description: data.description.value ?? prev.description,
    }));

    setLineItems(
      data.items.map((item) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        description: item.description,
        quantity: numberToInput(item.quantity),
        unitPrice: numberToInput(item.unitPrice),
        totalPrice: numberToInput(item.totalPrice),
        confidence: item.confidence,
      }))
    );
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
            status: "idle",
            attachmentId: json.attachment.id,
            message: "Receipt uploaded. Click Extract with AI to start receipt reading.",
          });
        }

        toast.success("Receipt uploaded. Review and save the expense details.");
        setTimeout(() => removeUpload(item.id), SUCCESS_UPLOAD_ROW_TTL_MS);
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
      subtotal: inputToOptionalNumber(form.subtotal),
      tax: inputToOptionalNumber(form.tax),
      category: form.category,
      paymentMethod: form.paymentMethod || undefined,
      receiptNumber: form.receiptNumber || undefined,
      invoiceNumber: form.invoiceNumber || undefined,
      jobId: form.jobId ? Number(form.jobId) : undefined,
      employeeId: form.employeeId ? Number(form.employeeId) : undefined,
      notes: form.notes || undefined,
      status: form.status,
      attachmentIds: selectedAttachmentIds,
      extractedRawText: extractionState.data?.rawText || undefined,
      extractedStructured: extractionState.data || undefined,
      extractedConfidence: extractionState.data?.overallConfidence,
      lineItems: lineItems
        .filter((item) => item.description.trim().length > 0)
        .map((item) => ({
          description: item.description.trim(),
          quantity: inputToNullableNumber(item.quantity),
          unitPrice: inputToNullableNumber(item.unitPrice),
          totalPrice: inputToNullableNumber(item.totalPrice),
        })),
    });
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        description: "",
        quantity: "",
        unitPrice: "",
        totalPrice: "",
        confidence: 0,
      },
    ]);
  }

  function clearExtractedData() {
    setExtractionState({ status: "idle", data: null, attachmentId: primaryAttachmentId });
    setLineItems([]);
    setForm((prev) => ({
      ...prev,
      vendor: "",
      amount: "",
      subtotal: "",
      tax: "",
      paymentMethod: "",
      receiptNumber: "",
      description: "",
      category: "materials",
    }));
  }

  const expenses = listQuery.data ?? [];
  const isLoading = listQuery.isLoading;

  const emptyState = !isLoading && expenses.length === 0;

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
            <button className="btn btn-secondary" onClick={() => setShowUpload((v) => !v)}>Upload Receipt</button>
            <button className="btn btn-primary" onClick={() => setShowAddExpense((v) => !v)}>Add Expense</button>
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
            <p className="text-sm">Drag and drop receipt files here</p>
            <p className="text-xs text-slate-500 mt-1">or</p>
            <button className="btn btn-secondary mt-3" onClick={() => inputRef.current?.click()}>
              Choose Files
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
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
              <p>
                {extractionState.errorCode === "resource_exhausted"
                  ? "AI receipt extraction is temporarily unavailable because the Manus API credit limit has been reached. You can still enter the expense manually."
                  : (extractionState.message || "Receipt information could not be fully verified.")}
              </p>
              {extractionState.status === "failed" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn btn-secondary text-xs"
                    onClick={() => {
                      if (extractionState.attachmentId) {
                        beginExtractionWithConfirmation(extractionState.attachmentId, true);
                      }
                    }}
                    disabled={!extractionState.attachmentId || extractReceipt.isPending}
                  >
                    Start New Extraction
                  </button>
                  <button
                    className="btn text-xs"
                    onClick={() => {
                      setExtractionState((prev) => ({
                        ...prev,
                        status: "idle",
                        message: undefined,
                        errorCode: undefined,
                      }));
                    }}
                  >
                    Continue Manually
                  </button>
                </div>
              )}
            </div>
          )}

          {extractionState.data && (
            <div className="mt-3 rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-1">Overall: {confidenceLabel(extractionState.data.overallConfidence)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Vendor: {confidenceLabel(extractionState.data.vendor.confidence)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Date: {confidenceLabel(extractionState.data.date.confidence)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">Total: {confidenceLabel(extractionState.data.total.confidence)}</span>
                {extractionState.provider && (
                  <span className="rounded-full bg-slate-100 px-2 py-1">Provider: {extractionState.provider}</span>
                )}
              </div>
            </div>
          )}

          {possibleDuplicate && (
            <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
              <p className="font-medium">Possible duplicate</p>
              <p>
                Existing expense #{possibleDuplicate.id} has the same vendor, total, and date.
              </p>
            </div>
          )}

          {extractionState.data?.suggestedJob && extractionState.data.suggestedJob.confidence >= 0.85 && extractionState.data.suggestedJob.jobId && (
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">
                Suggested job: {extractionState.data.suggestedJob.jobName} ({confidenceLabel(extractionState.data.suggestedJob.confidence)})
              </p>
              <div className="mt-2">
                <button
                  className="btn btn-secondary text-xs"
                  onClick={() => setForm((prev) => ({ ...prev, jobId: String(extractionState.data?.suggestedJob?.jobId || "") }))}
                >
                  Apply suggestion
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 mt-4">
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
              <label className="label">Subtotal</label>
              <input type="number" step="0.01" className="input" value={form.subtotal} onChange={(e) => setForm((p) => ({ ...p, subtotal: e.target.value }))} />
            </div>
            <div>
              <label className="label">Tax</label>
              <input type="number" step="0.01" className="input" value={form.tax} onChange={(e) => setForm((p) => ({ ...p, tax: e.target.value }))} />
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
              <label className="label">Payment Method</label>
              <input className="input" value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))} />
            </div>
            <div>
              <label className="label">Receipt Number</label>
              <input className="input" value={form.receiptNumber} onChange={(e) => setForm((p) => ({ ...p, receiptNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">Invoice Number</label>
              <input className="input" value={form.invoiceNumber} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as (typeof STATUS_OPTIONS)[number] }))}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Search Job</label>
              <input
                className="input"
                placeholder="Search jobs..."
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Job</label>
              <select className="input" value={form.jobId} onChange={(e) => setForm((p) => ({ ...p, jobId: e.target.value }))}>
                <option value="">Unassigned</option>
                {filteredJobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Employee</label>
              <select className="input" value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}>
                <option value="">Not set</option>
                {(metaQuery.data?.employees ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <input className="input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label className="label">Line Items</label>
              <button className="btn btn-secondary text-xs" onClick={addLineItem}>Add Line</button>
            </div>
            {lineItems.length === 0 ? (
              <p className="text-sm text-slate-500">No line items extracted yet.</p>
            ) : (
              <div className="space-y-2">
                {lineItems.map((item) => (
                  <div key={item.id} className="grid gap-2 md:grid-cols-12 rounded-md border border-slate-200 p-2">
                    <input
                      className="input md:col-span-4"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLineItems((prev) => prev.map((line) => line.id === item.id ? { ...line, description: next } : line));
                      }}
                    />
                    <input
                      className="input md:col-span-2"
                      type="number"
                      step="0.01"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLineItems((prev) => prev.map((line) => line.id === item.id ? { ...line, quantity: next } : line));
                      }}
                    />
                    <input
                      className="input md:col-span-2"
                      type="number"
                      step="0.01"
                      placeholder="Unit"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLineItems((prev) => prev.map((line) => line.id === item.id ? { ...line, unitPrice: next } : line));
                      }}
                    />
                    <input
                      className="input md:col-span-2"
                      type="number"
                      step="0.01"
                      placeholder="Total"
                      value={item.totalPrice}
                      onChange={(e) => {
                        const next = e.target.value;
                        setLineItems((prev) => prev.map((line) => line.id === item.id ? { ...line, totalPrice: next } : line));
                      }}
                    />
                    <div className="md:col-span-1 text-xs text-slate-600 flex items-center justify-center">
                      {confidenceLabel(item.confidence)}
                    </div>
                    <div className="md:col-span-1 flex items-center justify-end">
                      <button
                        className="btn btn-danger text-xs"
                        onClick={() => setLineItems((prev) => prev.filter((line) => line.id !== item.id))}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <label className="label">Attach Uploaded Receipts</label>
            {allAvailableAttachments.length === 0 ? (
              <p className="text-sm text-slate-500">No uploaded receipts available yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {allAvailableAttachments.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedAttachmentIds.includes(item.id)}
                      onChange={(e) => {
                        setSelectedAttachmentIds((prev) =>
                          e.target.checked
                            ? Array.from(new Set([...prev, item.id]))
                            : prev.filter((id) => id !== item.id)
                        );
                      }}
                    />
                    <span className="font-medium">{item.originalFilename}</span>
                    <span className="text-slate-500">({Math.round(item.sizeBytes / 1024)} KB)</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (!primaryAttachmentId) {
                  toast.error("Select a receipt attachment first.");
                  return;
                }
                beginExtractionWithConfirmation(primaryAttachmentId, false);
              }}
              disabled={extractReceipt.isPending}
            >
              Extract with AI
            </button>
            <button className="btn btn-secondary" onClick={clearExtractedData}>Clear Extracted Data</button>
            {viewReceiptHref && (
              <a className="btn btn-secondary" href={viewReceiptHref} target="_blank" rel="noreferrer">
                View Receipt
              </a>
            )}
            <button className="btn btn-primary" onClick={() => submitExpense("close")} disabled={createExpense.isPending}>
              {createExpense.isPending ? "Saving..." : "Save Expense"}
            </button>
            <button className="btn btn-primary" onClick={() => submitExpense("next")} disabled={createExpense.isPending}>
              Save and Review Next
            </button>
            <button className="btn btn-secondary" onClick={() => setShowAddExpense(false)}>Cancel</button>
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
        <table className="w-full text-sm">
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
