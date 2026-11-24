-- AlterTable
ALTER TABLE "PackPush" ADD COLUMN     "chosenAt" TIMESTAMP(3),
ADD COLUMN     "chosenBy" TEXT,
ADD COLUMN     "manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "packagingName" TEXT;

-- AlterTable
ALTER TABLE "PackPushRun" ADD COLUMN     "manual" INTEGER NOT NULL DEFAULT 0;
