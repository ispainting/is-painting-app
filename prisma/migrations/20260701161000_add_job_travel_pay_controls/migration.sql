-- CreateEnum
CREATE TYPE "JobTravelRateType" AS ENUM ('regular', 'island', 'custom');

-- AlterTable
ALTER TABLE "Job"
ADD COLUMN     "isIslandJob" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "travelPayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultTravelHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN     "travelRateType" "JobTravelRateType" NOT NULL DEFAULT 'regular',
ADD COLUMN     "customTravelRate" DECIMAL(10,2);
