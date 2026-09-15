-- Additive follow-up to 20260824210000_complete_proposal_estimating_system.
-- This migration intentionally preserves the original migration's checksum.

-- CreateEnum
CREATE TYPE "ProductionRateBasis" AS ENUM ('SQFT_PER_HOUR', 'LINEAR_FT_PER_HOUR', 'HOURS_PER_ITEM', 'FIXED_HOURS');

-- CreateEnum
CREATE TYPE "ProductionRateCategory" AS ENUM ('INTERIOR', 'EXTERIOR', 'PREP', 'SPECIALTY');

-- CreateEnum
CREATE TYPE "ProposalPricingMethod" AS ENUM ('GROSS_MARGIN', 'MARKUP');

-- AlterTable
ALTER TABLE "Config" ADD COLUMN "defaultProposalPricingMethod" "ProposalPricingMethod" NOT NULL DEFAULT 'GROSS_MARGIN',
ALTER COLUMN "defaultWcPercent" SET DEFAULT 3.5;

-- Reconcile the approved Workers' Compensation default from 17.5% to 3.5%.
UPDATE "Config"
SET "defaultWcPercent" = 3.5
WHERE id = 1;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "coveragePerUnit" DECIMAL(10,2),
ADD COLUMN "defaultWastePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "estimateDirectLaborCost" DECIMAL(12,2),
ADD COLUMN "estimateDirectProjectCost" DECIMAL(12,2),
ADD COLUMN "estimateEffectiveSalesRate" DECIMAL(10,2),
ADD COLUMN "estimateEngineVersion" INTEGER,
ADD COLUMN "estimateEquipmentCost" DECIMAL(12,2),
ADD COLUMN "estimateFinalProposalPrice" DECIMAL(12,2),
ADD COLUMN "estimateGrossMarginPercent" DECIMAL(5,2),
ADD COLUMN "estimateGrossProfitDollars" DECIMAL(12,2),
ADD COLUMN "estimateLaborBurdenCost" DECIMAL(12,2),
ADD COLUMN "estimateLoadedLaborCost" DECIMAL(12,2),
ADD COLUMN "estimateLogisticsCost" DECIMAL(12,2),
ADD COLUMN "estimateMaterialCost" DECIMAL(12,2),
ADD COLUMN "estimateMiscProjectCost" DECIMAL(12,2),
ADD COLUMN "estimateOverheadDollars" DECIMAL(12,2),
ADD COLUMN "estimateOverheadPercentSnapshot" DECIMAL(5,2),
ADD COLUMN "estimatePainterHoursTotal" DECIMAL(8,2),
ADD COLUMN "estimatePriceOverride" DECIMAL(12,2),
ADD COLUMN "estimatePricingMethod" "ProposalPricingMethod",
ADD COLUMN "estimateRecommendedSellingPrice" DECIMAL(12,2),
ADD COLUMN "estimateSubcontractorCost" DECIMAL(12,2),
ADD COLUMN "estimateTargetMarginPercent" DECIMAL(5,2),
ADD COLUMN "estimateTargetMarkupPercent" DECIMAL(5,2),
ADD COLUMN "estimateTrueJobCost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ProposalSection" ADD COLUMN "adjustedLaborHours" DECIMAL(8,2),
ADD COLUMN "areaName" TEXT,
ADD COLUMN "calculatedLaborHours" DECIMAL(8,2),
ADD COLUMN "coats" INTEGER,
ADD COLUMN "customerDisplayLabel" TEXT,
ADD COLUMN "directLaborCostRateSnapshot" DECIMAL(10,2),
ADD COLUMN "directLaborCostSnapshot" DECIMAL(12,2),
ADD COLUMN "effectiveLaborHours" DECIMAL(8,2),
ADD COLUMN "groupIntoAreaPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "laborBurdenCostSnapshot" DECIMAL(12,2),
ADD COLUMN "loadedLaborCostSnapshot" DECIMAL(12,2),
ADD COLUMN "measurementType" TEXT,
ADD COLUMN "measurementValue" DECIMAL(12,2),
ADD COLUMN "otherLaborBurdenCostSnapshot" DECIMAL(12,2),
ADD COLUMN "otherLaborBurdenPercentSnapshot" DECIMAL(5,2),
ADD COLUMN "prepLevel" TEXT,
ADD COLUMN "priceVisibility" TEXT DEFAULT 'SHOW',
ADD COLUMN "productionRateId" INTEGER,
ADD COLUMN "sectionSellingPriceSnapshot" DECIMAL(12,2),
ADD COLUMN "wcCostSnapshot" DECIMAL(12,2),
ADD COLUMN "wcPercentSnapshot" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "ProposalSectionMaterial" ADD COLUMN "adjustedQuantity" DECIMAL(10,2),
ADD COLUMN "calculatedQuantity" DECIMAL(10,2),
ADD COLUMN "coveragePerUnitSnapshot" DECIMAL(10,2),
ADD COLUMN "wastePercentSnapshot" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "ProductionRate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductionRateCategory" NOT NULL,
    "surfaceType" TEXT NOT NULL,
    "basis" "ProductionRateBasis" NOT NULL,
    "rateValue" DECIMAL(10,2) NOT NULL,
    "coats" INTEGER,
    "prepLevel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionRate_category_surfaceType_isActive_idx" ON "ProductionRate"("category", "surfaceType", "isActive");

-- CreateIndex
CREATE INDEX "ProductionRate_isActive_isDefault_idx" ON "ProductionRate"("isActive", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRate_active_profile_unique_idx"
ON "ProductionRate"(
  "category",
  "surfaceType",
  "basis",
  COALESCE("coats", -1),
  COALESCE(NULLIF(BTRIM("prepLevel"), ''), '__NO_PREP_LEVEL__')
)
WHERE "isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRate_active_default_profile_unique_idx"
ON "ProductionRate"(
  "category",
  "surfaceType",
  "basis",
  COALESCE("coats", -1),
  COALESCE(NULLIF(BTRIM("prepLevel"), ''), '__NO_PREP_LEVEL__')
)
WHERE "isActive" = true AND "isDefault" = true;

-- AddForeignKey
ALTER TABLE "ProposalSection" ADD CONSTRAINT "ProposalSection_productionRateId_fkey" FOREIGN KEY ("productionRateId") REFERENCES "ProductionRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;