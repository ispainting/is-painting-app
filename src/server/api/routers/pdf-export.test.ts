import { describe, expect, it, vi } from "vitest";
import { jobsRouter } from "./jobs";
import { customersRouter } from "./customers";
import { businessRouter } from "./business";
import { employeesRouter } from "./employees";
import { timeRouter } from "./time";
import { inventoryRouter } from "./inventory";
import { reportsPdf } from "@/lib/pdf-export-data";
import { buildExportPdf } from "@/lib/pdf-export";
import { buildJobsListInputForPageFilter } from "@/lib/job-filters";

const session = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };
const employee = { ...session, role: "employee" as const };

describe("PDF read-only data queries", () => {
  it.each(["active", "archived", "all"] as const)("loads the same %s Jobs and only accounting fields needed by export", async filter => {
    const prisma = { job: { findMany: vi.fn().mockResolvedValue([]) } };
    await jobsRouter.createCaller({ prisma: prisma as never, session }).list(buildJobsListInputForPageFilter(filter));
    expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: filter === "all" ? {} : filter === "archived" ? { deletedAt: { not: null } } : { deletedAt: null, status: "active" },
      include: {
        customer: true, invoices: { select: { status: true, total: true } }, payments: { select: { status: true, amount: true } },
      },
      take: 200,
    }));
  });

  it("keeps payroll data and rate queries admin-only", async () => {
    const prisma = {};
    await expect(timeRouter.createCaller({ prisma: prisma as never, session: employee }).listAll({ days: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(employeesRouter.createCaller({ prisma: prisma as never, session: employee }).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("customer list adds relationship counts using read-only selections", async () => {
    const prisma = { customer: { findMany: vi.fn().mockResolvedValue([]) } };
    await customersRouter.createCaller({ prisma: prisma as never, session }).list({ search: "Visible" });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null },
      include: expect.objectContaining({ _count: { select: { proposals: { where: { deletedAt: null } }, opportunities: true } } }),
    }));
  });

  it("limits Inventory related Jobs to authorized non-archived names", async () => {
    const prisma = { inventoryItem: { findMany: vi.fn().mockResolvedValue([]) } };
    await inventoryRouter.createCaller({ prisma: prisma as never, session: employee }).list();
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true },
      include: {
        jobMaterials: {
          where: { job: { deletedAt: null, assignments: { some: { userId: employee.userId } } } },
          select: { job: { select: { name: true } } },
        },
      },
    }));
  });

  it("exports the selected report response, all tables, source separation and missing-date totals without writes", async () => {
    const rows = () => ({ findMany: vi.fn().mockResolvedValue([]) });
    const prisma = {
      job: { findMany: vi.fn().mockResolvedValue([{
        id: 1, name: "Legacy Job", status: "completed", contractAmount: 1000, totalEstimate: 900,
        completedAt: null, endDate: null, startDate: null, workStartedAt: null, leadReceivedAt: null,
        createdAt: new Date("2020-01-01"), customer: { id: 1, name: "Customer", source: "Google Search" },
      }]) },
      opportunity: { findMany: vi.fn().mockResolvedValue(["Google Search", "Google Ads"].map((source, index) => ({
        id: index + 1, source, stage: "new_lead", status: "open", leadValue: 500,
        leadReceivedAt: new Date("2026-09-15T04:00:00Z"), createdAt: new Date("2026-10-21"),
        customer: { id: 1, name: "Customer", source }, proposals: [], job: null, stageHistory: [],
      }))) },
      proposal: rows(), invoice: rows(), payment: rows(), expense: rows(), timeEntry: rows(), user: rows(),
    };
    const data = await businessRouter.createCaller({ prisma: prisma as never, session }).analytics({ periodType: "month", month: 9, year: 2026 });
    const before = JSON.stringify(data);
    const document = reportsPdf(data, { filters: [["Period", data.period.label]] });
    expect(document.summary).toContainEqual(["Completion date missing (all time)", "1"]);
    expect(document.summary).toContainEqual(["Completion date missing value (all time)", "$1,000.00"]);
    const sources = document.tables.find(table => table.title === "Lead Source Quality - Qualification")?.rows.map(row => row[0]);
    expect(sources).toContain("Google Search");
    expect(sources).toContain("Google Ads");
    expect(document.recordCount).toBe(document.tables.reduce((n, table) => n + table.rows.length, 0));
    expect(document.tables.map(table => table.title)).toEqual(expect.arrayContaining([
      "Most profitable Jobs", "Largest Jobs", "Seasonality", "Employee productivity", "Lead Source Quality - Values",
    ]));
    const bytes = await buildExportPdf(document);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(JSON.stringify(data)).toBe(before);
    // Only findMany methods exist on this fake client; generation cannot use a write procedure.
    for (const model of Object.values(prisma)) expect(Object.keys(model)).toEqual(["findMany"]);
  });
});
