import { readFileSync } from "node:fs";
import path from "node:path";
import { ExpenseCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  MigrationMap,
  buildLegacyExpenseDryRunReport,
  buildLegacyExpenseImportPlan,
  type LegacyExpenseSourceRow,
} from "./legacy-expense-import";

const submitterMap = {
  "701": 101,
  "702": 102,
  "704": 104,
} as const;

const projectMap = Object.fromEntries(
  Array.from({ length: 24 }, (_, index) => [`PRJ-${index + 1}`, index + 1000]),
);

function buildAcceptedLegacyExpenseRows() {
  const rows: LegacyExpenseSourceRow[] = [];

  for (let index = 0; index < 359; index += 1) {
    rows.push({
      legacyExpenseId: `M-${index + 1}`,
      amount: "200.00",
      expenseDate: `2024-02-${String((index % 28) + 1).padStart(2, "0")}`,
      category: ExpenseCategory.materials,
      submittedByLegacyId: index % 2 === 0 ? "701" : "702",
      submittedByLegacyName: index % 2 === 0 ? "Mapped Employee One" : "Mapped Employee Two",
      projectReference: `PRJ-${(index % 24) + 1}`,
      vendor: `Mapped Vendor ${index + 1}`,
      sourceMetadata: { sourceRowKind: "mapped", line: index + 1 },
      receiptMetadata: index < 205 ? { receiptFileName: `mapped-${index + 1}.pdf` } : null,
    });
  }

  rows.push({
    legacyExpenseId: "M-360",
    amount: "559.58",
    expenseDate: "2024-03-01",
    category: ExpenseCategory.materials,
    submittedByLegacyId: "704",
    submittedByLegacyName: "Mapped Employee Three",
    projectReference: "PRJ-1",
    vendor: "Mapped Vendor 360",
    sourceMetadata: { sourceRowKind: "mapped", line: 360 },
    receiptMetadata: null,
  });

  const unresolvedIds = ["802", "803", "805"] as const;
  for (let index = 0; index < 60; index += 1) {
    rows.push({
      legacyExpenseId: `U-${index + 1}`,
      amount: "50.00",
      expenseDate: `2024-04-${String((index % 28) + 1).padStart(2, "0")}`,
      category: ExpenseCategory.travel,
      submittedByLegacyId: unresolvedIds[index % unresolvedIds.length],
      submittedByLegacyName: `Unresolved Submitter ${index + 1}`,
      projectReference: `PRJ-${(index % 24) + 1}`,
      vendor: `Unresolved Vendor ${index + 1}`,
      sourceMetadata: { sourceRowKind: "unresolved", line: 361 + index },
      receiptMetadata: null,
    });
  }

  rows.push({
    legacyExpenseId: "U-61",
    amount: "430.50",
    expenseDate: "2024-05-01",
    category: ExpenseCategory.travel,
    submittedByLegacyId: "805",
    submittedByLegacyName: "Unresolved Submitter 61",
    projectReference: "PRJ-2",
    vendor: "Unresolved Vendor 61",
    sourceMetadata: { sourceRowKind: "unresolved", line: 421 },
    receiptMetadata: null,
  });

  rows.push({
    legacyExpenseId: "G-1",
    amount: "442.52",
    expenseDate: "2024-05-02",
    category: ExpenseCategory.office,
    submittedByLegacyId: "701",
    submittedByLegacyName: "Mapped Employee One",
    projectReference: "",
    vendor: "General Business Expense",
    sourceMetadata: { sourceRowKind: "general", line: 422 },
    receiptMetadata: null,
  });

  return rows;
}

describe("buildLegacyExpenseImportPlan", () => {
  it("accounts for all 422 rows without silent skips and preserves unresolved submitter metadata", () => {
    const plan = buildLegacyExpenseImportPlan(buildAcceptedLegacyExpenseRows(), {
      jobIdByProjectReference: projectMap,
      submittedByIdByLegacyId: submitterMap,
    });

    expect(plan.summary).toMatchObject({
      sourceRows: 422,
      accountedRows: 422,
      simulatedImportedExpenses: 422,
      alreadyImportedExpenses: 0,
      silentSkips: 0,
      linkedImportableExpenses: 421,
      unresolvedSubmitterImports: 61,
      unlinkedGeneralExpenses: 1,
      duplicateLegacyExpenseIds: 0,
      invalidNonEmptyProjectReferences: 0,
      sourceTotal: "76232.60",
      simulatedImportedTotal: "76232.60",
      receiptMetadataPreserved: 205,
    });
    expect(plan.rowResults.every((row) => row.silentSkip === false)).toBe(true);

    const unresolved = plan.plannedExpenses.find((expense) => expense.legacyExpenseId === "U-61");
    expect(unresolved).toBeDefined();
    expect(unresolved?.classification).toBe("imported_with_unresolved_submitter");
    expect(unresolved?.expense.submittedById).toBeNull();
    expect(unresolved?.expense.legacySubmittedById).toBe("805");
    expect(unresolved?.expense.legacySubmittedByName).toBe("Unresolved Submitter 61");
    expect(unresolved?.expense.extractedData).toMatchObject({
      legacyExpenseId: "U-61",
      legacySubmittedById: "805",
      legacySubmittedByName: "Unresolved Submitter 61",
      classification: "imported_with_unresolved_submitter",
    });

    const generalExpense = plan.plannedExpenses.find((expense) => expense.legacyExpenseId === "G-1");
    expect(generalExpense?.expense.jobId).toBeNull();
    expect(generalExpense?.expense.extractedData.sourceMetadata).toMatchObject({
      sourceRowKind: "general",
      line: 422,
    });
  });

  it("keeps mapped submitters resolved and never fabricates fallback users", () => {
    const plan = buildLegacyExpenseImportPlan(buildAcceptedLegacyExpenseRows(), {
      jobIdByProjectReference: projectMap,
      submittedByIdByLegacyId: submitterMap,
    });

    const mapped = plan.plannedExpenses.find((expense) => expense.legacyExpenseId === "M-360");
    expect(mapped?.classification).toBe("imported");
    expect(mapped?.expense.submittedById).toBe(104);
    expect(mapped?.expense.legacySubmittedById).toBe("704");
    expect(mapped?.expense.legacySubmittedByName).toBe("Mapped Employee Three");

    const allowedSubmittedByIds = new Set<number>(Object.values(submitterMap));
    const unresolvedRows = plan.plannedExpenses.filter(
      (expense) => expense.classification === "imported_with_unresolved_submitter",
    );
    expect(unresolvedRows).toHaveLength(61);
    expect(unresolvedRows.every((expense) => expense.expense.submittedById === null)).toBe(true);
    expect(
      plan.plannedExpenses.every(
        (expense) =>
          expense.expense.submittedById == null
          || allowedSubmittedByIds.has(expense.expense.submittedById),
      ),
    ).toBe(true);
  });

  it("is idempotent when the migration map already contains imported legacy expenses", () => {
    const rows = buildAcceptedLegacyExpenseRows();
    const migrationMap = new MigrationMap();
    const firstPlan = buildLegacyExpenseImportPlan(rows, {
      jobIdByProjectReference: projectMap,
      submittedByIdByLegacyId: submitterMap,
      migrationMap,
    });

    firstPlan.plannedExpenses.forEach((expense, index) => {
      migrationMap.rememberExpense(expense.legacyExpenseId, index + 1);
    });

    const rerunPlan = buildLegacyExpenseImportPlan(rows, {
      jobIdByProjectReference: projectMap,
      submittedByIdByLegacyId: submitterMap,
      migrationMap,
    });

    expect(rerunPlan.summary).toMatchObject({
      sourceRows: 422,
      accountedRows: 422,
      simulatedImportedExpenses: 0,
      alreadyImportedExpenses: 422,
      silentSkips: 0,
      unresolvedSubmitterImports: 61,
      unlinkedGeneralExpenses: 1,
      sourceTotal: "76232.60",
      simulatedImportedTotal: "0.00",
    });
    expect(rerunPlan.alreadyImported).toHaveLength(422);
    expect(rerunPlan.plannedExpenses).toHaveLength(0);
  });

  it("rejects duplicate ids and invalid non-empty project references", () => {
    expect(() =>
      buildLegacyExpenseImportPlan(
        [
          {
            legacyExpenseId: "dup-1",
            amount: "10.00",
            expenseDate: "2024-01-01",
            category: ExpenseCategory.materials,
            submittedByLegacyId: "701",
          },
          {
            legacyExpenseId: "dup-1",
            amount: "12.00",
            expenseDate: "2024-01-02",
            category: ExpenseCategory.materials,
            submittedByLegacyId: "701",
          },
        ],
        {
          jobIdByProjectReference: projectMap,
          submittedByIdByLegacyId: submitterMap,
        },
      ),
    ).toThrow("Duplicate legacy expense id detected: dup-1.");

    expect(() =>
      buildLegacyExpenseImportPlan(
        [
          {
            legacyExpenseId: "bad-project",
            amount: "10.00",
            expenseDate: "2024-01-01",
            category: ExpenseCategory.materials,
            submittedByLegacyId: "701",
            projectReference: "UNKNOWN-PROJECT",
          },
        ],
        {
          jobIdByProjectReference: projectMap,
          submittedByIdByLegacyId: submitterMap,
        },
      ),
    ).toThrow("Legacy expense bad-project has an invalid non-empty project reference: UNKNOWN-PROJECT.");
  });
});

describe("legacy expense schema safety", () => {
  it("makes Expense.submittedById nullable and adds legacy submitter fields", () => {
    const schema = readFileSync(
      path.join(process.cwd(), "prisma", "schema.prisma"),
      "utf8",
    );
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260723200500_make_expense_submitter_nullable",
        "migration.sql",
      ),
      "utf8",
    );

    expect(schema).toContain("submittedById        Int?");
    expect(schema).toContain("legacySubmittedById  String?");
    expect(schema).toContain("legacySubmittedByName String?");
    expect(schema).toContain('submittedBy         User?                 @relation("SubmittedExpenses", fields: [submittedById], references: [id])');
    expect(migration).toContain('ALTER COLUMN "submittedById" DROP NOT NULL');
    expect(migration).toContain('ADD COLUMN "legacySubmittedById" TEXT');
    expect(migration).toContain('ADD COLUMN "legacySubmittedByName" TEXT');
  });

  it("builds the expected dry-run report shape", () => {
    const plan = buildLegacyExpenseImportPlan(buildAcceptedLegacyExpenseRows(), {
      jobIdByProjectReference: projectMap,
      submittedByIdByLegacyId: submitterMap,
    });

    expect(
      buildLegacyExpenseDryRunReport(plan, {
        rollbackConfirmed: true,
        liveDatabaseCountsUnchanged: true,
      }),
    ).toMatchObject({
      sourceRows: 422,
      simulatedImportedExpenses: 422,
      unresolvedSubmitterImports: 61,
      unlinkedGeneralExpenses: 1,
      sourceTotal: "76232.60",
      simulatedImportedTotal: "76232.60",
      receiptMetadataPreserved: 205,
      rollbackConfirmed: true,
      liveDatabaseCountsUnchanged: true,
    });
  });
});
