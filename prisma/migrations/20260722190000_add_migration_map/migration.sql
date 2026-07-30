CREATE TABLE "MigrationMap" (
    "id" SERIAL NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "legacyId" VARCHAR(191) NOT NULL,
    "newId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MigrationMap_entityType_legacyId_key" ON "MigrationMap"("entityType", "legacyId");
CREATE INDEX "MigrationMap_entityType_newId_idx" ON "MigrationMap"("entityType", "newId");
CREATE INDEX "MigrationMap_createdAt_idx" ON "MigrationMap"("createdAt");
