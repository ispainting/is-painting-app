ALTER TABLE "Customer"
  ADD COLUMN "status" VARCHAR(50),
  ADD COLUMN "preferredCommunication" VARCHAR(30),
  ADD COLUMN "secondaryPhoneNumbers" JSONB,
  ADD COLUMN "secondaryEmails" JSONB,
  ADD COLUMN "properties" JSONB,
  ADD COLUMN "emergencyContact" JSONB,
  ADD COLUMN "colorPreferences" JSONB,
  ADD COLUMN "paintHistory" JSONB,
  ADD COLUMN "productHistory" JSONB,
  ADD COLUMN "warrantyHistory" JSONB;

ALTER TABLE "CustomerTouchpoint"
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "CustomerFile"
  ADD COLUMN "previewUrl" TEXT,
  ADD COLUMN "mimeType" VARCHAR(120),
  ADD COLUMN "category" VARCHAR(80),
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Customer_leadSource_idx" ON "Customer"("leadSource");
CREATE INDEX "CustomerTouchpoint_customerId_isPinned_idx" ON "CustomerTouchpoint"("customerId", "isPinned");
CREATE INDEX "CustomerFile_customerId_category_idx" ON "CustomerFile"("customerId", "category");