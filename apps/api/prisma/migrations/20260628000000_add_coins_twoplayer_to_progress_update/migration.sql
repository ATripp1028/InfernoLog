-- AlterTable
ALTER TABLE "progress_updates" ADD COLUMN "coins_collected" INTEGER,
                               ADD COLUMN "two_player_solo" BOOLEAN,
                               ADD COLUMN "two_player_partner" TEXT;
