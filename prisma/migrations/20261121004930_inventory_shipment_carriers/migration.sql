-- AlterTable
ALTER TABLE "ProductInventory" ADD COLUMN     "shipmentCarriers" JSONB NOT NULL DEFAULT '{}';
