-- AlterTable
ALTER TABLE "Job"
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "customerNotes" TEXT,
ADD COLUMN "crewInstructions" TEXT,
ADD COLUMN "completionNotes" TEXT;
