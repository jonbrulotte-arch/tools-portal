-- AlterTable
ALTER TABLE "ShippingQuoteRun" ADD COLUMN     "startDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startedAt" TIMESTAMP(3);
