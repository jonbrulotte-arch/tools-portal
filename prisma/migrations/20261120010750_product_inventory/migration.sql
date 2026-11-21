-- CreateTable
CREATE TABLE "ProductInventory" (
    "partNumber" TEXT NOT NULL,
    "description" TEXT,
    "stock" JSONB NOT NULL DEFAULT '{}',
    "shipments" JSONB NOT NULL DEFAULT '{}',
    "otherShipments" INTEGER NOT NULL DEFAULT 0,
    "unitsLastMonth" INTEGER,
    "snapshotAt" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "error" TEXT,
    "errorAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductInventory_pkey" PRIMARY KEY ("partNumber")
);

-- CreateTable
CREATE TABLE "InventoryImportRun" (
    "id" TEXT NOT NULL,
    "status" "ShippingJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedById" TEXT,
    "startedBy" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryImportRun_createdAt_idx" ON "InventoryImportRun"("createdAt");
