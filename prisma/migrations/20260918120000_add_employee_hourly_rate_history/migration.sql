-- AlterTable
ALTER TABLE "TimeEntry"
ADD COLUMN     "hourlyRateSnapshot" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "EmployeeHourlyRateHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "EmployeeHourlyRateHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeHourlyRateHistory_userId_effectiveFrom_key" ON "EmployeeHourlyRateHistory"("userId", "effectiveFrom");
CREATE INDEX "EmployeeHourlyRateHistory_effectiveFrom_idx" ON "EmployeeHourlyRateHistory"("effectiveFrom");

ALTER TABLE "EmployeeHourlyRateHistory" ADD CONSTRAINT "EmployeeHourlyRateHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeHourlyRateHistory" ADD CONSTRAINT "EmployeeHourlyRateHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: preserve existing TimeEntry rows by snapshotting each entry's
-- current User.hourlyRate. No other TimeEntry column is modified.
UPDATE "TimeEntry" t
SET "hourlyRateSnapshot" = u."hourlyRate"
FROM "User" u
WHERE t."userId" = u."id" AND u."hourlyRate" IS NOT NULL;

-- Backfill: seed one initial effective-dated history row per user with a
-- non-null hourly rate, anchored to hireDate when known, otherwise createdAt.
INSERT INTO "EmployeeHourlyRateHistory" ("userId", "hourlyRate", "effectiveFrom", "createdAt")
SELECT "id", "hourlyRate", COALESCE("hireDate", "createdAt"), CURRENT_TIMESTAMP
FROM "User"
WHERE "hourlyRate" IS NOT NULL;
