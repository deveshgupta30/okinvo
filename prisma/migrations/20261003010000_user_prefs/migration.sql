-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'AVATAR';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "accent" TEXT NOT NULL DEFAULT 'mint',
ADD COLUMN     "avatarAssetId" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en-US',
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "usage" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_avatarAssetId_key" ON "user"("avatarAssetId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

