CREATE TABLE "AppNotification" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "kind" VARCHAR(60) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "body" TEXT NOT NULL,
  "href" VARCHAR(500),
  "dedupeKey" VARCHAR(200) NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppNotification_dedupeKey_key" ON "AppNotification"("dedupeKey");
CREATE INDEX "AppNotification_userId_createdAt_idx" ON "AppNotification"("userId", "createdAt");
CREATE INDEX "AppNotification_userId_readAt_idx" ON "AppNotification"("userId", "readAt");

ALTER TABLE "AppNotification"
ADD CONSTRAINT "AppNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
