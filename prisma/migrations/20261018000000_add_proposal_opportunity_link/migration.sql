-- Phase 2A: nullable Proposal -> Opportunity pipeline link.
-- Additive only: no backfill, no changes to existing Proposal/Opportunity/Job/Customer data.
-- Existing rows keep opportunityId = NULL and are classified for manual review later.

-- Add the nullable foreign key column
ALTER TABLE "Proposal" ADD COLUMN "opportunityId" INTEGER;

-- Index for pipeline lookups
CREATE INDEX "Proposal_opportunityId_idx" ON "Proposal"("opportunityId");

-- Foreign key; SET NULL protects proposals if an opportunity is ever deleted
ALTER TABLE "Proposal"
  ADD CONSTRAINT "Proposal_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
