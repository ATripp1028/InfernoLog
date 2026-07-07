-- DropForeignKey
ALTER TABLE "level_update_notifications" DROP CONSTRAINT "level_update_notifications_levelId_fkey";

-- DropForeignKey
ALTER TABLE "level_update_notifications" DROP CONSTRAINT "level_update_notifications_userId_fkey";

-- AlterTable
ALTER TABLE "levels" DROP COLUMN "hasPendingUpdate",
DROP COLUMN "pendingCreator",
DROP COLUMN "pendingName",
DROP COLUMN "pendingSongAuthor",
DROP COLUMN "pendingSongName",
ADD COLUMN     "delisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delistedAt" TIMESTAMP(3),
ADD COLUMN     "ratingStatusSince" TIMESTAMP(3);

-- DropTable
DROP TABLE "level_update_notifications";

