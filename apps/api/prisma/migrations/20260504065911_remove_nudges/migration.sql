/*
  Warnings:

  - You are about to drop the column `progressNudgeDays` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `progress_nudges` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "progress_nudges" DROP CONSTRAINT "progress_nudges_levelProgressId_fkey";

-- DropForeignKey
ALTER TABLE "progress_nudges" DROP CONSTRAINT "progress_nudges_userId_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "progressNudgeDays";

-- DropTable
DROP TABLE "progress_nudges";
