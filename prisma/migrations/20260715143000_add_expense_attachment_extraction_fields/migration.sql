-- CreateEnum
CREATE TYPE "ReceiptExtractionStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'needs_review');

-- AlterTable
ALTER TABLE "ExpenseAttachment"
ADD COLUMN "extractionStatus" "ReceiptExtractionStatus" NOT NULL DEFAULT 'queued',
ADD COLUMN "extractionRawText" TEXT,
ADD COLUMN "extractionStructured" JSONB,
ADD COLUMN "extractionConfidence" DECIMAL(5,4),
ADD COLUMN "extractionConfidenceByField" JSONB,
ADD COLUMN "extractionProvider" VARCHAR(80),
ADD COLUMN "extractionModel" VARCHAR(120),
ADD COLUMN "extractionError" TEXT,
ADD COLUMN "extractionStartedAt" TIMESTAMP(3),
ADD COLUMN "extractionProcessedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExpenseAttachment_extractionStatus_idx" ON "ExpenseAttachment"("extractionStatus");

-- CreateIndex
CREATE INDEX "ExpenseAttachment_extractionProcessedAt_idx" ON "ExpenseAttachment"("extractionProcessedAt");
