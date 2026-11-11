export const PAYMENT_METHODS = ["check", "cash", "credit_card", "bank_transfer", "other"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceStatusValue = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
export type InvoiceSchedulePreset = "50_30_20" | "40_40_20" | "custom";

const SCHEDULES: Record<Exclude<InvoiceSchedulePreset, "custom">, Array<{ description: string; percent: number }>> = {
  "50_30_20": [
    { description: "Start payment (50%)", percent: 50 },
    { description: "Progress payment (30%)", percent: 30 },
    { description: "Completion payment (20%)", percent: 20 },
  ],
  "40_40_20": [
    { description: "Start payment (40%)", percent: 40 },
    { description: "Progress payment (40%)", percent: 40 },
    { description: "Completion payment (20%)", percent: 20 },
  ],
};

export function toCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Amount must be a finite number.");
  return Math.round(value * 100);
}

export function fromCents(value: number): number {
  return value / 100;
}

export function createInvoiceSchedule(total: number, preset: Exclude<InvoiceSchedulePreset, "custom">): InvoiceLineInput[] {
  const totalCents = toCents(total);
  if (totalCents <= 0) throw new Error("Project total must be greater than zero.");

  let allocatedCents = 0;
  return SCHEDULES[preset].map((installment, index, schedule) => {
    const amountCents = index === schedule.length - 1
      ? totalCents - allocatedCents
      : Math.round((totalCents * installment.percent) / 100);
    allocatedCents += amountCents;
    return { description: installment.description, quantity: 1, unitPrice: fromCents(amountCents) };
  });
}

export function calculateInvoiceTotals(lineItems: InvoiceLineInput[], taxPercent: number) {
  if (lineItems.length === 0) throw new Error("At least one invoice line item is required.");
  if (!Number.isFinite(taxPercent) || taxPercent < 0) throw new Error("Tax percent cannot be negative.");

  const normalizedLineItems = lineItems.map((lineItem) => {
    const description = lineItem.description.trim();
    if (!description) throw new Error("Each invoice line item needs a description.");
    if (!Number.isFinite(lineItem.quantity) || lineItem.quantity <= 0) throw new Error("Line item quantity must be greater than zero.");
    if (!Number.isFinite(lineItem.unitPrice) || lineItem.unitPrice < 0) throw new Error("Line item unit price cannot be negative.");

    const totalPriceCents = Math.round(lineItem.quantity * toCents(lineItem.unitPrice));
    return { ...lineItem, description, totalPrice: fromCents(totalPriceCents), totalPriceCents };
  });

  const subtotalCents = normalizedLineItems.reduce((sum, lineItem) => sum + lineItem.totalPriceCents, 0);
  if (subtotalCents <= 0) throw new Error("Invoice total must be greater than zero.");
  const taxCents = Math.round((subtotalCents * taxPercent) / 100);
  const totalCents = subtotalCents + taxCents;

  return {
    lineItems: normalizedLineItems.map(({ totalPriceCents: _totalPriceCents, ...lineItem }) => lineItem),
    subtotal: fromCents(subtotalCents),
    tax: fromCents(taxCents),
    total: fromCents(totalCents),
  };
}

export function calculateInvoicePaymentState(
  total: number,
  paid: number,
  unpaidStatus: InvoiceStatusValue,
): { amountPaid: number; amountRemaining: number; status: InvoiceStatusValue } {
  const totalCents = toCents(total);
  const paidCents = toCents(paid);
  if (paidCents > totalCents) throw new Error("Payment would exceed the invoice balance.");

  const remainingCents = Math.max(0, totalCents - paidCents);
  const status = remainingCents <= 0 ? "paid" : paidCents > 0 ? "partial" : unpaidStatus;
  return { amountPaid: fromCents(paidCents), amountRemaining: fromCents(remainingCents), status };
}

export function unpaidInvoiceStatus(
  invoice: { status: InvoiceStatusValue; sentAt?: Date | null; dueDate?: Date | null },
  now = new Date(),
): InvoiceStatusValue {
  if (invoice.status === "cancelled" || invoice.status === "draft") return invoice.status;
  if ((invoice.status === "partial" || invoice.status === "paid") && !invoice.sentAt) return "draft";
  if (invoice.status === "overdue" && (!invoice.dueDate || invoice.dueDate < now)) return "overdue";
  return invoice.dueDate && invoice.dueDate < now ? "overdue" : "sent";
}

export function validatePaymentTarget(
  jobExists: boolean,
  invoice: { jobId: number } | null,
  jobId: number,
  invoiceWasSupplied: boolean,
): void {
  if (!jobExists) throw new Error("Job not found.");
  if (invoiceWasSupplied && !invoice) throw new Error("Invoice not found.");
  if (invoice && invoice.jobId !== jobId) throw new Error("Invoice does not belong to this job.");
}
