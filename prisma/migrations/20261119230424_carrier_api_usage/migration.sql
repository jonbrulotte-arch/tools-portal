-- CreateTable
CREATE TABLE "CarrierApiUsage" (
    "id" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "carrier" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarrierApiUsage_day_idx" ON "CarrierApiUsage"("day");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierApiUsage_day_carrier_account_source_kind_outcome_key" ON "CarrierApiUsage"("day", "carrier", "account", "source", "kind", "outcome");
