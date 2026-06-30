/*
  Warnings:

  - You are about to drop the column `coins_collected` on the `progress_updates` table. All the data in the column will be lost.
  - You are about to drop the column `two_player_partner` on the `progress_updates` table. All the data in the column will be lost.
  - You are about to drop the column `two_player_solo` on the `progress_updates` table. All the data in the column will be lost.
  - You are about to drop the column `gddlId` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_gddlId_key";

-- AlterTable
ALTER TABLE "progress_updates" DROP COLUMN "coins_collected",
DROP COLUMN "two_player_partner",
DROP COLUMN "two_player_solo",
ADD COLUMN     "coinsCollected" INTEGER,
ADD COLUMN     "twoPlayerPartner" TEXT,
ADD COLUMN     "twoPlayerSolo" BOOLEAN;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "gddlId";
