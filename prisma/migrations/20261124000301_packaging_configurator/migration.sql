-- CreateTable
CREATE TABLE "PackProduct" (
    "partNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "height" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "upc" TEXT,
    "foldable" BOOLEAN NOT NULL DEFAULT false,
    "shipsOwn" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackProduct_pkey" PRIMARY KEY ("partNumber")
);

-- CreateTable
CREATE TABLE "PackPackaging" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'box',
    "height" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "maxHeight" DOUBLE PRECISION,
    "maxWeight" DOUBLE PRECISION,
    "tareWeight" DOUBLE PRECISION,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackShippingMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxWeight" DOUBLE PRECISION,
    "dimDivisor" DOUBLE PRECISION,
    "dimThreshold" DOUBLE PRECISION,
    "isLtl" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackShippingRate" (
    "id" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "maxWeight" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PackShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackSyncRun" (
    "id" TEXT NOT NULL,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" TEXT,
    "startedBy" TEXT,
    "listId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "incomplete" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PackSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackAnalysisRun" (
    "id" TEXT NOT NULL,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" TEXT,
    "startedBy" TEXT,
    "trigger" TEXT NOT NULL,
    "products" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PackAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackPush" (
    "partNumber" TEXT NOT NULL,
    "values" JSONB,
    "pushedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackPush_pkey" PRIMARY KEY ("partNumber")
);

-- CreateTable
CREATE TABLE "PackPushRun" (
    "id" TEXT NOT NULL,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" TEXT,
    "startedBy" TEXT,
    "analysisRunId" TEXT,
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

    CONSTRAINT "PackPushRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackProduct_upc_idx" ON "PackProduct"("upc");

-- CreateIndex
CREATE INDEX "PackProduct_name_idx" ON "PackProduct"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackPackaging_name_key" ON "PackPackaging"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackShippingMethod_name_key" ON "PackShippingMethod"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackShippingRate_methodId_maxWeight_key" ON "PackShippingRate"("methodId", "maxWeight");

-- CreateIndex
CREATE INDEX "PackSyncRun_createdAt_idx" ON "PackSyncRun"("createdAt");

-- CreateIndex
CREATE INDEX "PackAnalysisRun_createdAt_idx" ON "PackAnalysisRun"("createdAt");

-- CreateIndex
CREATE INDEX "PackPushRun_createdAt_idx" ON "PackPushRun"("createdAt");

-- AddForeignKey
ALTER TABLE "PackShippingRate" ADD CONSTRAINT "PackShippingRate_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PackShippingMethod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
