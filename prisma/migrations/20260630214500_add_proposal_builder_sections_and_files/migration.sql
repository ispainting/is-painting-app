-- AlterTable
ALTER TABLE "ProposalPaintColor"
ADD COLUMN "product" VARCHAR(150),
ADD COLUMN "colorCode" VARCHAR(100);

-- CreateTable
CREATE TABLE "ProposalSection" (
    "id" SERIAL NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "templateKey" VARCHAR(100),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bulletItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalSection_proposalId_idx" ON "ProposalSection"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalSection_proposalId_sortOrder_idx" ON "ProposalSection"("proposalId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProposalSection" ADD CONSTRAINT "ProposalSection_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
