-- AlterTable
ALTER TABLE "progress_updates" ALTER COLUMN "date" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "progress_updates" ADD COLUMN "dateTimezone" TEXT;

-- AlterTable
ALTER TABLE "level_progress" ALTER COLUMN "worstFailDate" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "level_progress" ADD COLUMN "worstFailDateTimezone" TEXT;
