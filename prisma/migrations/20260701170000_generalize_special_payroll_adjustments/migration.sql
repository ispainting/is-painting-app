-- Deploy-safe generalization:
-- Keep legacy island fields/enum values and add special-pay fields side-by-side.

-- Add non-destructive enum values for new generic semantics.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		WHERE t.typname = 'TimeRateType' AND e.enumlabel = 'special'
	) THEN
		ALTER TYPE "TimeRateType" ADD VALUE 'special';
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		WHERE t.typname = 'JobTravelRateType' AND e.enumlabel = 'special'
	) THEN
		ALTER TYPE "JobTravelRateType" ADD VALUE 'special';
	END IF;
END $$;

-- Add forward-compatible columns while preserving legacy columns.
ALTER TABLE "Job"
ADD COLUMN IF NOT EXISTS "specialPayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hourlyRateAdjustment" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "TimeEntry"
ADD COLUMN IF NOT EXISTS "specialPayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hourlyRateAdjustment" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill mappings from legacy island model into generic special-pay model.
UPDATE "Job"
SET
	"specialPayEnabled" = true,
	"hourlyRateAdjustment" = CASE
		WHEN COALESCE("hourlyRateAdjustment", 0) > 0 THEN "hourlyRateAdjustment"
		ELSE 2.00
	END,
	"travelRateType" = CASE
		WHEN "travelRateType"::text = 'island' THEN 'special'::"JobTravelRateType"
		ELSE "travelRateType"
	END
WHERE "isIslandJob" = true;

UPDATE "TimeEntry"
SET
	"specialPayEnabled" = true,
	"hourlyRateAdjustment" = CASE
		WHEN COALESCE("hourlyRateAdjustment", 0) > 0 THEN "hourlyRateAdjustment"
		ELSE 2.00
	END,
	"rateType" = CASE
		WHEN "rateType"::text = 'island' THEN 'special'::"TimeRateType"
		ELSE "rateType"
	END
WHERE "isIslandJob" = true OR "rateType"::text = 'island';
