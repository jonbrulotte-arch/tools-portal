-- AlterTable
ALTER TABLE "ProductInventory" ADD COLUMN     "collectShipments" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ShipmentOrigin" ADD COLUMN     "billing" TEXT NOT NULL DEFAULT 'prepaid';
