-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('job_site', 'shop', 'office', 'travel', 'meeting', 'training', 'other');

-- AlterTable
ALTER TABLE "TimeEntry"
ADD COLUMN "workType" "WorkType" NOT NULL DEFAULT 'other';
