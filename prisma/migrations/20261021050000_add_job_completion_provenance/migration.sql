CREATE TYPE "JobCompletionSource" AS ENUM ('manual', 'payment');

ALTER TABLE "Job"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completionSource" "JobCompletionSource",
  ADD COLUMN "completionPreviousStatus" "JobStatus";

CREATE INDEX "Job_completedAt_idx" ON "Job"("completedAt");
