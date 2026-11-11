-- AlterTable (idempotent so a partially applied attempt can be safely re-run)
ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "leadReceivedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "proposalSentAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "workStartedAt"  TIMESTAMP(3);

-- Backfill only when an authoritative linked record exists.
-- Do not guess workStartedAt; leave it null unless the job actually began.
UPDATE "Job" j
SET "leadReceivedAt" = o."leadReceivedAt"
FROM "Opportunity" o
WHERE j."opportunityId" = o."id"
  AND o."leadReceivedAt" IS NOT NULL
  AND j."leadReceivedAt" IS NULL;

-- No reliable Job-Proposal relationship exists in the schema (Proposal has no
-- opportunityId/jobId), so historical proposalSentAt stays null by design.
-- Future convertToJob calls copy Proposal.sentAt at conversion time.

CREATE INDEX IF NOT EXISTS "Job_leadReceivedAt_idx" ON "Job"("leadReceivedAt");
CREATE INDEX IF NOT EXISTS "Job_proposalSentAt_idx" ON "Job"("proposalSentAt");
CREATE INDEX IF NOT EXISTS "Job_workStartedAt_idx" ON "Job"("workStartedAt");
