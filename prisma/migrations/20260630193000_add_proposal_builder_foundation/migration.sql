-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'sent', 'approved', 'declined', 'follow_up');

-- CreateTable
CREATE TABLE "Proposal" (
    "id" SERIAL NOT NULL,
    "proposalNumber" VARCHAR(20) NOT NULL,
    "customerId" INTEGER NOT NULL,
    "projectName" TEXT NOT NULL,
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(50),
    "zipCode" VARCHAR(20),
    "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
    "scopeOfWork" TEXT,
    "notes" TEXT,
    "materialsBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laborBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subcontractorBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_proposalNumber_key" ON "Proposal"("proposalNumber");

-- CreateIndex
CREATE INDEX "Proposal_customerId_idx" ON "Proposal"("customerId");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
