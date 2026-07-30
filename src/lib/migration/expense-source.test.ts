import { describe, expect, it } from "vitest";
import { buildNormalizedExpenseSource } from "./expense-source";

describe("buildNormalizedExpenseSource", () => {
  it("maps unknown categories to other and preserves receipt metadata", () => {
    const { expenses, audit } = buildNormalizedExpenseSource(
      [
        {
          expense_id: 1,
          project_id: null,
          submitted_by_id: 1,
          category: "Mystery Category",
          amount: "19.00",
          expense_date: "2026-07-01T00:00:00.000Z",
          receipt_url: "https://example.com/receipt.png",
          extracted_data: JSON.stringify({ vendor: "Vendor One", total: "19.00" }),
          status: "approved",
        },
      ],
      new Set(),
      new Set(["1"])
    );

    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.category).toBe("other");
    expect(expenses[0]?.extractedData).toEqual({ vendor: "Vendor One", total: "19.00" });
    expect(audit.unknownCategories).toHaveLength(1);
    expect(audit.receiptMetadataCount).toBe(1);
    expect(audit.missingJobReferences).toHaveLength(1);
  });

  it("rejects invalid amounts, invalid dates, missing jobs, and missing employees", () => {
    const { expenses, audit } = buildNormalizedExpenseSource(
      [
        {
          expense_id: 2,
          project_id: 999,
          submitted_by_id: 1,
          category: "materials",
          amount: "10.00",
          expense_date: "2026-07-01T00:00:00.000Z",
          status: "pending",
        },
        {
          expense_id: 3,
          project_id: null,
          submitted_by_id: 999,
          category: "materials",
          amount: "10.00",
          expense_date: "2026-07-01T00:00:00.000Z",
          status: "pending",
        },
        {
          expense_id: 4,
          project_id: null,
          submitted_by_id: 1,
          category: "materials",
          amount: "not-a-number",
          expense_date: "2026-07-01T00:00:00.000Z",
          status: "pending",
        },
        {
          expense_id: 5,
          project_id: null,
          submitted_by_id: 1,
          category: "materials",
          amount: "10.00",
          expense_date: "not-a-date",
          status: "pending",
        },
      ],
      new Set(["1"]),
      new Set(["1"])
    );

    expect(expenses).toHaveLength(0);
    expect(audit.missingJobReferences).toHaveLength(2);
    expect(audit.missingEmployeeReferences).toHaveLength(1);
    expect(audit.invalidAmounts).toHaveLength(1);
    expect(audit.invalidDates).toHaveLength(1);
    expect(audit.importableCount).toBe(0);
  });
});