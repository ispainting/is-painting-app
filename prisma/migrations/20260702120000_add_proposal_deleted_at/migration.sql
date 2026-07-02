ALTER TABLE "Proposal"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Proposal_deletedAt_idx"
ON "Proposal"("deletedAt");
