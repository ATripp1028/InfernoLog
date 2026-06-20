-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "DifficultyOpinion" AS ENUM ('NOT_DEMON_WORTHY', 'EASY', 'MEDIUM', 'HARD', 'INSANE', 'EXTREME');

-- AlterTable
ALTER TABLE "level_progress" ADD COLUMN     "attemptsAtDrop" INTEGER;

-- AlterTable
ALTER TABLE "levels" ADD COLUMN     "inGameDifficulty" TEXT,
ADD COLUMN     "length" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "progress_updates" ADD COLUMN     "difficultyOpinion" "DifficultyOpinion";

-- CreateIndex
CREATE INDEX "levels_name_idx" ON "levels" USING GIN ("name" gin_trgm_ops);
