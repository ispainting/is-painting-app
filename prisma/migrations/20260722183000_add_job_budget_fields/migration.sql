-- Extend Job with the remaining three budget categories.
ALTER TABLE "Job"
ADD COLUMN "equipmentBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "travelBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "otherBudget" DECIMAL(12,2) NOT NULL DEFAULT 0;
