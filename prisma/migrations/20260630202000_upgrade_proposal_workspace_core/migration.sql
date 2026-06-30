-- CreateEnum
CREATE TYPE "ProposalTemplate" AS ENUM (
    'interior_painting',
    'exterior_painting',
    'cabinet_refinishing',
    'deck_restoration',
    'pergola_restoration',
    'trim_restoration',
    'wallpaper_removal',
    'drywall_repair',
    'commercial_painting',
    'new_construction',
    'property_maintenance'
);

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM (
    'residential',
    'commercial',
    'restoration',
    'maintenance',
    'new_construction',
    'custom'
);

-- AlterTable
ALTER TABLE "Proposal"
ADD COLUMN "proposalTemplate" "ProposalTemplate",
ADD COLUMN "proposalType" "ProposalType",
ADD COLUMN "projectSummary" TEXT,
ADD COLUMN "closingText" TEXT;

-- CreateTable
CREATE TABLE "ProposalPaintColor" (
    "id" SERIAL NOT NULL,
    "proposalId" INTEGER NOT NULL,
    "area" VARCHAR(100) NOT NULL,
    "colorName" VARCHAR(150) NOT NULL,
    "brand" VARCHAR(100),
    "finish" VARCHAR(100),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalPaintColor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalPaintColor_proposalId_idx" ON "ProposalPaintColor"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalPaintColor_proposalId_sortOrder_idx" ON "ProposalPaintColor"("proposalId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProposalPaintColor" ADD CONSTRAINT "ProposalPaintColor_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
