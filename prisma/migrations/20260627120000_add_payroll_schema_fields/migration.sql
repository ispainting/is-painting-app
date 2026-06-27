-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "attendanceFlags" JSONB,
ADD COLUMN     "breakDeductionMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "breakDurationMinutes" INTEGER,
ADD COLUMN     "breakEndedAt" TIMESTAMP(3),
ADD COLUMN     "breakStartedAt" TIMESTAMP(3),
ADD COLUMN     "calcVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "grossHours" DECIMAL(8,2),
ADD COLUMN     "lateBreakMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidHours" DECIMAL(8,2),
ADD COLUMN     "roundedBreakEndedAt" TIMESTAMP(3),
ADD COLUMN     "roundedBreakStartedAt" TIMESTAMP(3),
ADD COLUMN     "roundedClockIn" TIMESTAMP(3),
ADD COLUMN     "roundedClockOut" TIMESTAMP(3);

