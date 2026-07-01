-- CreateEnum
CREATE TYPE "TimeReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "TimeEntry"
ADD COLUMN "isIslandJob" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "overtimeOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "managerNotes" TEXT,
ADD COLUMN "reviewStatus" "TimeReviewStatus" NOT NULL DEFAULT 'pending';

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
