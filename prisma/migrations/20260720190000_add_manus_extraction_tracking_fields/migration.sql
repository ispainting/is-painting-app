-- Add Manus extraction task tracking and retry-control fields.
ALTER TABLE "ExpenseAttachment"
ADD COLUMN "manusTaskId" VARCHAR(120),
ADD COLUMN "providerErrorCode" VARCHAR(64),
ADD COLUMN "extractionAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "extractionCompletedAt" TIMESTAMP(3);

CREATE INDEX "ExpenseAttachment_manusTaskId_idx" ON "ExpenseAttachment"("manusTaskId");
CREATE INDEX "ExpenseAttachment_providerErrorCode_idx" ON "ExpenseAttachment"("providerErrorCode");
