-- Unify "drop" into ProgressUpdate as kind=DROP, instead of standalone fields
-- on level_progress. See DATA_MODEL.md.

-- CreateEnum
CREATE TYPE "ProgressUpdateKind" AS ENUM ('PROGRESS', 'DROP', 'COMPLETION');

-- AlterTable: add kind, backfilled below before isCompletion is dropped.
ALTER TABLE "progress_updates" ADD COLUMN "kind" "ProgressUpdateKind" NOT NULL DEFAULT 'PROGRESS';

-- Backfill: existing completions become kind=COMPLETION.
UPDATE "progress_updates" SET "kind" = 'COMPLETION' WHERE "isCompletion" = true;

-- Backfill: synthesize a DROP-kind ProgressUpdate for every level_progress row
-- that still carries historical drop metadata, before that metadata is
-- dropped from level_progress itself. Only one drop's worth of history ever
-- existed pre-migration (droppedAt/droppedReason/attemptsAtDrop were a
-- singleton), so this creates at most one DROP row per level_progress.
INSERT INTO "progress_updates" ("id", "levelProgressId", "kind", "date", "attempts", "notes", "loggedAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'DROP', "droppedAt", "attemptsAtDrop", "droppedReason", COALESCE("droppedAt"::timestamp, "updatedAt"), now()
FROM "level_progress"
WHERE "droppedAt" IS NOT NULL OR "droppedReason" IS NOT NULL OR "attemptsAtDrop" IS NOT NULL;

-- AlterTable
ALTER TABLE "progress_updates" DROP COLUMN "isCompletion";

-- AlterTable
ALTER TABLE "level_progress" DROP COLUMN "attemptsAtDrop",
DROP COLUMN "droppedAt",
DROP COLUMN "droppedReason";
