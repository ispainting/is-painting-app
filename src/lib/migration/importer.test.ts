import { describe, expect, it } from "vitest";
import { MigrationImporter } from "./importer";
import type { LegacyMigrationSource } from "./types";

function createMockPrisma() {
  let customerId = 1;
  let jobId = 1;
  let employeeId = 1;
  let timeEntryId = 1;
  let expenseId = 1;
  let paymentId = 1;
  let opportunityId = 1;
  let receiptId = 1;
  let materialId = 1;

  const customers: any[] = [];
  const jobs: any[] = [];
  const users: any[] = [];
  const timeEntries: any[] = [];
  const expenses: any[] = [];
  const payments: any[] = [];
  const opportunities: any[] = [];
  const receipts: any[] = [];
  const materials: any[] = [];
  const migrationMaps: any[] = [];
  const auditLogs: any[] = [];

  const mapLookup = (entityType: string, legacyId: string) => migrationMaps.find((row) => row.entityType === entityType && row.legacyId === legacyId) ?? null;

  const prisma: any = {
    migrationMap: {
      findUnique: async ({ where }: any) => mapLookup(where.entityType_legacyId.entityType, where.entityType_legacyId.legacyId),
      create: async ({ data }: any) => {
        const row = { id: migrationMaps.length + 1, ...data, createdAt: new Date() };
        migrationMaps.push(row);
        return row;
      },
      count: async ({ where }: any) => migrationMaps.filter((row) => row.entityType === where.entityType).length,
      findMany: async ({ where }: any) => migrationMaps.filter((row) => row.entityType === where.entityType),
    },
    customer: {
      create: async ({ data }: any) => {
        const row = { id: customerId++, ...data };
        customers.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = customers.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async () => customers,
      count: async () => customers.length,
    },
    job: {
      create: async ({ data }: any) => {
        const row = { id: jobId++, ...data };
        jobs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = jobs.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const row = jobs.find((entry) => entry.id === where.id);
        if (!row) return null;
        return {
          ...row,
          expenses: expenses.filter((expense) => expense.jobId === row.id),
          timeEntries: timeEntries
            .filter((timeEntry) => timeEntry.jobId === row.id)
            .map((timeEntry) => ({
              ...timeEntry,
              user: users.find((user) => user.id === timeEntry.userId) ?? { name: "Unknown", hourlyRate: 0 },
            })),
          payments: payments.filter((payment) => payment.jobId === row.id),
        };
      },
      count: async () => jobs.length,
    },
    user: {
      create: async ({ data }: any) => {
        const row = { id: employeeId++, ...data };
        users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = users.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findUnique: async ({ where, select }: any) => {
        const row = users.find((entry) => entry.id === where.id || entry.email === where.email) ?? null;
        if (!row || !select) return row;
        const selected: any = {};
        for (const key of Object.keys(select)) selected[key] = row[key];
        return selected;
      },
      findMany: async () => users,
      count: async () => users.length,
    },
    timeEntry: {
      create: async ({ data }: any) => {
        const row = { id: timeEntryId++, ...data };
        timeEntries.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = timeEntries.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async () => timeEntries,
      count: async () => timeEntries.length,
    },
    expense: {
      create: async ({ data }: any) => {
        const row = { id: expenseId++, ...data };
        expenses.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = expenses.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findUnique: async ({ where }: any) => expenses.find((entry) => entry.id === where.id) ?? null,
      findMany: async () => expenses,
      count: async () => expenses.length,
    },
    expenseAttachment: {
      create: async ({ data }: any) => {
        const row = { id: receiptId++, ...data };
        receipts.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = receipts.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      count: async () => receipts.length,
      findMany: async () => receipts,
    },
    payment: {
      create: async ({ data }: any) => {
        const row = { id: paymentId++, ...data };
        payments.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = payments.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ select }: any = {}) => (select ? payments.map((payment) => ({ amount: payment.amount })) : payments),
      count: async () => payments.length,
    },
    opportunity: {
      create: async ({ data }: any) => {
        const row = { id: opportunityId++, ...data };
        opportunities.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = opportunities.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async () => opportunities,
      count: async () => opportunities.length,
    },
    jobMaterial: {
      create: async ({ data }: any) => {
        const row = { id: materialId++, ...data };
        materials.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = materials.find((entry) => entry.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async () => materials,
      count: async () => materials.length,
    },
    expenseLineItem: {
      count: async () => 0,
    },
    auditLog: {
      findMany: async () => auditLogs,
    },
  };

  return { prisma, state: { customers, jobs, users, timeEntries, expenses, payments, opportunities, receipts, materials, migrationMaps, auditLogs } };
}

const source: LegacyMigrationSource = {
  customers: [
    {
      id: 100,
      name: "  Jane Homeowner  ",
      email: "JANE@EXAMPLE.COM ",
      phone: "(555) 222-3333",
      city: " norwalk ",
      state: "connecticut",
      tags: ["residential", "interior"],
    },
  ],
  projects: [
    {
      id: 200,
      customerId: 100,
      opportunityId: 500,
      name: " Interior repaint ",
      status: "active",
      jobType: "interior",
      materialsBudget: 600,
      laborBudget: 1800,
      subcontractorBudget: 250,
      equipmentBudget: 50,
      travelBudget: 25,
      otherBudget: 10,
      totalEstimate: 3528,
      contractAmount: 3400,
      materials: [
        { id: 300, name: "Paint", quantity: 4, unit: "gallon", unitCost: 50, totalCost: 200 },
      ],
    },
  ],
  employees: [
    { id: 10, name: " Sample Painter ", email: "PAINTER@EXAMPLE.COM", hourlyRate: 28, skills: ["prep", "paint"] },
    { id: 11, name: " Italo Santos ", email: "admin@ispainting.com", hourlyRate: 0, role: "admin" as any },
  ],
  timeEntries: [
    {
      id: 400,
      projectId: 200,
      employeeId: 10,
      clockIn: new Date("2026-07-01T08:00:00.000Z"),
      paidHours: 8,
      reviewStatus: "approved",
      rateType: "regular",
    },
  ],
  expenses: [
    {
      id: 600,
      projectId: 200,
      submittedByEmployeeId: 10,
      category: "materials",
      amount: 200,
      expenseDate: new Date("2026-07-01T12:00:00.000Z"),
      receiptUrl: "https://example.com/receipt.pdf",
      reviewStatus: "approved",
    },
  ],
  payments: [
    {
      id: 700,
      projectId: 200,
      amount: 1000,
      dateReceived: new Date("2026-07-02T00:00:00.000Z"),
      method: "check",
      recordedByEmployeeId: 11,
      status: "received",
    },
  ],
  opportunities: [
    {
      id: 500,
      customerId: 100,
      name: "Living room repaint",
      stage: "new_lead",
      status: "open",
      assignedToEmployeeId: 11,
    },
  ],
  receipts: [
    {
      id: 800,
      expenseId: 600,
      fileName: "receipt.pdf",
      fileUrl: "https://example.com/receipt.pdf",
      mimeType: "application/pdf",
      uploadedByEmployeeId: 10,
    },
  ],
};

describe("MigrationImporter", () => {
  it("imports once and skips on rerun without duplicating records", async () => {
    const { prisma, state } = createMockPrisma();
    const importer = new MigrationImporter(prisma, source);

    const first = await importer.run();
    const second = await importer.run();

    expect(state.customers).toHaveLength(1);
    expect(state.jobs).toHaveLength(1);
    expect(state.users).toHaveLength(2);
    expect(state.timeEntries).toHaveLength(1);
    expect(state.expenses).toHaveLength(1);
    expect(state.payments).toHaveLength(1);
    expect(state.opportunities).toHaveLength(1);
    expect(state.receipts).toHaveLength(1);
    expect(state.materials).toHaveLength(1);

    expect(first.success).toBe(true);
    expect(first.validationCompleted).toBe(true);
    expect(first.financialEngineRecalculatedAllJobs).toBe(true);
    expect(second.counts.customer.skipped).toBe(1);
    expect(second.counts.project.skipped).toBe(1);
    expect(second.counts.employee.skipped).toBe(2);
    expect(second.counts.employee.merged).toBe(0);
    expect(second.counts.time_entry.skipped).toBe(1);
    expect(second.counts.expense.skipped).toBe(1);
    expect(second.counts.payment.skipped).toBe(1);
    expect(second.counts.opportunity.skipped).toBe(1);
    expect(second.counts.receipt.skipped).toBe(1);
    expect(second.databaseReadyForProduction).toBe(true);
  });

  it("imports an expense with no project reference as an unlinked record and preserves receipt metadata", async () => {
    const { prisma, state } = createMockPrisma();
    const unlinkedExpenseSource: LegacyMigrationSource = {
      customers: [{ id: "c-1", name: "Customer One" }],
      projects: [{ id: "p-1", customerId: "c-1", name: "Project One", status: "active", totalEstimate: 0, contractAmount: 0 }],
      employees: [{ id: "e-1", name: "Employee One", email: "employee@example.com" }],
      timeEntries: [],
      expenses: [
        {
          id: "ex-1",
          projectId: null,
          submittedByEmployeeId: "e-1",
          category: "materials",
          amount: "12.34",
          expenseDate: new Date("2026-07-01T12:00:00.000Z"),
          receiptUrl: "https://example.com/receipt.png",
          extractedData: { vendor: "Vendor One", total: "12.34" },
          status: "approved",
          createdAt: new Date("2026-07-01T12:05:00.000Z"),
          updatedAt: new Date("2026-07-01T12:10:00.000Z"),
        } as any,
      ],
      payments: [],
      opportunities: [],
      receipts: [],
    };

    const importer = new MigrationImporter(prisma, unlinkedExpenseSource);
    const report = await importer.run();

    expect(report.success).toBe(true);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0]?.jobId).toBeNull();
    expect(state.expenses[0]?.receiptUrl).toBe("https://example.com/receipt.png");
    expect(state.expenses[0]?.extractedData).toEqual({ vendor: "Vendor One", total: "12.34" });
    expect(state.expenses[0]?.status).toBe("approved");
    expect(state.expenses[0]?.reviewStatus).toBe("approved");
  });

  it("fails validation when an expense submitted-by employee cannot be resolved", async () => {
    const { prisma, state } = createMockPrisma();
    const unresolvedEmployeeSource: LegacyMigrationSource = {
      customers: [{ id: "c-1", name: "Customer One" }],
      projects: [{ id: "p-1", customerId: "c-1", name: "Project One", status: "active", totalEstimate: 0, contractAmount: 0 }],
      employees: [{ id: "e-1", name: "Employee One", email: "employee@example.com" }],
      timeEntries: [],
      expenses: [
        {
          id: "ex-1",
          projectId: "p-1",
          submittedByEmployeeId: "missing-employee",
          category: "materials",
          amount: "12.34",
          expenseDate: new Date("2026-07-01T12:00:00.000Z"),
          status: "approved",
        } as any,
      ],
      payments: [],
      opportunities: [],
      receipts: [],
    };

    const importer = new MigrationImporter(prisma, unresolvedEmployeeSource);
    const report = await importer.run();

    expect(report.success).toBe(false);
    expect(report.validationErrors.some((issue) => issue.message.includes("submitted-by relationship missing for expense"))).toBe(true);
    expect(state.expenses).toHaveLength(0);
  });

  it("reports missing relationships instead of fabricating links", async () => {
    const { prisma } = createMockPrisma();
    const broken = new MigrationImporter(prisma, {
      customers: source.customers,
      projects: [
        { ...source.projects[0], customerId: 999 },
      ],
      employees: source.employees,
      timeEntries: source.timeEntries,
      expenses: source.expenses,
      payments: source.payments,
      opportunities: source.opportunities,
      receipts: source.receipts,
    });

    const report = await broken.run();
    expect(report.validationErrors.some((issue) => issue.message.includes("missing"))).toBe(true);
    expect(report.success).toBe(false);
  });

  it("applies approved employee merge with one canonical user and preserves all time entries", async () => {
    const { prisma, state } = createMockPrisma();

    const mergeSource: LegacyMigrationSource = {
      customers: [{ id: "c-1", name: "Customer One" }],
      projects: [{ id: "p-1", customerId: "c-1", name: "Project One", status: "active", totalEstimate: 0, contractAmount: 0 }],
      employees: [
        { id: "750006", name: "Robert Silva Ferreira", email: "robert786ferreira@gmail.com", hourlyRate: 20 },
        { id: "2760001", name: "Robert Ferreira", email: "robert786ferreira@gmail.com", hourlyRate: 20 },
      ],
      timeEntries: Array.from({ length: 100 }).map((_, index) => {
        const isCanonical = index < 34;
        const hours = 8.47;
        return {
          id: `t-${index + 1}`,
          projectId: "p-1",
          employeeId: isCanonical ? "750006" : "2760001",
          clockIn: new Date(`2026-07-${String((index % 28) + 1).padStart(2, "0")}T08:00:00.000Z`),
          paidHours: hours,
          hoursWorked: hours,
          reviewStatus: "approved",
          rateType: "regular",
        } as any;
      }),
      expenses: [],
      payments: [],
      opportunities: [],
      receipts: [],
    };

    // Force exact combined hours required by spec: 847.41
    mergeSource.timeEntries[99] = {
      ...mergeSource.timeEntries[99],
      paidHours: 8.88,
      hoursWorked: 8.88,
    } as any;

    const importer = new MigrationImporter(prisma, mergeSource);
    const first = await importer.run();
    const second = await importer.run();

    const employeeMaps = state.migrationMaps.filter((row) => row.entityType === "employee");
    const canonicalMap = employeeMaps.find((row) => row.legacyId === "750006");
    const mergedMap = employeeMaps.find((row) => row.legacyId === "2760001");
    const totalHours = state.timeEntries.reduce((sum, row) => sum + Number(row.hoursWorked ?? row.paidHours ?? 0), 0);

    expect(first.success).toBe(true);
    expect(first.counts.employee.imported).toBe(1);
    expect(first.counts.employee.merged).toBe(1);
    expect(first.employeeMerges).toHaveLength(1);
    expect(first.employeeMerges[0]?.canonicalLegacyId).toBe("750006");
    expect(first.employeeMerges[0]?.mergedLegacyId).toBe("2760001");
    expect(first.employeeImportSummary.sourceEmployeeRecords).toBe(2);
    expect(first.employeeImportSummary.distinctUsersRepresented).toBe(1);
    expect(first.employeeImportSummary.createdEmployees).toBe(1);
    expect(first.employeeImportSummary.explicitlyMergedEmployees).toBe(1);
    expect(first.employeeImportSummary.unresolvedDuplicateEmailConflicts).toBe(0);

    expect(state.users).toHaveLength(1);
    expect(employeeMaps).toHaveLength(2);
    expect(canonicalMap?.newId).toBeDefined();
    expect(mergedMap?.newId).toBe(canonicalMap?.newId);
    expect(state.timeEntries).toHaveLength(100);
    expect(Number(totalHours.toFixed(2))).toBe(847.41);

    expect(second.success).toBe(true);
    expect(second.counts.employee.imported).toBe(0);
    expect(second.counts.employee.merged).toBe(0);
    expect(second.counts.employee.skipped).toBe(2);
    expect(state.users).toHaveLength(1);
    expect(state.timeEntries).toHaveLength(100);
  });

  it("fails validation for unresolved duplicate employee emails", async () => {
    const { prisma } = createMockPrisma();
    const unresolved: LegacyMigrationSource = {
      customers: [],
      projects: [],
      employees: [
        { id: "e-1", name: "Alex One", email: "alex@example.com" },
        { id: "e-2", name: "Alex Two", email: "alex@example.com" },
      ],
      timeEntries: [],
      expenses: [],
      payments: [],
      opportunities: [],
      receipts: [],
    };

    const importer = new MigrationImporter(prisma, unresolved);
    const report = await importer.run();

    expect(report.success).toBe(false);
    expect(report.validationErrors).toHaveLength(2);
    expect(report.validationErrors.every((issue) => issue.message.includes("Duplicate employee email conflict"))).toBe(true);
    expect(report.counts.employee.imported).toBe(0);
    expect(report.counts.employee.merged).toBe(0);
  });
});
