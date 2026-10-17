-- AlterTable
ALTER TABLE "Opportunity"
ADD COLUMN     "leadReceivedAt" TIMESTAMP(3);

-- Backfill legacy leads so monthly reporting keeps existing rows in their
-- original received month when the new business date is null.
UPDATE "Opportunity"
SET "leadReceivedAt" = "createdAt"
WHERE "leadReceivedAt" IS NULL;

CREATE INDEX "Opportunity_leadReceivedAt_idx" ON "Opportunity"("leadReceivedAt");
