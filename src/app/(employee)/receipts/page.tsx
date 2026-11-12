"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/trpc/react";
import { startOfBusinessDayInMassachusetts } from "@/lib/employee-rate-resolver";
import { toast } from "sonner";
import { ArrowLeft, Camera, CheckCircle2, LoaderCircle, ReceiptText } from "lucide-react";

const CATEGORY_OPTIONS = [
  "paint", "materials", "labor", "tools", "equipment", "rentals", "fuel",
  "subcontractor", "travel", "ferry", "payroll_related", "office",
  "advertising", "insurance", "vehicle", "meals", "other",
] as const;

type Category = (typeof CATEGORY_OPTIONS)[number];
type Attachment = { id: number; originalFilename: string; mimeType: string; sizeBytes: number };
type ExtractedValue<T> = { value: T | null; confidence: number };
type ReceiptData = {
  vendor: ExtractedValue<string>;
  date: ExtractedValue<string>;
  total: ExtractedValue<number>;
  category: ExtractedValue<string>;
  description: ExtractedValue<string>;
  rawText: string | null;
  overallConfidence: number;
};

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isCategory(value: string | null | undefined): value is Category {
  return Boolean(value && CATEGORY_OPTIONS.includes(value as Category));
}

function categoryLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EmployeeReceiptsPage() {
  const utils = api.useUtils();
  const fileInput = useRef<HTMLInputElement>(null);
  const metaQuery = api.expenses.meta.useQuery();
  const meQuery = api.auth.me.useQuery();
  const extractReceipt = api.expenses.extractReceipt.useMutation();
  const createExpense = api.expenses.create.useMutation({
    onSuccess: async () => {
      toast.success("Receipt submitted for review");
      await Promise.all([
        utils.expenses.meta.invalidate(),
        utils.expenses.stats.invalidate(),
        utils.expenses.list.invalidate(),
      ]);
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const [file, setFile] = useState<File | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState("");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [form, setForm] = useState({
    jobId: "",
    vendor: "",
    expenseDate: todayInput(),
    amount: "",
    category: "materials" as Category,
    description: "",
    paymentMethod: "",
  });

  function resetForm() {
    setFile(null);
    setAttachment(null);
    setUploading(false);
    setExtracting(false);
    setMessage("");
    setReceiptData(null);
    setForm({
      jobId: "",
      vendor: "",
      expenseDate: todayInput(),
      amount: "",
      category: "materials",
      description: "",
      paymentMethod: "",
    });
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleFile(fileToUpload?: File) {
    if (!fileToUpload) return;
    setFile(fileToUpload);
    setAttachment(null);
    setReceiptData(null);
    setMessage("Uploading receipt…");
    setUploading(true);
    const body = new FormData();
    body.append("file", fileToUpload);

    try {
      const response = await fetch("/api/expenses/uploads", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || !result.attachment?.id) {
        throw new Error(result.error || "Receipt upload failed.");
      }

      const uploaded = result.attachment as Attachment;
      setAttachment(uploaded);
      setUploading(false);
      setExtracting(true);
      setMessage("Reading receipt details…");

      try {
        const extracted = await extractReceipt.mutateAsync({ attachmentId: uploaded.id });
        if (extracted.data) {
          const data = extracted.data as ReceiptData;
          setReceiptData(data);
          setForm((current) => ({
            ...current,
            vendor: data.vendor.value ?? current.vendor,
            expenseDate: data.date.value ?? current.expenseDate,
            amount: data.total.value == null ? current.amount : String(data.total.value),
            category: isCategory(data.category.value) ? data.category.value : current.category,
            description: data.description.value ?? current.description,
          }));
        }
        setMessage(extracted.message || "Check the details below before submitting.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Receipt reading failed. Enter the details manually.");
      } finally {
        setExtracting(false);
      }
    } catch (error) {
      setUploading(false);
      setMessage(error instanceof Error ? error.message : "Receipt upload failed.");
      toast.error(error instanceof Error ? error.message : "Receipt upload failed.");
    }
  }

  function submitReceipt() {
    const amount = Number(form.amount);
    if (!attachment) return toast.error("Upload a receipt first.");
    if (!form.jobId) return toast.error("Choose the job this purchase belongs to.");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter the receipt total.");
    if (!form.description.trim()) return toast.error("Enter what the purchase was for.");

    createExpense.mutate({
      vendor: form.vendor.trim() || undefined,
      expenseDate: startOfBusinessDayInMassachusetts(form.expenseDate),
      description: form.description.trim(),
      amount,
      category: form.category,
      paymentMethod: form.paymentMethod.trim() || undefined,
      jobId: Number(form.jobId),
      notes: "Submitted from employee mobile receipt upload.",
      status: "pending",
      attachmentIds: [attachment.id],
      extractedRawText: receiptData?.rawText || undefined,
      extractedStructured: receiptData || undefined,
      extractedConfidence: receiptData?.overallConfidence,
      lineItems: [],
    });
  }

  const jobs = metaQuery.data?.jobs ?? [];
  const readyToSubmit = Boolean(
    attachment
    && form.jobId
    && form.description.trim()
    && Number(form.amount) > 0
    && !uploading
    && !extracting
    && !createExpense.isPending
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-slate-50 px-4 py-5">
      <Link href="/clock" className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        Back to time clock
      </Link>

      <header className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><ReceiptText className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Submit a receipt</h1>
            <p className="mt-1 text-sm text-slate-600">Take a photo or choose a receipt. Check the details before sending.</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-2 block text-sm font-semibold text-slate-700">Job</label>
        <select
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"
          value={form.jobId}
          onChange={(event) => setForm((current) => ({ ...current, jobId: event.target.value }))}
          disabled={uploading || extracting || createExpense.isPending}
        >
          <option value="">Choose the job for this purchase</option>
          {jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}
        </select>
        {metaQuery.isLoading && <p className="mt-2 text-sm text-slate-500">Loading jobs…</p>}
        {metaQuery.isError && <p className="mt-2 text-sm text-red-700">Jobs could not be loaded. Reload this page and try again.</p>}
        {!metaQuery.isLoading && !jobs.length && <p className="mt-2 text-sm text-amber-700">No jobs are available to choose from.</p>}

        <div className="mt-5">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Receipt photo or file</label>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,.pdf,application/pdf"
            capture="environment"
            className="sr-only"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            disabled={uploading || extracting || createExpense.isPending}
          />
          <button
            type="button"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-base font-semibold text-blue-800"
            onClick={() => fileInput.current?.click()}
            disabled={uploading || extracting || createExpense.isPending}
          >
            {uploading || extracting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {uploading ? "Uploading…" : extracting ? "Reading receipt…" : file ? "Choose a different receipt" : "Take photo or choose file"}
          </button>
          {file && <p className="mt-2 break-all text-sm text-slate-600">{file.name}</p>}
          {message && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {message}
              {receiptData && <span className="mt-1 block text-xs text-slate-500">Review the extracted fields before submitting.</span>}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Purchase details</h2>
        <p className="mt-1 text-sm text-slate-600">Submitted by {meQuery.data?.name ?? "you"}. Expenses are sent as pending for review.</p>

        <div className="mt-4 grid gap-4">
          <label className="block text-sm font-semibold text-slate-700">
            Vendor
            <input className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Date
              <input type="date" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" value={form.expenseDate} onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Total
              <input type="number" inputMode="decimal" min="0.01" step="0.01" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Category
            <select className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-normal" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as Category }))}>
              {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            What was purchased?
            <textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-3 text-base font-normal" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Payment method (optional)
            <input className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-normal" value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} />
          </label>
        </div>
      </section>

      <button
        type="button"
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-base font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
        onClick={submitReceipt}
        disabled={!readyToSubmit}
      >
        {createExpense.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        {createExpense.isPending ? "Submitting…" : "Submit receipt"}
      </button>
    </main>
  );
}
