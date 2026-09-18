"use client";

import { useState } from "react";
import { Download, Plus, Printer, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  calculateInvoiceTotals,
  createInvoiceSchedule,
  PAYMENT_METHODS,
  type InvoiceLineInput,
  type InvoiceSchedulePreset,
  type PaymentMethodValue,
} from "@/lib/invoice-calculations";

type InvoiceForm = {
  id?: number;
  title: string;
  dueDate: string;
  taxPercent: number;
  notes: string;
  lineItems: InvoiceLineInput[];
};

type PaymentForm = {
  invoiceId: number | null;
  amount: number;
  dateReceived: string;
  method: PaymentMethodValue;
  checkNumber: string;
  bank: string;
  memo: string;
  notes: string;
};

type Props = {
  jobId: number;
  jobName: string;
  contractAmount: number;
  totalEstimate: number;
  actualCosts: number;
  grossProfit: number;
  marginPercent: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const blankLine = (): InvoiceLineInput => ({ description: "Project payment", quantity: 1, unitPrice: 0 });

export function JobFinancials({ jobId, jobName, contractAmount, totalEstimate, actualCosts, grossProfit, marginPercent }: Props) {
  const utils = api.useUtils();
  const invoices = api.invoices.byJob.useQuery({ jobId });
  const payments = api.payments.list.useQuery({ jobId });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [schedule, setSchedule] = useState<InvoiceSchedulePreset>("50_30_20");
  const projectTotal = contractAmount > 0 ? contractAmount : totalEstimate;
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>({ title: jobName, dueDate: "", taxPercent: 0, notes: "", lineItems: [blankLine()] });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ invoiceId: null, amount: 0, dateReceived: today(), method: "check", checkNumber: "", bank: "", memo: "", notes: "" });

  const refreshFinancials = async () => {
    await Promise.all([
      utils.jobs.byId.invalidate({ id: jobId }),
      utils.invoices.byJob.invalidate({ jobId }),
      utils.invoices.list.invalidate(),
      utils.payments.list.invalidate({ jobId }),
    ]);
  };
  const createInvoice = api.invoices.create.useMutation({
    onSuccess: async () => { await refreshFinancials(); setInvoiceOpen(false); toast.success("Invoice created"); },
    onError: (error) => toast.error(error.message),
  });
  const updateInvoice = api.invoices.update.useMutation({
    onSuccess: async () => { await refreshFinancials(); setInvoiceOpen(false); toast.success("Invoice updated"); },
    onError: (error) => toast.error(error.message),
  });
  const setInvoiceStatus = api.invoices.setStatus.useMutation({
    onSuccess: async () => { await refreshFinancials(); toast.success("Invoice marked sent"); },
    onError: (error) => toast.error(error.message),
  });
  const recordPayment = api.payments.create.useMutation({
    onSuccess: async () => { await refreshFinancials(); setPaymentOpen(false); toast.success("Payment recorded"); },
    onError: (error) => toast.error(error.message),
  });
  const removePayment = api.payments.remove.useMutation({
    onSuccess: async () => { await refreshFinancials(); toast.success("Payment removed"); },
    onError: (error) => toast.error(error.message),
  });

  const invoiceTotal = invoices.data?.reduce((sum, invoice) => sum + Number(invoice.total), 0) ?? 0;
  const receivedTotal = payments.data?.reduce((sum, payment) => payment.status === "bounced" ? sum : sum + Number(payment.amount), 0) ?? 0;
  const stillOwed = Math.max(0, projectTotal - receivedTotal);
  let preview = { subtotal: 0, tax: 0, total: 0 };
  let previewError = "";
  try {
    preview = calculateInvoiceTotals(invoiceForm.lineItems, invoiceForm.taxPercent);
  } catch (error) {
    previewError = error instanceof Error ? error.message : "Invoice details are invalid.";
  }

  const openCreateInvoice = () => {
    const preset = "50_30_20" as const;
    setSchedule(preset);
    setInvoiceForm({
      title: jobName,
      dueDate: "",
      taxPercent: 0,
      notes: "",
      lineItems: projectTotal > 0 ? createInvoiceSchedule(projectTotal, preset) : [blankLine()],
    });
    setInvoiceOpen(true);
  };
  const applySchedule = (preset: InvoiceSchedulePreset) => {
    setSchedule(preset);
    if (preset !== "custom" && projectTotal > 0) {
      setInvoiceForm((form) => ({ ...form, lineItems: createInvoiceSchedule(projectTotal, preset) }));
    }
  };
  const openEditInvoice = (invoice: NonNullable<typeof invoices.data>[number]) => {
    const subtotal = Number(invoice.subtotal);
    setSchedule("custom");
    setInvoiceForm({
      id: invoice.id,
      title: invoice.title,
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : "",
      taxPercent: subtotal > 0 ? (Number(invoice.tax) / subtotal) * 100 : 0,
      notes: invoice.notes || "",
      lineItems: invoice.lineItems.map((lineItem) => ({
        description: lineItem.description,
        quantity: Number(lineItem.quantity),
        unitPrice: Number(lineItem.unitPrice),
      })),
    });
    setInvoiceOpen(true);
  };
  const openRecordPayment = () => {
    const openInvoice = invoices.data?.find((invoice) => Number(invoice.amountRemaining) > 0);
    setPaymentForm({
      invoiceId: openInvoice?.id ?? null,
      amount: openInvoice ? Math.max(0, Number(openInvoice.amountRemaining)) : 0,
      dateReceived: today(),
      method: "check",
      checkNumber: "",
      bank: "",
      memo: "",
      notes: "",
    });
    setPaymentOpen(true);
  };
  const submitInvoice = () => {
    const input = {
      title: invoiceForm.title,
      dueDate: invoiceForm.dueDate ? new Date(`${invoiceForm.dueDate}T12:00:00`) : null,
      taxPercent: invoiceForm.taxPercent,
      notes: invoiceForm.notes || undefined,
      lineItems: invoiceForm.lineItems,
    };
    if (invoiceForm.id) updateInvoice.mutate({ id: invoiceForm.id, ...input });
    else createInvoice.mutate({ jobId, ...input });
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Financial Summary</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <FinancialStat label="Total contract" value={formatCurrency(projectTotal)} />
          <FinancialStat label="Invoiced" value={formatCurrency(invoiceTotal)} />
          <FinancialStat label="Received" value={formatCurrency(receivedTotal)} />
          <FinancialStat label="Still owed" value={formatCurrency(stillOwed)} />
          <FinancialStat label="Actual costs" value={formatCurrency(actualCosts)} />
          <FinancialStat label="Gross profit" value={formatCurrency(grossProfit)} />
          <FinancialStat label="Net profit" value={formatCurrency(grossProfit)} />
          <FinancialStat label="Margin / ROI" value={`${marginPercent.toFixed(1)}%`} />
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">Invoices</h2><p className="text-xs text-slate-500">Create, edit, and print job invoices here.</p></div>
          <button type="button" className="btn btn-primary" onClick={openCreateInvoice}><Plus className="mr-1 h-4 w-4" /> Create Invoice</button>
        </div>
        {invoices.isLoading ? <p className="text-sm text-slate-500">Loading invoices…</p> : invoices.data?.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.data?.map((invoice) => (
              <div key={invoice.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{invoice.invoiceNumber}</span><strong>{invoice.title}</strong><span className="badge bg-slate-100 text-slate-700 capitalize">{invoice.status}</span></div>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <span>Total <strong>{formatCurrency(Number(invoice.total))}</strong></span>
                    <span>Received <strong>{formatCurrency(Number(invoice.amountPaid))}</strong></span>
                    <span>Remaining <strong>{formatCurrency(Math.max(0, Number(invoice.amountRemaining)))}</strong></span>
                    <span>Due <strong>{invoice.dueDate ? formatDate(invoice.dueDate) : "Not set"}</strong></span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {invoice.status === "draft" && <button type="button" className="btn btn-secondary" onClick={() => setInvoiceStatus.mutate({ id: invoice.id, status: "sent" })}><Send className="mr-1 h-4 w-4" /> Mark Sent</button>}
                  <a className="btn btn-secondary" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer"><Printer className="mr-1 h-4 w-4" /> Print PDF</a>
                  <a className="btn btn-secondary" href={`/api/invoices/${invoice.id}/pdf?download=1`}><Download className="mr-1 h-4 w-4" /> Download PDF</a>
                  <button type="button" className="btn btn-secondary" onClick={() => openEditInvoice(invoice)}>Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">Payments</h2><p className="text-xs text-slate-500">Payments linked to an invoice update its balance automatically.</p></div>
          <button type="button" className="btn btn-primary" onClick={openRecordPayment}><Plus className="mr-1 h-4 w-4" /> Record Payment</button>
        </div>
        {payments.isLoading ? <p className="text-sm text-slate-500">Loading payments…</p> : payments.data?.length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Received</th><th>Invoice</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{payments.data?.map((payment) => (
            <tr key={payment.id}><td className="py-3">{formatDate(payment.dateReceived)}</td><td>{payment.invoice?.invoiceNumber || "Unapplied"}</td><td className="capitalize">{payment.method.replaceAll("_", " ")}</td><td>{payment.checkNumber || payment.memo || "—"}</td><td className="text-right font-medium">{formatCurrency(Number(payment.amount))}</td><td className="text-right"><button type="button" className="p-2 text-rose-600" title="Remove payment" onClick={() => { if (window.confirm("Remove this payment?")) removePayment.mutate({ id: payment.id }); }}><Trash2 className="h-4 w-4" /></button></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      {invoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-6 py-4"><h2 className="text-lg font-semibold">{invoiceForm.id ? "Edit Invoice" : "Create Invoice"}</h2><button type="button" onClick={() => setInvoiceOpen(false)}>Close</button></div>
            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <div className="grid gap-4 sm:grid-cols-3"><div className="sm:col-span-2"><label className="label">Invoice title</label><input className="input" value={invoiceForm.title} onChange={(event) => setInvoiceForm((form) => ({ ...form, title: event.target.value }))} /></div><div><label className="label">Due date</label><input className="input" type="date" value={invoiceForm.dueDate} onChange={(event) => setInvoiceForm((form) => ({ ...form, dueDate: event.target.value }))} /></div></div>
              {!invoiceForm.id && <div><label className="label">Payment schedule</label><div className="flex flex-wrap gap-2">{(["50_30_20", "40_40_20", "custom"] as InvoiceSchedulePreset[]).map((preset) => <button key={preset} type="button" className={`btn ${schedule === preset ? "btn-primary" : "btn-secondary"}`} onClick={() => applySchedule(preset)}>{preset === "50_30_20" ? "50% Start / 30% Progress / 20% Completion" : preset === "40_40_20" ? "40% Start / 40% Progress / 20% Completion" : "Custom"}</button>)}</div></div>}
              <div className="space-y-2"><div className="grid grid-cols-[1fr_80px_120px_40px] gap-2 text-xs font-medium text-slate-500"><span>Description</span><span>Quantity</span><span>Unit price</span><span /></div>{invoiceForm.lineItems.map((lineItem, index) => <div key={index} className="grid grid-cols-[1fr_80px_120px_40px] gap-2"><input className="input" value={lineItem.description} onChange={(event) => setInvoiceForm((form) => ({ ...form, lineItems: form.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) }))} /><input className="input" type="number" min="0.01" step="0.01" value={lineItem.quantity} onChange={(event) => setInvoiceForm((form) => ({ ...form, lineItems: form.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item) }))} /><input className="input" type="number" min="0" step="0.01" value={lineItem.unitPrice} onChange={(event) => setInvoiceForm((form) => ({ ...form, lineItems: form.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: Number(event.target.value) } : item) }))} /><button type="button" title="Remove line item" onClick={() => setInvoiceForm((form) => ({ ...form, lineItems: form.lineItems.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4 text-rose-600" /></button></div>)}</div>
              <button type="button" className="btn btn-secondary" onClick={() => setInvoiceForm((form) => ({ ...form, lineItems: [...form.lineItems, blankLine()] }))}><Plus className="mr-1 h-4 w-4" /> Add line item</button>
              <div className="grid gap-4 sm:grid-cols-3"><div><label className="label">Tax percent</label><input className="input" type="number" min="0" step="0.01" value={invoiceForm.taxPercent} onChange={(event) => setInvoiceForm((form) => ({ ...form, taxPercent: Number(event.target.value) }))} /></div><div className="sm:col-span-2"><label className="label">Notes</label><textarea className="input min-h-20" value={invoiceForm.notes} onChange={(event) => setInvoiceForm((form) => ({ ...form, notes: event.target.value }))} /></div></div>
              <div className="ml-auto grid max-w-sm grid-cols-2 gap-2 border-t pt-4 text-sm"><span>Subtotal</span><strong className="text-right">{formatCurrency(preview.subtotal)}</strong><span>Tax</span><strong className="text-right">{formatCurrency(preview.tax)}</strong><span className="text-base">Total</span><strong className="text-right text-base">{formatCurrency(preview.total)}</strong>{invoiceForm.id && <><span>Paid</span><strong className="text-right">{formatCurrency(Number(invoices.data?.find((invoice) => invoice.id === invoiceForm.id)?.amountPaid ?? 0))}</strong><span>Remaining</span><strong className="text-right">{formatCurrency(Math.max(0, preview.total - Number(invoices.data?.find((invoice) => invoice.id === invoiceForm.id)?.amountPaid ?? 0)))}</strong></>}</div>
              {previewError && <p className="text-sm text-rose-600">{previewError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4"><button type="button" className="btn btn-secondary" onClick={() => setInvoiceOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={Boolean(previewError) || createInvoice.isPending || updateInvoice.isPending} onClick={submitInvoice}>Save Invoice</button></div>
          </div>
        </div>
      )}

      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="card w-full max-w-2xl"><div className="border-b px-6 py-4"><h2 className="text-lg font-semibold">Record Payment</h2></div><div className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Invoice</label><select className="input" value={paymentForm.invoiceId ?? ""} onChange={(event) => { const invoiceId = event.target.value ? Number(event.target.value) : null; const invoice = invoices.data?.find((item) => item.id === invoiceId); setPaymentForm((form) => ({ ...form, invoiceId, amount: invoice ? Math.max(0, Number(invoice.amountRemaining)) : form.amount })); }}><option value="">Unapplied to invoice</option>{invoices.data?.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.title} · {formatCurrency(Math.max(0, Number(invoice.amountRemaining)))} remaining</option>)}</select></div>
          <div><label className="label">Amount</label><input className="input" type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((form) => ({ ...form, amount: Number(event.target.value) }))} /></div><div><label className="label">Date received</label><input className="input" type="date" value={paymentForm.dateReceived} onChange={(event) => setPaymentForm((form) => ({ ...form, dateReceived: event.target.value }))} /></div>
          <div><label className="label">Method</label><select className="input" value={paymentForm.method} onChange={(event) => setPaymentForm((form) => ({ ...form, method: event.target.value as PaymentMethodValue }))}>{PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></div><div><label className="label">Check number</label><input className="input" value={paymentForm.checkNumber} onChange={(event) => setPaymentForm((form) => ({ ...form, checkNumber: event.target.value }))} /></div><div><label className="label">Bank</label><input className="input" value={paymentForm.bank} onChange={(event) => setPaymentForm((form) => ({ ...form, bank: event.target.value }))} /></div><div><label className="label">Memo</label><input className="input" value={paymentForm.memo} onChange={(event) => setPaymentForm((form) => ({ ...form, memo: event.target.value }))} /></div><div className="sm:col-span-2"><label className="label">Notes</label><textarea className="input min-h-20" value={paymentForm.notes} onChange={(event) => setPaymentForm((form) => ({ ...form, notes: event.target.value }))} /></div>
        </div><div className="flex justify-end gap-2 border-t px-6 py-4"><button type="button" className="btn btn-secondary" onClick={() => setPaymentOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={paymentForm.amount <= 0 || recordPayment.isPending} onClick={() => recordPayment.mutate({ jobId, invoiceId: paymentForm.invoiceId ?? undefined, amount: paymentForm.amount, dateReceived: new Date(`${paymentForm.dateReceived}T12:00:00`), method: paymentForm.method, checkNumber: paymentForm.checkNumber || undefined, bank: paymentForm.bank || undefined, memo: paymentForm.memo || undefined, notes: paymentForm.notes || undefined })}>Record Payment</button></div></div></div>
      )}
    </div>
  );
}

function FinancialStat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="font-semibold text-slate-900">{value}</div></div>;
}
