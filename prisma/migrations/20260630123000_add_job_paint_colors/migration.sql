-- CreateTable
CREATE TABLE "JobPaintColor" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "area" VARCHAR(100) NOT NULL,
    "colorName" VARCHAR(150) NOT NULL,
    "brand" VARCHAR(100),
    "finish" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPaintColor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPaintColor_jobId_idx" ON "JobPaintColor"("jobId");

-- AddForeignKey
ALTER TABLE "JobPaintColor" ADD CONSTRAINT "JobPaintColor_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
