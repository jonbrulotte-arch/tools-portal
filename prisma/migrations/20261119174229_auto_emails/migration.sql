-- CreateEnum
CREATE TYPE "AutoEmailTrigger" AS ENUM ('SCHEDULE', 'MANUAL', 'TEST');

-- CreateEnum
CREATE TYPE "AutoEmailStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "AutoEmail" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "to" TEXT[],
    "cc" TEXT[],
    "subject" TEXT NOT NULL,
    "appendDate" BOOLEAN NOT NULL DEFAULT true,
    "introText" TEXT NOT NULL DEFAULT '',
    "sqlQuery" TEXT NOT NULL DEFAULT '',
    "keyColumns" TEXT[],
    "closingText" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,

    CONSTRAINT "AutoEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoEmailSentKey" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyText" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logId" TEXT,

    CONSTRAINT "AutoEmailSentKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoEmailLog" (
    "id" TEXT NOT NULL,
    "emailId" TEXT,
    "emailName" TEXT NOT NULL,
    "trigger" "AutoEmailTrigger" NOT NULL,
    "status" "AutoEmailStatus" NOT NULL,
    "to" TEXT[],
    "cc" TEXT[],
    "subject" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "keys" JSONB,
    "html" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoEmailSentKey_sentAt_idx" ON "AutoEmailSentKey"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutoEmailSentKey_emailId_keyHash_key" ON "AutoEmailSentKey"("emailId", "keyHash");

-- CreateIndex
CREATE INDEX "AutoEmailLog_createdAt_idx" ON "AutoEmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "AutoEmailLog_emailId_createdAt_idx" ON "AutoEmailLog"("emailId", "createdAt");

-- AddForeignKey
ALTER TABLE "AutoEmailSentKey" ADD CONSTRAINT "AutoEmailSentKey_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "AutoEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoEmailLog" ADD CONSTRAINT "AutoEmailLog_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "AutoEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
