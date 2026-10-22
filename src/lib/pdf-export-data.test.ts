import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { customersPdf, employeesPdf, inventoryPdf, jobsPdf, opportunitiesPdf, payrollPdf } from "./pdf-export-data";
import { buildPayrollSummaries, type PayrollEntry } from "./payroll-preview";
import { filterOpportunityViews } from "./opportunity-board";
import { buildJobsListInputForPageFilter, buildJobsListWhere } from "./job-filters";

const context: Parameters<typeof jobsPdf>[1] = { generatedAt: new Date("2026-10-22T01:01:00Z"), filters: [["Search", "Visible"]], dateRange: "September 2026" };
const decimal = (n: number) => new Prisma.Decimal(n);
type Job = Parameters<typeof jobsPdf>[0][number];
const job = (overrides: Partial<Job> = {}): Job => ({
  name: "Visible Job", status: "completed", jobType: "interior", customer: { name: "Customer" },
  address: "123 Main St", city: "Boston", state: "MA", zipCode: "02101",
  contractAmount: decimal(1000), totalEstimate: decimal(900), workStartedAt: new Date("2026-09-01T04:00:00Z"),
  completedAt: null, endDate: new Date("2026-09-18T04:00:00Z"), completionSource: null, deletedAt: null,
  invoices: [{ total: decimal(1000), status: "paid" }, { total: decimal(100), status: "cancelled" }],
  payments: [{ amount: decimal(1000), status: "received" }, { amount: decimal(100), status: "bounced" }],
  ...overrides,
});
type Opportunity = Parameters<typeof opportunitiesPdf>[0][number];
const opportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  name: "Visible Opportunity", serviceType: "Interior Painting", customer: { name: "Customer" },
  source: "Google Search", stage: "new_lead", status: "open", archivedAt: null,
  leadReceivedAt: new Date("2026-09-15T04:00:00Z"), createdAt: new Date("2026-10-21T04:00:00Z"),
  followUpAt: null, outcomeAt: null, outcomeReason: null, leadValue: decimal(500), lostValue: null,
  proposals: [], job: null, ...overrides,
});
const secret = { passwordHash: "SECRET_HASH", pin: "SECRET_PIN", sessionToken: "SECRET_TOKEN", receiptPath: "/private/receipts/secret", internalUrl: "https://internal.test/secret" };

describe("allowlisted filtered PDF data", () => {
  it.each(["active", "archived", "all"] as const)("exports the same %s Opportunity records as both board and table", visibility => {
    const rows = [
      opportunity({ name: "Visible Active" }),
      opportunity({ name: "Visible Archived", archivedAt: new Date() }),
      opportunity({ name: "Hidden mismatch" }),
    ];
    const views = filterOpportunityViews(rows, {
      visibility, search: "Visible", source: "Google Search", service: "Interior Painting", stage: "new_lead",
      from: "2026-09-01", to: "2026-09-30", followUp: "", today: "2026-10-21",
    });
    const pdf = opportunitiesPdf(views.kanban, context);
    expect(pdf).toEqual(opportunitiesPdf(views.table, context));
    expect(pdf.recordCount).toBe(visibility === "all" ? 2 : 1);
    const text = JSON.stringify(pdf);
    expect(text).not.toContain("Hidden mismatch");
    if (visibility === "active") expect(text).not.toContain("Visible Archived");
    if (visibility === "archived") expect(text).not.toContain("Visible Active");
  });

  it.each(["active", "archived", "all"] as const)("preserves the Job page's %s archive filter", filter => {
    const rows = [job({ name: "Visible Active", status: "active" }), job({ name: "Visible Archived", deletedAt: new Date(), status: "active" })];
    const where = buildJobsListWhere(buildJobsListInputForPageFilter(filter), { isEmployee: false });
    const visible = rows.filter(row => filter === "all" || (filter === "archived" ? !!row.deletedAt : !row.deletedAt));
    const pdf = jobsPdf(visible, context);
    expect(where).toMatchObject(filter === "all" ? {} : { deletedAt: filter === "active" ? null : { not: null } });
    expect(pdf.recordCount).toBe(filter === "all" ? 2 : 1);
    expect(pdf.tables[0].rows.map(row => row[1].split("\n")[0])).toEqual(visible.map(row => row.name));
  });

  it("uses completedAt ahead of endDate, legacy endDate, or a missing date, never record timestamps", () => {
    const rows = [
      { ...job({ completedAt: new Date("2026-09-20T04:00:00Z"), completionSource: "payment" }), createdAt: new Date("2026-10-21"), updatedAt: new Date("2026-10-21") },
      job(),
      { ...job({ endDate: null }), createdAt: new Date("2026-10-21"), updatedAt: new Date("2026-10-21") },
    ];
    const pdf = jobsPdf(rows, context);
    expect(pdf.tables[0].rows.map(row => row[4])).toEqual(["Sep 20, 2026", "Sep 18, 2026", "Not recorded"]);
    expect(pdf.summary).toContainEqual(["Completion date missing", "1"]);
    expect(pdf.summary).toContainEqual(["Completion date missing value", "$1,000.00"]);
    expect(pdf.tables[1].rows[0]).toEqual(["Customer", "Visible Job", "$1,000.00", "$1,000.00", "$1,000.00", "$0.00"]);
    expect(JSON.stringify(pdf.tables)).not.toContain("Oct 21");
  });

  it("keeps Google Search and Google Ads separate and uses stage-aware loss values", () => {
    const pdf = opportunitiesPdf([
      opportunity(), opportunity({ source: "Google Ads", stage: "lost", status: "lost", lostValue: decimal(350) }),
    ], context);
    expect(pdf.tables[0].rows.map(row => row[3])).toEqual(["Google Search", "Google Ads"]);
    expect(pdf.summary).toContainEqual(["Expected value", "$500.00"]);
    expect(pdf.summary).toContainEqual(["Lost value", "$350.00"]);
  });

  it("explicitly excludes authentication, internal URLs, storage paths and database IDs", () => {
    const employee = {
      id: 123456, name: "Visible Employee", isActive: true, role: "employee" as const, employeeRole: "Painter",
      hourlyRate: decimal(25), phone: "SECRET_LOGIN_PHONE", ...secret,
    };
    const customer = {
      name: "Visible Customer", contactName: "Contact", email: "contact@example.test", phone: "555-0100",
      address: "", city: "", state: "", zipCode: "", source: "Google Search", leadSource: null,
      status: "active", openStage: null,
      metrics: { lifetimeValue: 100, openBalance: 10, activeJobs: 1, proposalCount: 2, opportunityCount: 3, jobCount: 4 },
      ...secret,
    };
    const results = [employeesPdf([employee], [], context), jobsPdf([{ ...job(), ...secret }], context),
      opportunitiesPdf([{ ...opportunity(), ...secret }], context), customersPdf([customer], context)];
    const text = JSON.stringify(results);
    for (const value of [...Object.values(secret), "SECRET_LOGIN_PHONE", "123456", "passwordHash", "sessionToken"]) expect(text).not.toContain(value);
    expect(text).toContain("contact@example.test");
  });

  it("exports quantity, unit-aware cost/value, supplier and availability from Inventory", () => {
    const pdf = inventoryPdf([{ name: "Paint", category: "paint", currentStock: decimal(2), minStockLevel: decimal(3), unit: "gallon", costPerUnit: decimal(25), supplier: "Supplier", jobMaterials: [{ job: { name: "Visible Job" } }] }], context);
    expect(pdf.summary).toContainEqual(["Stock value", "$50.00"]);
    expect(pdf.tables[0].rows[0]).toEqual(["Paint", "paint", "2", "gallon", "$25.00", "$50.00", "Supplier", "Low stock"]);
    expect(pdf.tables[1].rows[0]).toEqual(["Paint", "Visible Job"]);
  });

  it("empty filtered results preserve the filters and have zero records", () => {
    for (const pdf of [jobsPdf([], context), opportunitiesPdf([], context), customersPdf([], context), inventoryPdf([], context), employeesPdf([], [], context), payrollPdf([], [], context)]) {
      expect(pdf.recordCount).toBe(0);
      expect(pdf.tables.every(table => table.rows.length === 0)).toBe(true);
      expect(pdf.filters).toEqual(context.filters);
    }
  });
});

describe("Payroll Preview and export use one calculation", () => {
  const entry = (id: number, overrides: Partial<PayrollEntry> = {}): PayrollEntry => ({
    id, userId: 1, clockIn: new Date("2026-09-14T12:00:00Z"), clockOut: new Date("2026-09-14T20:00:00Z"),
    hoursWorked: 8, grossHours: 8.5, paidHours: 8, breakMinutes: 30, breakDeductionMinutes: 30,
    specialPayEnabled: false, notes: null, workType: "job_site",
    user: { name: "Painter", hourlyRate: 20 }, job: { id: 1, name: "Visible Job" }, ...overrides,
  });
  it("matches exact regular, island, overtime and once-per-job/day travel pay", () => {
    const entries = [
      entry(1, { paidHours: 38 }),
      entry(2, { specialPayEnabled: true, hourlyRateAdjustment: 2, travelHours: 1 }),
      entry(3, { paidHours: 2 }),
    ];
    const summaries = buildPayrollSummaries(entries, []);
    expect(summaries[0]).toMatchObject({
      regularHours: 38, specialHours: 2, overtimeHours: 8, travelHours: 1, totalHours: 49,
      estimatedCheck: 1082,
    });
    // 38*20 + 2*22 + 6*33 + 2*30 + 1*20 = 1082.
    const pdf = payrollPdf(entries, summaries, context);
    expect(pdf.summary).toContainEqual(["Estimated payroll", "$1,082.00"]);
    expect(pdf.tables[0].rows[0][5]).toBe("49");
    expect(pdf.tables[0].rows[0][7]).toBe("$1,082.00");
    expect(pdf.tables[1].rows.map(row => row[7])).toEqual(summaries[0].details.map(row => `$${row.dailyTotal.toFixed(2)}`));
    expect(JSON.stringify(pdf)).toContain("Deducted: 30 min");
  });

  it("only exports filtered entries and does not mutate source records", () => {
    const visible = entry(1), hidden = entry(2, { userId: 2 });
    const all = [visible, hidden];
    const before = JSON.stringify(all);
    const entries = all.filter(row => row.userId === 1);
    const pdf = payrollPdf(entries, buildPayrollSummaries(entries, []), context);
    expect(pdf.recordCount).toBe(1);
    expect(pdf.tables[1].rows).toHaveLength(1);
    expect(JSON.stringify(all)).toBe(before);
  });
});
