import { describe, expect, it } from "vitest";
import {
  calculateInvoicePaymentState,
  calculateInvoiceTotals,
  createInvoiceSchedule,
  unpaidInvoiceStatus,
  validatePaymentTarget,
} from "./invoice-calculations";

describe("invoice schedules", () => {
  it("creates an exact 50/30/20 schedule", () => {
    const schedule = createInvoiceSchedule(10_000, "50_30_20");
    expect(schedule.map((item) => item.unitPrice)).toEqual([5_000, 3_000, 2_000]);
    expect(schedule.reduce((sum, item) => sum + item.unitPrice, 0)).toBe(10_000);
  });

  it("creates an exact 40/40/20 schedule", () => {
    const schedule = createInvoiceSchedule(10_000, "40_40_20");
    expect(schedule.map((item) => item.unitPrice)).toEqual([4_000, 4_000, 2_000]);
    expect(schedule.reduce((sum, item) => sum + item.unitPrice, 0)).toBe(10_000);
  });

  it("assigns rounding remainder to the final installment", () => {
    const schedule = createInvoiceSchedule(100.01, "50_30_20");
    expect(schedule.map((item) => item.unitPrice)).toEqual([50.01, 30, 20]);
    expect(schedule.reduce((sum, item) => Math.round((sum + item.unitPrice) * 100) / 100, 0)).toBe(100.01);
  });
});

describe("invoice totals", () => {
  it("calculates line totals, subtotal, tax, and total server-side in cents", () => {
    expect(calculateInvoiceTotals([
      { description: "Prep", quantity: 2, unitPrice: 125.25 },
      { description: "Paint", quantity: 1, unitPrice: 49.99 },
    ], 6.25)).toEqual({
      lineItems: [
        { description: "Prep", quantity: 2, unitPrice: 125.25, totalPrice: 250.5 },
        { description: "Paint", quantity: 1, unitPrice: 49.99, totalPrice: 49.99 },
      ],
      subtotal: 300.49,
      tax: 18.78,
      total: 319.27,
    });
  });

  it("rejects empty and zero-value invoices", () => {
    expect(() => calculateInvoiceTotals([], 0)).toThrow("At least one");
    expect(() => calculateInvoiceTotals([{ description: "Empty", quantity: 1, unitPrice: 0 }], 0)).toThrow("greater than zero");
  });
});

describe("invoice payment state", () => {
  it("marks partial and full payments correctly", () => {
    expect(calculateInvoicePaymentState(500, 125, "sent")).toEqual({ amountPaid: 125, amountRemaining: 375, status: "partial" });
    expect(calculateInvoicePaymentState(500, 500, "sent")).toEqual({ amountPaid: 500, amountRemaining: 0, status: "paid" });
  });

  it("recalculates removal to the preserved unpaid status", () => {
    const sentAt = new Date("2026-01-01T00:00:00Z");
    expect(unpaidInvoiceStatus({ status: "paid", sentAt })).toBe("sent");
    expect(calculateInvoicePaymentState(500, 0, unpaidInvoiceStatus({ status: "paid", sentAt }))).toEqual({
      amountPaid: 0,
      amountRemaining: 500,
      status: "sent",
    });
    expect(unpaidInvoiceStatus({ status: "partial", sentAt: null })).toBe("draft");
    expect(unpaidInvoiceStatus({ status: "overdue" })).toBe("overdue");
    expect(unpaidInvoiceStatus({ status: "sent", sentAt, dueDate: new Date("2025-12-31T00:00:00Z") }, new Date("2026-01-01T00:00:00Z"))).toBe("overdue");
  });

  it("rejects overpayment", () => {
    expect(() => calculateInvoicePaymentState(500, 500.01, "sent")).toThrow("exceed");
  });
});

describe("payment target validation", () => {
  it("rejects an invoice from another job", () => {
    expect(() => validatePaymentTarget(true, { jobId: 2 }, 1, true)).toThrow("does not belong");
  });

  it("rejects missing jobs and invoices", () => {
    expect(() => validatePaymentTarget(false, null, 1, false)).toThrow("Job not found");
    expect(() => validatePaymentTarget(true, null, 1, true)).toThrow("Invoice not found");
  });
});
