-- CreateEnum
CREATE TYPE "TimeRateType" AS ENUM ('regular', 'island', 'travel', 'overtime');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "regularRate" DECIMAL(10,2),
ADD COLUMN     "islandRate" DECIMAL(10,2),
ADD COLUMN     "overtimeRate" DECIMAL(10,2);

ALTER TABLE "Job"
ADD COLUMN     "isIslandJob" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "travelPayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "defaultTravelHours" DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE "TimeEntry"
ADD COLUMN     "rateType" "TimeRateType" NOT NULL DEFAULT 'regular',
ADD COLUMN     "travelHours" DECIMAL(8,2);
