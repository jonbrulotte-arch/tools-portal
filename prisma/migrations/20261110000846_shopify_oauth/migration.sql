-- AlterEnum
ALTER TYPE "ShopifyAuthType" ADD VALUE 'OAUTH';

-- AlterTable
ALTER TABLE "ShopifyStore" ADD COLUMN     "encRefreshToken" TEXT,
ADD COLUMN     "oauthConnectedAt" TIMESTAMP(3),
ADD COLUMN     "oauthScopes" TEXT,
ADD COLUMN     "refreshTokenExpiresAt" TIMESTAMP(3);
