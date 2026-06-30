-- AlterEnum
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'viewed';
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'converted';

-- AlterTable
ALTER TABLE "Proposal"
ADD COLUMN "includedWork" TEXT,
ADD COLUMN "exclusions" TEXT,
ADD COLUMN "importantNotes" TEXT,
ADD COLUMN "recommendations" TEXT,
ADD COLUMN "proposalBody" TEXT,
ADD COLUMN "aiAssistantNotes" TEXT,
ADD COLUMN "emailBody" TEXT,
ADD COLUMN "referencesText" TEXT,
ADD COLUMN "termsAndConditions" TEXT,
ADD COLUMN "paymentSchedule" TEXT,
ADD COLUMN "expectedStartDate" TIMESTAMP(3),
ADD COLUMN "expectedEndDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProposalOption" (
    "id" SERIAL NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "price" DECIMAL(12,2),
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalAttachment" (
    "id" SERIAL NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalOption_proposalId_idx" ON "ProposalOption"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalOption_proposalId_sortOrder_idx" ON "ProposalOption"("proposalId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProposalAttachment_proposalId_idx" ON "ProposalAttachment"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalAttachment_proposalId_sortOrder_idx" ON "ProposalAttachment"("proposalId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProposalOption" ADD CONSTRAINT "ProposalOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAttachment" ADD CONSTRAINT "ProposalAttachment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
