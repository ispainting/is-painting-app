import { afterEach, describe, expect, it, vi } from "vitest";
import { businessRouter } from "./business";
import { reportsRouter } from "./reports";
import { customersRouter } from "./customers";

const session = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };
const date = (day: string) => new Date(`${day}T04:00:00Z`);
const jobs = [
  { id: 1, completedAt: date("2026-09-18"), endDate: date("2026-10-20") },
  { id: 2, completedAt: null, endDate: date("2026-09-25") },
  { id: 3, completedAt: null, endDate: null },
].map((job) => ({
  ...job, name: `Job ${job.id}`, status: "completed", contractAmount: 1000, totalEstimate: 900,
  startDate: null, workStartedAt: null, leadReceivedAt: null,
  createdAt: date("2020-01-01"), updatedAt: date("2026-10-21"),
  customer: { id: 1, name: "Customer", source: null },
}));

function mocks() {
  const rows = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  return {
    job: { findMany: vi.fn().mockResolvedValue(jobs), count: vi.fn().mockResolvedValue(0) },
    opportunity: { ...rows(), count: vi.fn().mockResolvedValue(0) },
    proposal: rows(),
    invoice: rows(),
    payment: { ...rows(), aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    expense: { ...rows(), aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    timeEntry: rows(),
    user: { ...rows(), count: vi.fn().mockResolvedValue(0) },
    automationRun: rows(),
    auditLog: rows(),
  };
}

afterEach(() => vi.useRealTimers());

describe("legacy Job completion reporting", () => {
  it("keeps legacy and undated completions in Analytics totals without inventing October completions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(date("2026-10-21"));
    const prisma = mocks();
    const result = await businessRouter.createCaller({ prisma: prisma as never, session }).analytics({
      periodType: "month", month: 9, year: 2026,
    });
    expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ deletedAt: null, OR: expect.arrayContaining([{ status: "completed" }]) }),
      select: expect.objectContaining({ completedAt: true, endDate: true }),
    }));
    expect(result.dashboard.operations).toMatchObject({
      completedJobs: 2, totalCompletedJobs: 3, totalCompletedValue: 3000,
      completionDateMissingCount: 1, completionDateMissingValue: 1000,
    });
    expect(result.jobCompletions.series.find((row) => row.key === "2026-09")).toMatchObject({ completedJobs: 2, completedValue: 2000 });
    expect(result.jobCompletions.series.find((row) => row.key === "2026-10")).toMatchObject({ completedJobs: 0, completedValue: 0 });
  });

  it("includes the legacy End Date in Dashboard completed revenue and exposes undated value separately", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(date("2026-09-30"));
    const prisma = mocks();
    const result = await reportsRouter.createCaller({ prisma: prisma as never, session }).dashboard();
    expect(prisma.job.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ status: "completed" }]) }),
      select: expect.objectContaining({ completedAt: true, endDate: true }),
    }));
    expect(result.production).toMatchObject({
      completedRevenueThisMonth: 2000, totalCompletedJobs: 3, totalCompletedValue: 3000,
      completionDateMissingCount: 1, completionDateMissingValue: 1000,
    });
  });

  it("uses business completion dates in customer history, retaining undated Jobs in customer totals", async () => {
    const prisma = {
      ...mocks(),
      customer: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1, name: "Customer", createdAt: date("2020-01-01"), deletedAt: null,
          jobs, proposals: [], invoices: [], touchpoints: [], files: [], reviewSubmissions: [],
        }),
      },
    };
    const result = await customersRouter.createCaller({ prisma: prisma as never, session }).profile({ id: 1 });
    expect(result?.stats).toMatchObject({
      jobsCompleted: 3, completionDateMissingCount: 1, completionDateMissingValue: 1000,
    });
    const completions = result?.timeline.filter((event) => event.type === "job_completed");
    expect(completions?.map((event) => event.at)).toEqual([date("2026-09-25"), date("2026-09-18")]);
  });
});
