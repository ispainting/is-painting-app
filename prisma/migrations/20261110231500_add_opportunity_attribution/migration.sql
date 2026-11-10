CREATE TABLE "OpportunityAttribution" (
  "id" SERIAL NOT NULL,
  "opportunityId" INTEGER NOT NULL,
  "platform" VARCHAR(50),
  "campaignId" VARCHAR(191),
  "campaignName" VARCHAR(300),
  "adSetId" VARCHAR(191),
  "adSetName" VARCHAR(300),
  "adId" VARCHAR(191),
  "adName" VARCHAR(300),
  "formId" VARCHAR(191),
  "formName" VARCHAR(300),
  "gclid" VARCHAR(300),
  "utmSource" VARCHAR(200),
  "utmMedium" VARCHAR(200),
  "utmCampaign" VARCHAR(300),
  "utmContent" VARCHAR(300),
  "utmTerm" VARCHAR(300),
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpportunityAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpportunityAttribution_opportunityId_key" ON "OpportunityAttribution"("opportunityId");
CREATE INDEX "OpportunityAttribution_platform_idx" ON "OpportunityAttribution"("platform");
CREATE INDEX "OpportunityAttribution_campaignId_idx" ON "OpportunityAttribution"("campaignId");
CREATE INDEX "OpportunityAttribution_adId_idx" ON "OpportunityAttribution"("adId");

ALTER TABLE "OpportunityAttribution"
ADD CONSTRAINT "OpportunityAttribution_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
