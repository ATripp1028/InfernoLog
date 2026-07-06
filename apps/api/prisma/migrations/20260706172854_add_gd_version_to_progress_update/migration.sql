-- CreateEnum
CREATE TYPE "GdVersion" AS ENUM ('TWO_ONE', 'TWO_TWO');

-- AlterTable
ALTER TABLE "progress_updates" ADD COLUMN     "percentageVersion" "GdVersion";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "defaultPercentageVersion" "GdVersion" NOT NULL DEFAULT 'TWO_TWO';
