-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('META', 'GOOGLE_ADS', 'WEBSITE', 'MANUAL');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'REAL', 'NOT_REAL', 'NO_ANSWER', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" "LeadSource" NOT NULL,
    "externalId" VARCHAR(191),
    "fullName" VARCHAR(200),
    "phone" VARCHAR(20),
    "email" VARCHAR(200),
    "serviceType" VARCHAR(120),
    "city" VARCHAR(100),
    "zipCode" VARCHAR(20),
    "outOfMap" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" VARCHAR(100),
    "campaignName" VARCHAR(255),
    "adsetId" VARCHAR(100),
    "adId" VARCHAR(100),
    "adName" VARCHAR(255),
    "formId" VARCHAR(100),
    "gclid" VARCHAR(255),
    "fbclid" VARCHAR(255),
    "utmSource" VARCHAR(255),
    "utmCampaign" VARCHAR(255),
    "utmContent" VARCHAR(255),
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "jobValue" DECIMAL(12,2),
    "notes" TEXT,
    "rawPayload" JSONB,
    "repeatCount" INTEGER NOT NULL DEFAULT 0,
    "lastRepeatAt" TIMESTAMP(3),
    "opportunityId" INTEGER,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadRepeat" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "source" "LeadSource" NOT NULL,
    "externalId" VARCHAR(191) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadRepeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_phone_createdAt_idx" ON "Lead"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_opportunityId_idx" ON "Lead"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_source_externalId_key" ON "Lead"("source", "externalId");

-- CreateIndex
CREATE INDEX "LeadRepeat_leadId_receivedAt_idx" ON "LeadRepeat"("leadId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadRepeat_source_externalId_key" ON "LeadRepeat"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRepeat" ADD CONSTRAINT "LeadRepeat_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

