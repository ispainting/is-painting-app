-- Hybrid proposal estimator foundation
-- Additive only: preserves all existing proposal estimator tables and columns.

-- CreateEnum
CREATE TYPE "ProposalEstimateMethod" AS ENUM ('LABOR_AND_MATERIALS', 'UNIT_PRICE', 'MANUAL_TOTAL', 'PRODUCTION_RATE');

-- CreateEnum
CREATE TYPE "ProposalPriceVisibilityMode" AS ENUM ('ITEMIZED', 'GROUPED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "GeneralLiabilityMode" AS ENUM ('PERCENT_OF_LABOR', 'PERCENT_OF_REVENUE', 'FLAT_AMOUNT', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "UnitPriceRateSource" AS ENUM ('SEEDED', 'MANUAL', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "ProposalMaterialPriceSourceType" AS ENUM ('INVENTORY_DEFAULT', 'EXPENSE_HISTORY', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProposalMaterialLineType" AS ENUM ('CATALOG', 'CUSTOM', 'MANUAL_TOTAL');

-- AlterTable
ALTER TABLE "Config"
ADD COLUMN "defaultDesiredProfitMarginPercent" DECIMAL(5,2) NOT NULL DEFAULT 35,
ADD COLUMN "defaultGeneralLiabilityMode" "GeneralLiabilityMode" NOT NULL DEFAULT 'PERCENT_OF_REVENUE',
ADD COLUMN "defaultMassTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 5,
ADD COLUMN "defaultFederalTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 12,
ADD COLUMN "defaultWorkDayHours" DECIMAL(5,2) NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "Proposal"
ADD COLUMN "estimateSummaryJson" JSONB;

-- AlterTable
ALTER TABLE "ProposalSection"
ADD COLUMN "phaseName" TEXT,
ADD COLUMN "workCategoryLabel" TEXT,
ADD COLUMN "clientNotes" TEXT,
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "estimateMethod" "ProposalEstimateMethod",
ADD COLUMN "priceVisibilityMode" "ProposalPriceVisibilityMode" DEFAULT 'ITEMIZED',
ADD COLUMN "estimateDataJson" JSONB,
ADD COLUMN "unitPriceTemplateId" INTEGER;

-- AlterTable
ALTER TABLE "ProposalSectionMaterial"
ADD COLUMN "lineType" "ProposalMaterialLineType" DEFAULT 'CATALOG',
ADD COLUMN "manualTotalAmount" DECIMAL(12,2),
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "priceSourceType" "ProposalMaterialPriceSourceType",
ADD COLUMN "priceSourceLabel" TEXT,
ADD COLUMN "priceSourceExpenseId" INTEGER,
ADD COLUMN "priceSourceExpenseLineItemId" INTEGER;

-- CreateTable
CREATE TABLE "UnitPriceTemplate" (
    "id" SERIAL NOT NULL,
    "templateKey" VARCHAR(120) NOT NULL,
    "serviceName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "unitLabel" VARCHAR(80) NOT NULL,
    "defaultPricePerUnit" DECIMAL(12,2) NOT NULL,
    "defaultLaborAllowance" DECIMAL(12,2),
    "defaultMaterialAllowance" DECIMAL(12,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rateSource" "UnitPriceRateSource" NOT NULL DEFAULT 'SEEDED',
    "comparableJobsCount" INTEGER NOT NULL DEFAULT 0,
    "averageActualLaborPerUnit" DECIMAL(12,2),
    "averageActualMaterialPerUnit" DECIMAL(12,2),
    "averageActualTotalCostPerUnit" DECIMAL(12,2),
    "averageSellingPricePerUnit" DECIMAL(12,2),
    "latestComparableCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitPriceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitPriceTemplate_templateKey_key" ON "UnitPriceTemplate"("templateKey");

-- CreateIndex
CREATE INDEX "UnitPriceTemplate_serviceName_variantName_isActive_idx" ON "UnitPriceTemplate"("serviceName", "variantName", "isActive");

-- CreateIndex
CREATE INDEX "UnitPriceTemplate_isActive_effectiveDate_idx" ON "UnitPriceTemplate"("isActive", "effectiveDate");

-- AddForeignKey
ALTER TABLE "ProposalSection"
ADD CONSTRAINT "ProposalSection_unitPriceTemplateId_fkey"
FOREIGN KEY ("unitPriceTemplateId") REFERENCES "UnitPriceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSectionMaterial"
ADD CONSTRAINT "ProposalSectionMaterial_priceSourceExpenseId_fkey"
FOREIGN KEY ("priceSourceExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSectionMaterial"
ADD CONSTRAINT "ProposalSectionMaterial_priceSourceExpenseLineItemId_fkey"
FOREIGN KEY ("priceSourceExpenseLineItemId") REFERENCES "ExpenseLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
