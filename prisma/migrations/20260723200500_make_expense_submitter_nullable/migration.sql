-- Allow imported legacy expenses to preserve unresolved submitter metadata without assigning a fake user.
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_submittedById_fkey";

ALTER TABLE "Expense"
  ALTER COLUMN "submittedById" DROP NOT NULL,
  ADD COLUMN "legacySubmittedById" TEXT,
  ADD COLUMN "legacySubmittedByName" TEXT;

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
