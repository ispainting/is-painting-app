import { describe, expect, it, vi } from "vitest";
import { opportunitiesRouter } from "./opportunities";
import { filterOpportunityViews, OPPORTUNITY_BOARD_GROUPS, refreshOpportunityQueries, type OpportunityBoardFilters, type OpportunityBoardRecord } from "@/lib/opportunity-board";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };

function callerWith(findMany: ReturnType<typeof vi.fn>) {
  return opportunitiesRouter.createCaller({
    prisma: { opportunity: { findMany } } as never,
    session: adminSession,
  });
}

describe("opportunities.list visibility filter", () => {
  it("returns only active Opportunities", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await callerWith(findMany).list({ visibility: "active" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: null } }));
  });

  it("returns only archived Opportunities", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await callerWith(findMany).list({ visibility: "archived" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { archivedAt: { not: null } } }));
  });

  it("returns both active and archived Opportunities only for All", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await callerWith(findMany).list({ visibility: "all" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it("keeps omitted visibility backward-compatible by returning all records", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await callerWith(findMany).list();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });
});

const filters = (overrides: Partial<OpportunityBoardFilters> = {}): OpportunityBoardFilters => ({
  visibility: "active",
  search: "",
  source: "",
  service: "",
  stage: "",
  from: "",
  to: "",
  followUp: "",
  today: "2026-10-21",
  ...overrides,
});

function record(overrides: Partial<OpportunityBoardRecord> = {}): OpportunityBoardRecord {
  return {
    name: "Interior painting",
    stage: "follow_up",
    status: "open",
    serviceType: "Interior",
    source: "Website",
    leadReceivedAt: new Date("2026-10-10T04:00:00.000Z"),
    createdAt: new Date("2026-10-21T04:00:00.000Z"),
    followUpAt: new Date("2026-10-22T04:00:00.000Z"),
    customer: { name: "A Customer", leadSource: "Website", source: "Website" },
    ...overrides,
  };
}

describe("Opportunity board view filtering", () => {
  const opportunities = [
    record({ name: "Active lead" }),
    record({ name: "Archived lead", archivedAt: new Date("2026-10-20T12:00:00.000Z") }),
  ];

  it("Active, Archived only, and All are mutually correct visibility sets", () => {
    expect(filterOpportunityViews(opportunities, filters({ visibility: "active" })).kanban.map((o) => o.name)).toEqual(["Active lead"]);
    expect(filterOpportunityViews(opportunities, filters({ visibility: "archived" })).kanban.map((o) => o.name)).toEqual(["Archived lead"]);
    expect(filterOpportunityViews(opportunities, filters({ visibility: "all" })).kanban.map((o) => o.name)).toEqual(["Active lead", "Archived lead"]);
  });

  it("applies search, source, service, stage, lead-date and follow-up filters together with AND logic", () => {
    const { kanban } = filterOpportunityViews(opportunities, filters({
      visibility: "all",
      search: "active",
      source: "Website",
      service: "Interior",
      stage: "follow_up",
      from: "2026-10-09",
      to: "2026-10-11",
      followUp: "due",
    }));
    expect(kanban.map((o) => o.name)).toEqual([]);
    const due = record({ name: "Active lead", followUpAt: new Date("2026-10-20T04:00:00.000Z") });
    expect(filterOpportunityViews([due], filters({
      search: "active",
      source: "Website",
      service: "Interior",
      stage: "follow_up",
      from: "2026-10-09",
      to: "2026-10-11",
      followUp: "due",
    })).kanban).toEqual([due]);
  });

  it("gives Kanban and Table View the exact same filtered record set", () => {
    const views = filterOpportunityViews(opportunities, filters({ visibility: "archived" }));
    expect(views.kanban).toBe(views.table);
    expect(views.kanban.map((o) => o.name)).toEqual(["Archived lead"]);
  });

  it("places pipeline stages into Leads, Sales, Production, and Closed groups", () => {
    expect(OPPORTUNITY_BOARD_GROUPS.map((group) => group.label)).toEqual(["Leads", "Sales", "Production", "Closed"]);
    expect(OPPORTUNITY_BOARD_GROUPS[3].stages).toContain("completed");
    expect(OPPORTUNITY_BOARD_GROUPS[3].stages).toContain("lost");
  });
});

describe("Opportunity archive/restore refresh", () => {
  it("invalidates and refreshes the Opportunities list query on archive and restore success", async () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const refresh = () => refreshOpportunityQueries({
      opportunities: { invalidate },
      proposals: { invalidate: vi.fn().mockResolvedValue(undefined) },
      jobs: { invalidate: vi.fn().mockResolvedValue(undefined) },
      customers: { invalidate: vi.fn().mockResolvedValue(undefined) },
      analytics: { invalidate: vi.fn().mockResolvedValue(undefined) },
      reports: { invalidate: vi.fn().mockResolvedValue(undefined) },
    });

    await refresh();
    await refresh();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
