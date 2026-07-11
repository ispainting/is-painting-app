-- Employee workspace foundation: profile, payroll preferences, certifications, documents, notes, and activity

CREATE TYPE "EmployeeTravelRateType" AS ENUM ('regular', 'special', 'custom');
CREATE TYPE "EmployeeCertificationStatus" AS ENUM ('active', 'expiring_soon', 'expired');
CREATE TYPE "EmployeeDocumentType" AS ENUM ('driver_license', 'osha_card', 'contract', 'w9', 'i9', 'insurance', 'custom');
CREATE TYPE "EmployeeActivityType" AS ENUM (
  'created',
  'updated',
  'payroll_updated',
  'job_assigned',
  'job_unassigned',
  'archived',
  'restored',
  'deleted',
  'duplicated',
  'certification_added',
  'certification_updated',
  'certification_removed',
  'document_uploaded',
  'document_removed',
  'note_added'
);

ALTER TABLE "User"
ADD COLUMN "profilePhotoUrl" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "emergencyContactName" VARCHAR(120),
ADD COLUMN "emergencyContactPhone" VARCHAR(30),
ADD COLUMN "hireDate" TIMESTAMP(3),
ADD COLUMN "employeeCode" VARCHAR(50),
ADD COLUMN "specialJobAdjustment" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "overtimeMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
ADD COLUMN "overtimeRate" DECIMAL(8,2),
ADD COLUMN "travelPayEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "defaultTravelHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "travelRateType" "EmployeeTravelRateType" NOT NULL DEFAULT 'regular',
ADD COLUMN "customTravelRate" DECIMAL(8,2),
ADD COLUMN "payrollNotes" TEXT,
ADD COLUMN "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "EmployeeCertification" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "issuingAuthority" VARCHAR(120),
  "issueDate" TIMESTAMP(3),
  "expirationDate" TIMESTAMP(3),
  "reminderDays" INTEGER NOT NULL DEFAULT 30,
  "status" "EmployeeCertificationStatus" NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeCertification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeDocument" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "type" "EmployeeDocumentType" NOT NULL DEFAULT 'custom',
  "title" VARCHAR(160) NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT,
  "mimeType" VARCHAR(80),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeNote" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeActivity" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "actorId" INTEGER,
  "type" "EmployeeActivityType" NOT NULL,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmployeeActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeCertification_userId_idx" ON "EmployeeCertification"("userId");
CREATE INDEX "EmployeeCertification_status_idx" ON "EmployeeCertification"("status");
CREATE INDEX "EmployeeDocument_userId_idx" ON "EmployeeDocument"("userId");
CREATE INDEX "EmployeeDocument_type_idx" ON "EmployeeDocument"("type");
CREATE INDEX "EmployeeNote_userId_createdAt_idx" ON "EmployeeNote"("userId", "createdAt");
CREATE INDEX "EmployeeNote_authorId_idx" ON "EmployeeNote"("authorId");
CREATE INDEX "EmployeeActivity_userId_createdAt_idx" ON "EmployeeActivity"("userId", "createdAt");
CREATE INDEX "EmployeeActivity_type_idx" ON "EmployeeActivity"("type");

ALTER TABLE "EmployeeCertification"
ADD CONSTRAINT "EmployeeCertification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeDocument"
ADD CONSTRAINT "EmployeeDocument_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeNote"
ADD CONSTRAINT "EmployeeNote_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeNote"
ADD CONSTRAINT "EmployeeNote_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeActivity"
ADD CONSTRAINT "EmployeeActivity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeActivity"
ADD CONSTRAINT "EmployeeActivity_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
