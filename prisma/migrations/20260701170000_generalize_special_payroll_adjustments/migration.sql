-- Rename island-specific enum variants to generic special pay variants
ALTER TYPE "TimeRateType" RENAME VALUE 'island' TO 'special';
ALTER TYPE "JobTravelRateType" RENAME VALUE 'island' TO 'special';

-- Generalize job-level payroll settings
ALTER TABLE "Job"
RENAME COLUMN "isIslandJob" TO "specialPayEnabled";

ALTER TABLE "Job"
ADD COLUMN "hourlyRateAdjustment" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Snapshot generic special pay settings on time entries for stable payroll history
ALTER TABLE "TimeEntry"
RENAME COLUMN "isIslandJob" TO "specialPayEnabled";

ALTER TABLE "TimeEntry"
ADD COLUMN "hourlyRateAdjustment" DECIMAL(10,2) NOT NULL DEFAULT 0;
