-- CreateTable
CREATE TABLE "SalsifyPush" (
    "partNumber" TEXT NOT NULL,
    "cost" TEXT,
    "note" TEXT,
    "pushedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalsifyPush_pkey" PRIMARY KEY ("partNumber")
);

-- CreateTable
CREATE TABLE "SalsifyPushRun" (
    "id" TEXT NOT NULL,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" TEXT,
    "startedBy" TEXT,
    "property" TEXT NOT NULL,
    "productRunId" TEXT,
    "products" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "written" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "problems" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SalsifyPushRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalsifyPushRun_createdAt_idx" ON "SalsifyPushRun"("createdAt");
