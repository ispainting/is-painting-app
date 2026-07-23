-- Allow imported legacy expenses to preserve unresolved submitter metadata without assigning a fake user.
ALTER TABLE "Expense"
  ALTER COLUMN "submittedById" DROP NOT NULL,
  ADD COLUMN "legacySubmittedById" TEXT,
  ADD COLUMN "legacySubmittedByName" TEXT;
