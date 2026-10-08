import { describe, expect, it } from "vitest";
import { getLeadBusinessDate } from "./lead-business-date";
import { jobCanonicalTotal } from "./job-total";
import { calculateInvoicePaymentState } from "./invoice-calculations";

describe("lead business date", () => {
  it("uses leadReceivedAt when present so a backdated lead lands in the correct month", () => {
    const date = getLeadBusinessDate({ leadReceivedAt: "2026-08-15T00:00:00Z", createdAt: new Date("2026-09-01T00:00:00Z") });
    expect(date.getUTCMonth()).toBe(7); // August
  });

  it("falls back to createdAt for legacy records with no business date", () => {
    const date = getLeadBusinessDate({ leadReceivedAt: null, createdAt: new Date("2026-08-15T00:00:00Z") });
    expect(date.getUTCMonth()).toBe(7);
  });

  it("editing leadReceivedAt moves the lead between months", () => {
    const original = getLeadBusinessDate({ leadReceivedAt: "2026-08-15T00:00:00Z", createdAt: new Date("2026-09-01T00:00:00Z") });
    const updated = getLeadBusinessDate({ leadReceivedAt: "2026-07-10T00:00:00Z", createdAt: new Date("2026-09-01T00:00:00Z") });
    expect(original.getUTCMonth()).toBe(7);
    expect(updated.getUTCMonth()).toBe(6);
  });
});

describe("payment business date", () => {
  it("uses dateReceived for monthly revenue grouping, never createdAt", () => {
    const paymentDate = new Date("2026-08-15T00:00:00Z");
    const createdAt = new Date("2026-09-01T00:00:00Z");
    expect(paymentDate.getUTCMonth()).toBe(7);
    expect(createdAt.getUTCMonth()).toBe(8);
  });
});

describe("canonical job total", () => {
  it("returns contractAmount when it is positive", () => {
    expect(jobCanonicalTotal({ contractAmount: 2800, totalEstimate: 0 })).toBe(2800);
  });

  it("returns totalEstimate when contractAmount is zero or negative", () => {
    expect(jobCanonicalTotal({ contractAmount: 0, totalEstimate: 2800 })).toBe(2800);
    expect(jobCanonicalTotal({ contractAmount: null, totalEstimate: "2800" })).toBe(2800);
  });

  it("matches the detail-page rule used for job 257", () => {
    const job = { contractAmount: 2800, totalEstimate: 0 };
    expect(jobCanonicalTotal(job)).toBe(2800);
  });
});

describe("payment edit invoice recalculation", () => {
  it("recalculates partial status when amount changes", () => {
    const state = calculateInvoicePaymentState(1000, 250, "sent");
    expect(state).toEqual({ amountPaid: 250, amountRemaining: 750, status: "partial" });
  });

  it("recalculates paid status when payment is edited to cover the full invoice", () => {
    const state = calculateInvoicePaymentState(1000, 1000, "sent");
    expect(state).toEqual({ amountPaid: 1000, amountRemaining: 0, status: "paid" });
  });
});
