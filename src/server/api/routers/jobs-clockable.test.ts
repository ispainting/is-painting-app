import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { jobsRouter } from "./jobs";
import { timeRouter } from "./time";
import { buildJobsListInputForPageFilter, buildJobsListWhere } from "@/lib/job-filters";
import { CLOCKABLE_REFETCH_INTERVAL_MS } from "@/lib/clock";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };
const employeeSession = { userId: 7, role: "employee" as const, email: "crew@example.test", name: "Crew" };

describe("jobs.clockable matches Jobs → Active exactly", () => {
  it("queries with the identical Active-tab where clause", async () => {
    const prisma = { job: { findMany: vi.fn().mockResolvedValue([]) } };
    await jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).clockable();

    const expected = buildJobsListWhere(buildJobsListInputForPageFilter("active"), { isEmployee: false });
    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(expected) })
    );
  });

  it("returns active jobs and excludes every other status and archived/deleted jobs by construction", async () => {
    const activeJob = { id: 5, name: "Active Job", status: "active", customer: { name: "C" } };
    const prisma = { job: { findMany: vi.fn().mockResolvedValue([activeJob]) } };
    const result = await jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).clockable();

    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("active");

    const where = prisma.job.findMany.mock.calls[0]?.[0].where;
    // Exact status equality: estimate/sent/approved/on_hold/completed/cancelled excluded.
    expect(where.status).toBe("active");
    // Archived/deleted excluded.
    expect(where.deletedAt).toBeNull();
  });

  it("restricts employees to their assigned active jobs", async () => {
    const prisma = { job: { findMany: vi.fn().mockResolvedValue([]) } };
    await jobsRouter.createCaller({ prisma: prisma as never, session: employeeSession }).clockable();
    const where = prisma.job.findMany.mock.calls[0]?.[0].where;
    expect(where.status).toBe("active");
    expect(where.assignments).toEqual({ some: { userId: 7 } });
  });
});

describe("history and active-shift preservation", () => {
  it("myEntries never filters by job status, so historical entries keep their original job", async () => {
    const historical = {
      id: 50,
      userId: 7,
      clockIn: new Date("2026-09-01T12:00:00Z"),
      job: { id: 42, name: "Old Job", status: "completed", deletedAt: new Date("2026-10-01") },
    };
    const prisma = { timeEntry: { findMany: vi.fn().mockResolvedValue([historical]) } };
    const result = await timeRouter
      .createCaller({ prisma: prisma as never, session: employeeSession })
      .myEntries({ days: 90 });

    const where = prisma.timeEntry.findMany.mock.calls[0]?.[0].where;
    expect(where.jobId).toBeUndefined();
    expect(where.job).toBeUndefined();
    expect(result[0]?.job?.name).toBe("Old Job"); // preserved and displayed
    expect(result[0]?.job?.status).toBe("completed");
  });

  it("an active shift stays valid after the job's status changes", async () => {
    const open = {
      id: 5,
      userId: 7,
      clockIn: new Date(Date.now() - 2 * 3600 * 1000),
      clockInLatitude: null,
      clockInLongitude: null,
      clockOutLatitude: null,
      clockOutLongitude: null,
      breakStartedAt: null,
      breakEndedAt: null,
    };
    const prisma = {
      timeEntry: {
        findFirst: vi.fn().mockResolvedValue(open),
        update: vi.fn().mockResolvedValue({ ...open, clockOut: new Date() }),
      },
      // The job became completed after clock-in; clockOut never checks job status.
      job: { findUnique: vi.fn().mockResolvedValue({ id: 42, status: "completed" }) },
    };
    await timeRouter.createCaller({ prisma: prisma as never, session: employeeSession }).clockOut({});
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
  });
});

describe("hourly refresh", () => {
  it("defines a one-hour refetch interval used by the clock page", () => {
    expect(CLOCKABLE_REFETCH_INTERVAL_MS).toBe(60 * 60 * 1000);
    const source = readFileSync(new URL("../../../app/(employee)/clock/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("refetchInterval: CLOCKABLE_REFETCH_INTERVAL_MS");
  });
});
