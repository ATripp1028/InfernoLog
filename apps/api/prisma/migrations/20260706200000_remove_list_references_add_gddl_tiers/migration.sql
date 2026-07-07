-- DropForeignKey
ALTER TABLE "list_references" DROP CONSTRAINT "list_references_progressUpdateId_fkey";

-- AlterTable
ALTER TABLE "level_progress" ADD COLUMN     "userGddlTier" INTEGER;

-- AlterTable
ALTER TABLE "levels" ADD COLUMN     "gddlTier" INTEGER;

-- DropTable
DROP TABLE "list_references";

-- DropEnum
DROP TYPE "ListSource";
