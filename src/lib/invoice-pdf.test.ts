import { describe, expect, it } from "vitest";
import { buildInvoicePdf, canAccessInvoicePdf, invoicePdfSections, type InvoicePdfData } from "./invoice-pdf";

const invoice: InvoicePdfData = {
  invoiceNumber: "INV-TEST-001",
  title: "Interior Painting",
  status: "partial",
  createdAt: new Date("2026-09-18T00:00:00Z"),
  dueDate: new Date("2026-10-18T00:00:00Z"),
  notes: "Thank you for choosing I.S Painting.",
  subtotal: 1000,
  tax: 62.5,
  total: 1062.5,
  amountPaid: 500,
  amountRemaining: 562.5,
  customerName: "Test Customer",
  customerAddress: "1 Bumble Bee Ln, Nantucket, MA 02554",
  projectName: "Bumble Bee Interior",
  projectAddress: "1 Bumble Bee Ln, Nantucket, MA 02554",
  lineItems: [{ description: "Start payment", quantity: 1, unitPrice: 1000, totalPrice: 1000 }],
  payments: [{ dateReceived: new Date("2026-09-18T00:00:00Z"), method: "check", amount: 500, memo: "Deposit" }],
};

describe("invoice PDF", () => {
  it("allows admins and assigned employees only", () => {
    expect(canAccessInvoicePdf("admin", 99, [])).toBe(true);
    expect(canAccessInvoicePdf("employee", 7, [7])).toBe(true);
    expect(canAccessInvoicePdf("employee", 7, [8])).toBe(false);
  });

  it("contains all essential content sections", () => {
    const sections = invoicePdfSections(invoice).join("\n");
    expect(sections).toContain("I.S PAINTING / Business Manager");
    expect(sections).toContain("Painting Invoice");
    expect(sections).toContain("INV-TEST-001");
    expect(sections).toContain("Test Customer");
    expect(sections).toContain("Bumble Bee Interior");
    expect(sections).toContain("Payments received $500.00");
    expect(sections).toContain("Balance due $562.50");
  });

  it("renders a valid PDF document", async () => {
    const pdf = await buildInvoicePdf(invoice);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it("safely renders long and non-ASCII text", async () => {
    const pdf = await buildInvoicePdf({
      ...invoice,
      notes: `Customer’s note: ${"unbroken-description".repeat(80)}`,
      lineItems: [{ ...invoice.lineItems[0], description: "Exterior – trim ".repeat(100) }],
    });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
