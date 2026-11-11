import { describe, expect, it, vi } from "vitest";
import { averageJobCompletionDurations, isJobCompletedInRange, jobCompletionReportingDate, summarizeCompletedJobs, synchronizeJobCompletion } from "./job-completion";

const nyDate = (date: string) => new Date(`${date}T04:00:00.000Z`);

function makeClient(options?: {
  status?: string;
  contractAmount?: number;
  totalEstimate?: number;
  completionSource?: "manual" | "payment" | null;
  completionPreviousStatus?: string | null;
  completedAt?: Date | null;
  opportunityId?: number | null;
  opportunity?: { id: number; stage: string; status: string; archivedAt?: Date | null } | null;
  invoices?: Array<{ total: number; status?: string }>;
  payments?: Array<{ amount: number; dateReceived: Date; status?: string }>;
}) {
  const job = {
    id: 8,
    status: options?.status ?? "active",
    contractAmount: options?.contractAmount ?? 1000,
    totalEstimate: options?.totalEstimate ?? 900,
    opportunityId: options?.opportunityId ?? null,
    completionSource: options?.completionSource ?? null,
    completionPreviousStatus: options?.completionPreviousStatus ?? null,
    completedAt: options?.completedAt ?? null,
  };
  const opportunity = options?.opportunity ?? null;
  const invoices = (options?.invoices ?? [{ total: 1000 }]).filter((invoice) => invoice.status !== "cancelled");
  const payments = (options?.payments ?? []).filter((payment) => payment.status !== "bounced");
  const tx = {
    job: {
      findUnique: vi.fn().mockImplementation(async () => ({ ...job })),
      update: vi.fn().mockImplementation(async ({ data }: { data: Partial<typeof job> }) => {
        Object.assign(job, data);
        return { ...job };
      }),
    },
    invoice: { findMany: vi.fn().mockResolvedValue(invoices) },
    payment: { findMany: vi.fn().mockResolvedValue(payments) },
    opportunity: {
      findUnique: vi.fn().mockImplementation(async () => opportunity ? { ...opportunity, leadValue: null, proposals: [] } : null),
      update: vi.fn().mockImplementation(async ({ data }: { data: Partial<typeof opportunity> }) => {
        if (opportunity) Object.assign(opportunity, data);
        return opportunity;
      }),
    },
  };
  return { tx, job, opportunity };
}

describe("synchronizeJobCompletion", () => {
  it("does not complete a Job after a partial payment", async () => {
    const { tx, job } = makeClient({ payments: [{ amount: 400, dateReceived: nyDate("2026-09-18") }] });
    await expect(synchronizeJobCompletion(tx as never, 8, 1)).resolves.toBe("unchanged");
    expect(job.status).toBe("active");
    expect(tx.job.update).not.toHaveBeenCalled();
  });

  describe("completion date reporting", () => {
    it("groups completion by completedAt, not updatedAt, and calculates durations from business dates", () => {
      const septemberStart = nyDate("2026-09-01");
      const octoberStart = nyDate("2026-10-01");
      const job = {
        status: "completed",
        completedAt: nyDate("2026-09-18"),
        updatedAt: nyDate("2026-10-21"),
        startDate: nyDate("2026-09-10"),
        workStartedAt: nyDate("2026-09-12"),
        leadReceivedAt: nyDate("2026-09-01"),
      };
      expect(isJobCompletedInRange(job, septemberStart, octoberStart)).toBe(true);
      expect(isJobCompletedInRange(job, octoberStart, nyDate("2026-11-01"))).toBe(false);
      expect(averageJobCompletionDurations([job], septemberStart, octoberStart)).toEqual({
        averageJobDurationDays: 6,
        averageLeadToCompletionDays: 17,
      });
    });

    it("prioritizes completedAt over a legacy endDate", () => {
      const job = { status: "completed", completedAt: nyDate("2026-09-18"), endDate: nyDate("2026-10-20") };
      expect(jobCompletionReportingDate(job)).toBe(job.completedAt);
      expect(isJobCompletedInRange(job, nyDate("2026-09-01"), nyDate("2026-10-01"))).toBe(true);
      expect(isJobCompletedInRange(job, nyDate("2026-10-01"), nyDate("2026-11-01"))).toBe(false);
    });

    it("reports legacy completion and durations using endDate without changing the Job", () => {
      const job = {
        status: "completed", completedAt: null, endDate: nyDate("2026-09-18"),
        startDate: nyDate("2026-09-10"), workStartedAt: null, leadReceivedAt: nyDate("2026-09-01"),
        createdAt: nyDate("2026-10-21"), updatedAt: nyDate("2026-10-21"),
      };
      expect(jobCompletionReportingDate(job)).toBe(job.endDate);
      expect(isJobCompletedInRange(job, nyDate("2026-09-01"), nyDate("2026-10-01"))).toBe(true);
      expect(isJobCompletedInRange(job, nyDate("2026-10-01"), nyDate("2026-11-01"))).toBe(false);
      expect(averageJobCompletionDurations([job], nyDate("2026-09-01"), nyDate("2026-10-01"))).toEqual({
        averageJobDurationDays: 8, averageLeadToCompletionDays: 17,
      });
      expect(job.completedAt).toBeNull();
    });

    it("keeps undated completions in the missing-date bucket and all-time count/value, never the entry month", () => {
      const missing = {
        status: "completed", completedAt: null, endDate: null, contractAmount: 1200, totalEstimate: 1000,
        createdAt: nyDate("2026-10-20"), updatedAt: nyDate("2026-10-21"),
      };
      const legacy = { ...missing, endDate: nyDate("2026-09-18"), contractAmount: 0 };
      const current = { ...missing, completedAt: nyDate("2026-09-25"), contractAmount: 500 };
      const active = { ...missing, status: "active" };
      expect(jobCompletionReportingDate(missing)).toBeNull();
      expect(isJobCompletedInRange(missing, nyDate("2026-10-01"), nyDate("2026-11-01"))).toBe(false);
      expect(summarizeCompletedJobs([missing, legacy, current, active])).toEqual({
        totalCompletedJobs: 3, totalCompletedValue: 2700,
        completionDateMissingCount: 1, completionDateMissingValue: 1200,
      });
    });
  });

  it.each([
    ["exact payment", 1000],
    ["overpayment", 1100],
  ])("completes on %s and uses the latest actual received date", async (_label, amount) => {
    const finalDate = nyDate("2026-09-18");
    const { tx, job } = makeClient({
      payments: [
        { amount: 400, dateReceived: nyDate("2026-09-12"), createdAt: nyDate("2026-10-21"), updatedAt: nyDate("2026-10-21") } as never,
        { amount: amount - 400, dateReceived: finalDate, createdAt: nyDate("2026-10-21"), updatedAt: nyDate("2026-10-21") } as never,
      ],
    });
    await expect(synchronizeJobCompletion(tx as never, 8, 1)).resolves.toBe("completed");
    expect(job).toMatchObject({
      status: "completed",
      completedAt: finalDate,
      completionSource: "payment",
      completionPreviousStatus: "active",
    });
    expect(tx.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobId: 8, status: { not: "bounced" } },
      select: { amount: true, dateReceived: true },
    }));
  });

  it("aggregates multiple invoices and ignores cancelled invoices", async () => {
    const { tx, job } = makeClient({
      contractAmount: 1000,
      invoices: [{ total: 600 }, { total: 600 }, { total: 900, status: "cancelled" }],
      payments: [{ amount: 1199, dateReceived: nyDate("2026-09-18") }],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("unchanged");
    expect(job.status).toBe("active");
    tx.payment.findMany.mockResolvedValue([{ amount: 1200, dateReceived: nyDate("2026-09-18") }]);
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("completed");
  });

  it("does not complete for a paid deposit while the canonical Job balance remains", async () => {
    const { tx, job } = makeClient({
      contractAmount: 2000,
      invoices: [{ total: 500 }, { total: 1500 }],
      payments: [{ amount: 500, dateReceived: nyDate("2026-09-18") }],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("unchanged");
    expect(job.status).toBe("active");
  });

  it.each([
    ["no invoice or contract", { contractAmount: 0, totalEstimate: 0, invoices: [] }],
    ["zero-value invoice", { contractAmount: 0, totalEstimate: 0, invoices: [{ total: 0 }] }],
    ["no payment", { payments: [] }],
    ["only bounced payment", { payments: [{ amount: 1000, dateReceived: nyDate("2026-09-18"), status: "bounced" }] }],
  ])("does not auto-complete a Job with %s", async (_label, options) => {
    const { tx, job } = makeClient(options);
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("unchanged");
    expect(job.status).toBe("active");
  });

  it("moves only an eligible explicitly linked Opportunity to review", async () => {
    const opportunity = { id: 4, stage: "service_delivery", status: "open" };
    const finalDate = nyDate("2026-09-18");
    const { tx } = makeClient({
      opportunityId: 4,
      opportunity,
      payments: [{ amount: 1000, dateReceived: finalDate }],
    });
    await synchronizeJobCompletion(tx as never, 8, 1);
    expect(opportunity.stage).toBe("review");
    expect(tx.opportunity.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastStageChangedAt: finalDate }),
    }));
    expect(tx.job.update.mock.invocationCallOrder[0]).toBeLessThan(tx.opportunity.update.mock.invocationCallOrder[0]!);
  });

  it.each(["lost", "not_qualified", "invalid_duplicate", "spam_fraud"])("protects terminal Opportunity stage %s", async (stage) => {
    const opportunity = { id: 4, stage, status: "lost" };
    const { tx } = makeClient({
      opportunityId: 4,
      opportunity,
      payments: [{ amount: 1000, dateReceived: nyDate("2026-09-18") }],
    });
    await synchronizeJobCompletion(tx as never, 8, 1);
    expect(opportunity.stage).toBe(stage);
    expect(tx.opportunity.update).not.toHaveBeenCalled();
  });

  it("never overwrites a manual completion date", async () => {
    const manualDate = nyDate("2026-08-01");
    const { tx, job } = makeClient({
      status: "completed",
      completionSource: "manual",
      completedAt: manualDate,
      payments: [{ amount: 1000, dateReceived: nyDate("2026-09-18") }],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("unchanged");
    expect(job.completedAt).toBe(manualDate);
    expect(tx.job.update).not.toHaveBeenCalled();
  });

  it("recalculates auto completion date when received payment dates change", async () => {
    const oldDate = nyDate("2026-09-18");
    const correctedDate = nyDate("2026-09-17");
    const { tx, job } = makeClient({
      status: "completed",
      completionSource: "payment",
      completionPreviousStatus: "active",
      completedAt: oldDate,
      payments: [{ amount: 1000, dateReceived: correctedDate }],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("updated");
    expect(job.completedAt).toBe(correctedDate);
  });

  it("reverses only payment completion and restores the recorded prior status", async () => {
    const { tx, job } = makeClient({
      status: "completed",
      completionSource: "payment",
      completionPreviousStatus: "on_hold",
      completedAt: nyDate("2026-09-18"),
      payments: [{ amount: 500, dateReceived: nyDate("2026-09-18") }],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("reversed");
    expect(job).toMatchObject({
      status: "on_hold",
      completedAt: null,
      completionSource: null,
      completionPreviousStatus: null,
    });
  });

  it("does not reverse a manual completion when its balance rises", async () => {
    const manualDate = nyDate("2026-08-01");
    const { tx, job } = makeClient({
      status: "completed",
      completionSource: "manual",
      completedAt: manualDate,
      payments: [],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("unchanged");
    expect(job.status).toBe("completed");
    expect(job.completedAt).toBe(manualDate);
  });

  it("throws rather than guessing when an automatic completion has no prior status", async () => {
    const { tx, job } = makeClient({
      status: "completed",
      completionSource: "payment",
      completionPreviousStatus: null,
      payments: [],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).rejects.toThrow("previous status is missing");
    expect(job.status).toBe("completed");
  });

  it("is idempotent after successful completion", async () => {
    const paymentDate = nyDate("2026-09-18");
    const { tx } = makeClient({
      status: "completed",
      completionSource: "payment",
      completionPreviousStatus: "active",
      completedAt: paymentDate,
      payments: [{ amount: 1000, dateReceived: paymentDate }],
    });
    await expect(synchronizeJobCompletion(tx as never, 8)).resolves.toBe("unchanged");
    expect(tx.job.update).not.toHaveBeenCalled();
  });
});
