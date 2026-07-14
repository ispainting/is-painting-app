-- Additive Milestone 1 foundation for expense receipt attachments.
CREATE TABLE "ExpenseAttachment" (
  "id" SERIAL NOT NULL,
  "expenseId" INTEGER,
  "uploadedById" INTEGER NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" VARCHAR(120) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseAttachment_storagePath_key" ON "ExpenseAttachment"("storagePath");
CREATE INDEX "ExpenseAttachment_expenseId_idx" ON "ExpenseAttachment"("expenseId");
CREATE INDEX "ExpenseAttachment_uploadedById_idx" ON "ExpenseAttachment"("uploadedById");
CREATE INDEX "ExpenseAttachment_uploadedAt_idx" ON "ExpenseAttachment"("uploadedAt");

ALTER TABLE "ExpenseAttachment"
  ADD CONSTRAINT "ExpenseAttachment_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseAttachment"
  ADD CONSTRAINT "ExpenseAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
