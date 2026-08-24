-- Migration: complete_proposal_estimating_system
-- Generated locally via `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (read-only introspection of Production; nothing was written). NOT applied.
-- Scope: Proposal estimating system only (Config, InventoryItem, Proposal,
-- ProposalSection, new ProposalSectionMaterial table). No Expense, Job, Customer,
-- MigrationMap, or TimeEntry schema changes are included.

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_customerId_fkey";

-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "defaultLaborCostRate" DECIMAL(10,2),
ADD COLUMN     "defaultLaborSellRate" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "defaultMarkupPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Proposal" ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProposalSection" ADD COLUMN     "additionalCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedLaborHours" DECIMAL(8,2),
ADD COLUMN     "laborCostRateSnapshot" DECIMAL(10,2),
ADD COLUMN     "laborSellRateSnapshot" DECIMAL(10,2),
ADD COLUMN     "laborSellingPriceSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "materialsCostSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "materialsSellingPriceSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "scopeSubtotalSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProposalSectionMaterial" (
    "id" SERIAL NOT NULL,
    "proposalSectionId" INTEGER NOT NULL,
    "inventoryItemId" INTEGER,
    "nameSnapshot" TEXT NOT NULL,
    "unitSnapshot" VARCHAR(50) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitCostSnapshot" DECIMAL(10,2) NOT NULL,
    "markupPercentSnapshot" DECIMAL(5,2) NOT NULL,
    "materialCostSnapshot" DECIMAL(12,2) NOT NULL,
    "sellingPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalSectionMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalSectionMaterial_proposalSectionId_idx" ON "ProposalSectionMaterial"("proposalSectionId");

-- CreateIndex
CREATE INDEX "ProposalSectionMaterial_proposalSectionId_sortOrder_idx" ON "ProposalSectionMaterial"("proposalSectionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSectionMaterial" ADD CONSTRAINT "ProposalSectionMaterial_proposalSectionId_fkey" FOREIGN KEY ("proposalSectionId") REFERENCES "ProposalSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSectionMaterial" ADD CONSTRAINT "ProposalSectionMaterial_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
