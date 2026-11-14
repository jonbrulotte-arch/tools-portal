-- CreateEnum
CREATE TYPE "ProductRateItemStatus" AS ENUM ('OK', 'NO_DATA', 'FAILED');

-- CreateTable
CREATE TABLE "ProductRateRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" TEXT,
    "startedBy" TEXT,
    "listId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "comparedRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProductRateRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRateItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "partNumber" TEXT NOT NULL,
    "name" TEXT,
    "packaging" TEXT,
    "weight" DECIMAL(8,2),
    "length" DECIMAL(8,2),
    "width" DECIMAL(8,2),
    "height" DECIMAL(8,2),
    "sizeSource" TEXT,
    "upsBillable" DECIMAL(8,2),
    "uspsBillable" DECIMAL(8,2),
    "status" "ProductRateItemStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRateQuote" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "zone" INTEGER NOT NULL,
    "carrier" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "destZip" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "listAmount" DECIMAL(10,2),
    "negotiated" BOOLEAN,
    "chart" DECIMAL(10,2),
    "diffPct" DECIMAL(8,1),
    "error" TEXT,

    CONSTRAINT "ProductRateQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductRateRun_createdAt_idx" ON "ProductRateRun"("createdAt");

-- CreateIndex
CREATE INDEX "ProductRateItem_runId_partNumber_idx" ON "ProductRateItem"("runId", "partNumber");

-- CreateIndex
CREATE INDEX "ProductRateItem_partNumber_idx" ON "ProductRateItem"("partNumber");

-- CreateIndex
CREATE INDEX "ProductRateQuote_itemId_idx" ON "ProductRateQuote"("itemId");

-- AddForeignKey
ALTER TABLE "ProductRateItem" ADD CONSTRAINT "ProductRateItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductRateRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRateQuote" ADD CONSTRAINT "ProductRateQuote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProductRateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
