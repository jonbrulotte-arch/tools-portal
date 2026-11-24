-- CreateTable
CREATE TABLE "ShippingPackage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "tracking" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "zone" INTEGER NOT NULL,
    "actualWeight" DOUBLE PRECISION,
    "billedWeight" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "po" TEXT,
    "so" TEXT,
    "marketplace" TEXT,
    "channel" TEXT,
    "reference" TEXT,
    "shipRef" TEXT,
    "destCompany" TEXT,
    "destState" TEXT,

    CONSTRAINT "ShippingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingPackage_reportId_carrier_idx" ON "ShippingPackage"("reportId", "carrier");

-- AddForeignKey
ALTER TABLE "ShippingPackage" ADD CONSTRAINT "ShippingPackage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ShippingReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
