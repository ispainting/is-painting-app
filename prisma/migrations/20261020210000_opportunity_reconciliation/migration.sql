ALTER TYPE "OpportunityStage" ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE "OpportunityStage" ADD VALUE IF NOT EXISTS 'completed';

ALTER TABLE "Opportunity"
  ADD COLUMN "serviceType" TEXT,
  ADD COLUMN "referralSource" TEXT,
  ADD COLUMN "followUpAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "outcomeAt" TIMESTAMP(3),
  ADD COLUMN "outcomeReason" TEXT,
  ADD COLUMN "lostValue" DECIMAL(12,2);

CREATE INDEX "Opportunity_archivedAt_idx" ON "Opportunity"("archivedAt");

CREATE TABLE "OpportunityStageHistory" (
  "id" SERIAL PRIMARY KEY,
  "opportunityId" INTEGER NOT NULL,
  "previousStage" "OpportunityStage",
  "newStage" "OpportunityStage" NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedById" INTEGER,
  "reason" TEXT,
  "note" TEXT,
  CONSTRAINT "OpportunityStageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId")
    REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OpportunityStageHistory_changedById_fkey" FOREIGN KEY ("changedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "OpportunityStageHistory_opportunityId_effectiveAt_idx"
  ON "OpportunityStageHistory"("opportunityId", "effectiveAt");
