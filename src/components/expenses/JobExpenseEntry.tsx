"use client";

import { useRef, useState } from "react";
import { api } from "@/trpc/react";
import { toast } from "sonner";

const CATEGORIES = ["paint", "materials", "labor", "tools", "equipment", "rentals", "fuel", "subcontractor", "travel", "ferry", "payroll_related", "office", "advertising", "insurance", "vehicle", "meals", "other"] as const;
type Category = (typeof CATEGORIES)[number];

type Props = { jobId: number; jobName: string; onSaved: () => Promise<void> | void };
type UploadState = { file: File; progress: number; status: "idle" | "uploading" | "success" | "failed"; attachmentId?: number; error?: string };

export function JobExpenseEntry({ jobId, jobName, onSaved }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [reading, setReading] = useState(false);
  const [form, setForm] = useState({ vendor: "", category: "materials" as Category, amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
  const extract = api.expenses.extractReceipt.useMutation({
    onSuccess: (result) => {
      setReading(false);
      if (result.data) {
        setForm(current => ({ ...current, vendor: result.data.vendor.value ?? current.vendor, category: CATEGORIES.includes(result.data.category.value as Category) ? result.data.category.value as Category : current.category, amount: result.data.total.value == null ? current.amount : String(result.data.total.value), date: result.data.date.value ?? current.date, description: result.data.description.value ?? current.description }));
      }
      if (result.status === "failed") toast.error(result.message || "Receipt reading failed. You can enter the expense manually.");
      else toast.success(result.status === "needs_review" ? "Receipt read. Review the fields before saving." : "Receipt read successfully. Review the fields before saving.");
    },
    onError: () => { setReading(false); toast.error("Receipt reading is temporarily unavailable. You can enter the expense manually."); },
  });
  const create = api.expenses.create.useMutation({
    onSuccess: async () => { await onSaved(); setOpen(false); setUpload(null); setForm({ vendor: "", category: "materials", amount: "", date: new Date().toISOString().slice(0, 10), description: "" }); toast.success("Expense added to this Job"); },
    onError: error => toast.error(error.message || "Failed to add expense"),
  });
  const removeAttachment = api.expenses.deleteAttachment.useMutation({
    onSuccess: () => { setUpload(null); toast.success("Receipt removed"); },
    onError: error => toast.error(error.message || "Failed to remove receipt"),
  });

  function selectFile(file: File) {
    if (!file.type || !(file.type === "application/pdf" || file.type.startsWith("image/"))) { toast.error("Choose a supported image or PDF receipt."); return; }
    if (file.size > 12 * 1024 * 1024) { toast.error("Receipt must be 12MB or smaller."); return; }
    const state: UploadState = { file, progress: 0, status: "uploading" };
    setUpload(state); setOpen(true);
    const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/expenses/uploads"); xhr.withCredentials = true; xhr.upload.onprogress = event => { if (event.lengthComputable) setUpload(current => current ? { ...current, progress: Math.round(event.loaded / event.total * 100) } : current); };
    xhr.onload = () => { try { const result = JSON.parse(xhr.responseText) as { attachment?: { id: number }; error?: string }; const attachmentId = result.attachment?.id; if (xhr.status >= 200 && xhr.status < 300 && attachmentId) { setUpload(current => current ? { ...current, status: "success", progress: 100, attachmentId } : current); setReading(true); extract.mutate({ attachmentId }); } else setUpload(current => current ? { ...current, status: "failed", error: result.error || "Upload failed" } : current); } catch { setUpload(current => current ? { ...current, status: "failed", error: "Upload failed" } : current); } };
    xhr.onerror = () => setUpload(current => current ? { ...current, status: "failed", error: "Network error while uploading receipt" } : current);
    const data = new FormData(); data.append("file", file); xhr.send(data);
  }

  function save() { if (!form.vendor.trim() || !form.amount || Number(form.amount) <= 0 || !form.date || !upload?.attachmentId) { toast.error("Add a receipt, vendor, amount, and date before saving."); return; } create.mutate({ vendor: form.vendor.trim(), category: form.category, amount: Number(form.amount), expenseDate: new Date(form.date), description: form.description.trim() || undefined, jobId, attachmentIds: [upload.attachmentId] }); }

  return <>
    <button className="btn btn-primary min-h-11 w-full sm:w-auto" type="button" onClick={() => setOpen(true)}>+ Add Receipt / Expense</button>
    {open && <section className="mt-4 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-brand-200 bg-brand-50/40 p-4" aria-label="Add receipt or expense">
      <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Add Receipt / Expense</h3><p className="mt-1 text-sm text-slate-600">Job: <span className="font-medium text-slate-900">{jobName}</span></p></div><button type="button" className="btn btn-secondary min-h-11" onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" className="btn btn-primary min-h-12 w-full min-w-0" onClick={() => cameraInput.current?.click()}>Take Photo</button><button type="button" className="btn btn-secondary min-h-12 w-full min-w-0" onClick={() => fileInput.current?.click()}>Choose Photo or PDF</button></div>
      <input ref={cameraInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={event => { const file = event.target.files?.[0]; if (file) selectFile(file); event.currentTarget.value = ""; }} />
      <input ref={fileInput} className="hidden" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*" onChange={event => { const file = event.target.files?.[0]; if (file) selectFile(file); event.currentTarget.value = ""; }} />
      {upload && <div className="mt-3 rounded-md border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{upload.file.name}</span><span>{upload.status === "uploading" ? `${upload.progress}%` : upload.status === "success" ? "Attached" : "Failed"}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600" style={{ width: `${upload.progress}%` }} /></div>{upload.error && <p className="mt-2 text-sm text-red-600">{upload.error}</p>}{reading && <p className="mt-2 text-sm text-brand-700">Reading receipt with AI...</p>}{upload.attachmentId && <div className="mt-3 flex flex-wrap items-center gap-2"><a className="btn btn-secondary min-h-11 text-xs" href={`/api/expenses/attachments/${upload.attachmentId}/preview`} target="_blank" rel="noreferrer">View Receipt</a><button className="btn btn-secondary min-h-11 text-xs" type="button" disabled={removeAttachment.isPending} onClick={() => removeAttachment.mutate({ id: upload.attachmentId! })}>Remove / Change</button></div>}</div>}
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3"><label className="label min-w-0">Vendor<input className="input mt-1 min-h-11 w-full min-w-0" value={form.vendor} onChange={event => setForm(current => ({ ...current, vendor: event.target.value }))} /></label><label className="label min-w-0">Category<select className="input mt-1 min-h-11 w-full min-w-0" value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value as Category }))}>{CATEGORIES.map(category => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label><label className="label min-w-0">Amount<input className="input mt-1 min-h-11 w-full min-w-0" type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></label><label className="label min-w-0">Date<input className="input mt-1 min-h-11 w-full min-w-0" type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></label><label className="label min-w-0">Description<input className="input mt-1 min-h-11 w-full min-w-0" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label></div>
      <div className="mt-4 flex gap-2"><button className="btn btn-primary min-h-12 flex-1" type="button" disabled={create.isPending || reading || !upload?.attachmentId} onClick={save}>{create.isPending ? "Saving..." : "Add Expense"}</button><button className="btn btn-secondary min-h-12 flex-1" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
    </section>}
  </>;
}
