-- CreateEnum
CREATE TYPE "ProposalCategory" AS ENUM (
    'interior_painting',
    'exterior_painting',
    'deck_restoration',
    'pergola_restoration',
    'trim_restoration',
    'cabinet_refinishing',
    'wallpaper_removal',
    'drywall_repair',
    'commercial_painting',
    'new_construction',
    'property_maintenance',
    'custom'
);

-- CreateTable
CREATE TABLE "ProposalExample" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "proposalCategory" "ProposalCategory" NOT NULL,
    "proposalType" "ProposalType",
    "description" TEXT,
    "fullProposalContent" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalExample_proposalCategory_idx" ON "ProposalExample"("proposalCategory");

-- CreateIndex
CREATE INDEX "ProposalExample_proposalType_idx" ON "ProposalExample"("proposalType");

-- CreateIndex
CREATE INDEX "ProposalExample_title_idx" ON "ProposalExample"("title");
