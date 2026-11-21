-- CreateTable
CREATE TABLE "ShipmentOrigin" (
    "tracking" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentOrigin_pkey" PRIMARY KEY ("tracking")
);

-- CreateIndex
CREATE INDEX "ShipmentOrigin_shippedAt_idx" ON "ShipmentOrigin"("shippedAt");
