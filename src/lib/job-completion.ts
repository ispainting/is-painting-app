import type { JobStatus, Prisma } from "@prisma/client";
import { applyOpportunityTransition } from "./pipeline-sync";
import { jobCanonicalTotal } from "./job-total";

type CompletionClient = Pick<Prisma.TransactionClient, "job" | "invoice" | "payment" | "opportunity">;

type CompletionDates = { completedAt: Date | null; endDate?: Date | null };

export function jobCompletionReportingDate(job: CompletionDates): Date | null {
  return job.completedAt ?? job.endDate ?? null;
}

export function summarizeCompletedJobs(
  jobs: Array<CompletionDates & { status: string; contractAmount: unknown; totalEstimate: unknown }>
) {
  const completed = jobs.filter((job) => job.status === "completed");
  const missing = completed.filter((job) => jobCompletionReportingDate(job) === null);
  return {
    totalCompletedJobs: completed.length,
    totalCompletedValue: completed.reduce((sum, job) => sum + jobCanonicalTotal(job), 0),
    completionDateMissingCount: missing.length,
    completionDateMissingValue: missing.reduce((sum, job) => sum + jobCanonicalTotal(job), 0),
  };
}

export function isJobCompletedInRange(
  job: CompletionDates & { status: string },
  start: Date,
  end: Date
): boolean {
  const date = jobCompletionReportingDate(job);
  return job.status === "completed" && date !== null &&
    date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

export function averageJobCompletionDurations(
  jobs: Array<{
    status: string;
    completedAt: Date | null;
    endDate?: Date | null;
    startDate: Date | null;
    workStartedAt: Date | null;
    leadReceivedAt: Date | null;
  }>,
  start: Date,
  end: Date
): { averageJobDurationDays: number | null; averageLeadToCompletionDays: number | null } {
  const completed = jobs.filter((job) => isJobCompletedInRange(job, start, end));
  const averageDays = (dates: Array<[Date | null, Date | null]>) => {
    const durations = dates
      .filter((pair): pair is [Date, Date] => pair[0] !== null && pair[1] !== null && pair[1] >= pair[0])
      .map(([from, to]) => (to.getTime() - from.getTime()) / 86_400_000);
    return durations.length ? durations.reduce((sum, days) => sum + days, 0) / durations.length : null;
  };
  return {
    averageJobDurationDays: averageDays(completed.map((job) => [job.workStartedAt ?? job.startDate, jobCompletionReportingDate(job)])),
    averageLeadToCompletionDays: averageDays(completed.map((job) => [job.leadReceivedAt, jobCompletionReportingDate(job)])),
  };
}

function cents(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw new Error("Job balance contains an invalid amount.");
  return Math.round(amount * 100);
}

export async function synchronizeJobCompletion(
  tx: CompletionClient,
  jobId: number,
  changedById?: number
): Promise<"unchanged" | "completed" | "updated" | "reversed"> {
  const job = await tx.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      contractAmount: true,
      totalEstimate: true,
      opportunityId: true,
      completionSource: true,
      completionPreviousStatus: true,
      completedAt: true,
    },
  });
  if (!job) throw new Error(`Cannot synchronize completion: Job ${jobId} was not found.`);

  const [invoices, payments] = await Promise.all([
    tx.invoice.findMany({
      where: { jobId, status: { not: "cancelled" } },
      select: { total: true },
    }),
    tx.payment.findMany({
      where: { jobId, status: { not: "bounced" } },
      select: { amount: true, dateReceived: true },
    }),
  ]);

  const projectTotalCents = cents(Number(job.contractAmount) > 0 ? job.contractAmount : job.totalEstimate);
  const invoicedTotalCents = invoices.reduce((sum, invoice) => sum + cents(invoice.total), 0);
  const collectibleTotalCents = Math.max(projectTotalCents, invoicedTotalCents);
  const paidTotalCents = payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const latestPaymentAt = payments.reduce<Date | null>(
    (latest, payment) => !latest || payment.dateReceived > latest ? payment.dateReceived : latest,
    null
  );
  const fullyPaid = collectibleTotalCents > 0 && payments.length > 0 && paidTotalCents >= collectibleTotalCents;

  if (fullyPaid) {
    if (job.status === "completed") {
      if (job.completionSource !== "payment" || !latestPaymentAt || job.completedAt?.getTime() === latestPaymentAt.getTime()) {
        return "unchanged";
      }
      await tx.job.update({ where: { id: jobId }, data: { completedAt: latestPaymentAt } });
      return "updated";
    }
    if (!latestPaymentAt) return "unchanged";
    await tx.job.update({
      where: { id: jobId },
      data: {
        status: "completed",
        completedAt: latestPaymentAt,
        completionSource: "payment",
        completionPreviousStatus: job.status as JobStatus,
      },
    });
    await applyOpportunityTransition(tx, job.opportunityId, "review", {
      effectiveAt: latestPaymentAt,
      changedById,
      reason: "Job balance paid",
    });
    return "completed";
  }

  if (job.completionSource === "payment") {
    if (!job.completionPreviousStatus) {
      throw new Error(`Cannot safely reverse automated completion for Job ${jobId}: previous status is missing.`);
    }
    await tx.job.update({
      where: { id: jobId },
      data: {
        status: job.completionPreviousStatus,
        completedAt: null,
        completionSource: null,
        completionPreviousStatus: null,
      },
    });
    return "reversed";
  }

  return "unchanged";
}
