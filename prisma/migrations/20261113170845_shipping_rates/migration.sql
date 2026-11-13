-- CreateEnum
CREATE TYPE "ShippingJobStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ShippingReport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedBy" TEXT,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ShippingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingHistoryAgg" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "zone" INTEGER NOT NULL,
    "zoneSource" TEXT NOT NULL,
    "weight" DECIMAL(8,2) NOT NULL,
    "count" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "minCost" DECIMAL(10,2) NOT NULL,
    "maxCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "ShippingHistoryAgg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingQuoteRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" TEXT,
    "startedBy" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ShippingQuoteRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingQuote" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "zone" INTEGER NOT NULL,
    "destZip" TEXT NOT NULL,
    "weight" DECIMAL(8,2) NOT NULL,
    "amount" DECIMAL(10,2),
    "listAmount" DECIMAL(10,2),
    "apiZone" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingReport_createdAt_idx" ON "ShippingReport"("createdAt");

-- CreateIndex
CREATE INDEX "ShippingHistoryAgg_reportId_carrier_origin_zone_idx" ON "ShippingHistoryAgg"("reportId", "carrier", "origin", "zone");

-- CreateIndex
CREATE INDEX "ShippingQuoteRun_createdAt_idx" ON "ShippingQuoteRun"("createdAt");

-- CreateIndex
CREATE INDEX "ShippingQuote_runId_carrier_origin_zone_idx" ON "ShippingQuote"("runId", "carrier", "origin", "zone");

-- AddForeignKey
ALTER TABLE "ShippingHistoryAgg" ADD CONSTRAINT "ShippingHistoryAgg_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ShippingReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingQuote" ADD CONSTRAINT "ShippingQuote_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ShippingQuoteRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
