import { describe, expect, it } from "vitest";
import {
  computeFilteredReceiptAggregates,
  computeReceiptTotal,
  type ReceiptLike,
} from "./receipt-totals";

describe("Receipt Totals Calculations", () => {
  it("calculates one receipt with multiple line items", () => {
    const receipt: ReceiptLike = {
      id: 1,
      vendor: "Sherwin-Williams",
      amount: 150.5,
      lineItems: [
        { description: "SuperPaint Semi-Gloss", quantity: 2, unitPrice: 50, total: 100 },
        { description: "Purdy Roller Cover", quantity: 3, unitPrice: 10, total: 30 },
        { description: "Frog Tape", quantity: 2, unitPrice: 10.25, total: 20.5 },
      ],
    };

    const result = computeReceiptTotal(receipt);
    expect(result.authoritativeTotal).toBe(150.5);
    expect(result.source).toBe("expense_amount");
    expect(result.lineItemsTotal).toBe(150.5);
    expect(result.hasMismatch).toBe(false);
    expect(result.mismatchWarning).toBeNull();
  });

  it("calculates receipt with tax and subtotal", () => {
    const receipt: ReceiptLike = {
      id: 2,
      vendor: "Home Depot",
      amount: 106.25,
      subtotal: 100,
      tax: 6.25,
      lineItems: [{ description: "Drop cloths", quantity: 1, unitPrice: 100, total: 100 }],
    };

    const result = computeReceiptTotal(receipt);
    expect(result.authoritativeTotal).toBe(106.25);
    expect(result.subtotal).toBe(100);
    expect(result.tax).toBe(6.25);
  });

  it("calculates receipt with an Expense total but no line items", () => {
    const receipt: ReceiptLike = {
      id: 3,
      vendor: "Benjamin Moore",
      amount: 245.0,
      lineItems: [],
    };

    const result = computeReceiptTotal(receipt);
    expect(result.authoritativeTotal).toBe(245.0);
    expect(result.source).toBe("expense_amount");
    expect(result.hasLineItems).toBe(false);
    expect(result.hasMismatch).toBe(false);
  });

  it("warns when itemized lines do not equal authoritative receipt total", () => {
    const receipt: ReceiptLike = {
      id: 4,
      vendor: "Local Hardware",
      amount: 100.0,
      lineItems: [
        { description: "Item 1", total: 40 },
        { description: "Item 2", total: 40 },
        // Line total sum is 80, but receipt amount is 100
      ],
    };

    const result = computeReceiptTotal(receipt);
    expect(result.authoritativeTotal).toBe(100.0);
    expect(result.lineItemsTotal).toBe(80.0);
    expect(result.hasMismatch).toBe(true);
    expect(result.mismatchWarning).toBe("Line items do not match receipt total.");
  });

  it("calculates combined receipt total across multiple receipts", () => {
    const receipts: ReceiptLike[] = [
      { id: 1, amount: 100, status: "approved" },
      { id: 2, amount: 250, status: "pending" },
      { id: 3, amount: 50, status: "approved" },
    ];

    const aggregates = computeFilteredReceiptAggregates(receipts);
    expect(aggregates.totalCount).toBe(3);
    expect(aggregates.totalAmount).toBe(400);
    expect(aggregates.reviewedCount).toBe(2);
    expect(aggregates.reviewedTotal).toBe(150);
    expect(aggregates.unreviewedCount).toBe(1);
    expect(aggregates.unreviewedTotal).toBe(250);
  });

  it("filters aggregates by vendor, job, and date correctly", () => {
    const receipts: ReceiptLike[] = [
      { id: 1, vendor: "Sherwin-Williams", jobId: 10, expenseDate: "2026-09-01", amount: 200 },
      { id: 2, vendor: "Home Depot", jobId: 10, expenseDate: "2026-09-02", amount: 150 },
      { id: 3, vendor: "Sherwin-Williams", jobId: 20, expenseDate: "2026-09-03", amount: 300 },
    ];

    const swOnly = computeFilteredReceiptAggregates(receipts, { vendor: "sherwin" });
    expect(swOnly.totalCount).toBe(2);
    expect(swOnly.totalAmount).toBe(500);

    const job10Only = computeFilteredReceiptAggregates(receipts, { jobId: 10 });
    expect(job10Only.totalCount).toBe(2);
    expect(job10Only.totalAmount).toBe(350);

    const dateFiltered = computeFilteredReceiptAggregates(receipts, {
      startDate: "2026-09-02",
      endDate: "2026-09-03",
    });
    expect(dateFiltered.totalCount).toBe(2);
    expect(dateFiltered.totalAmount).toBe(450);
  });

  it("prevents double counting when multiple attachments or candidates exist for one expense", () => {
    const duplicateIdList: ReceiptLike[] = [
      { id: 1, amount: 100, attachments: [{ id: 101 }, { id: 102 }] },
      { id: 1, amount: 100, attachments: [{ id: 101 }, { id: 102 }] }, // duplicate reference in array
      { id: 2, amount: 200 },
    ];

    const aggregates = computeFilteredReceiptAggregates(duplicateIdList);
    expect(aggregates.totalCount).toBe(2);
    expect(aggregates.totalAmount).toBe(300);
  });
});
