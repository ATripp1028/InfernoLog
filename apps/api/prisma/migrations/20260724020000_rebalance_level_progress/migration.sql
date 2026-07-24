-- Rebalance LevelProgress/ProgressUpdate schema + drop dead fields.
-- Hand-written (not `prisma migrate dev`, which requires a TTY): backfills
-- data before every destructive step since this environment has live rows.

-- ============================================================
-- 0. Dedupe gddl_sync_jobs before adding the unique(userId) index.
--    Keep only the most recent row per user (nothing reads history beyond
--    the latest job — see GddlSyncJob's schema comment).
-- ============================================================
DELETE FROM "gddl_sync_jobs"
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY "userId" ORDER BY "startedAt" DESC, id DESC
    ) AS rn
    FROM "gddl_sync_jobs"
  ) ranked
  WHERE ranked.rn > 1
);

-- ============================================================
-- 1. DifficultyOpinion enum merge (difficultyOpinion + difficultyOpinionStars
--    -> single enum). NOT_DEMON_WORTHY rows are remapped using their star
--    count (1=AUTO .. 9=NINE_STAR); a NULL star count (shouldn't occur in
--    practice) falls back to AUTO rather than failing the migration.
-- ============================================================
BEGIN;
CREATE TYPE "DifficultyOpinion_new" AS ENUM ('AUTO', 'TWO_STAR', 'THREE_STAR', 'FOUR_STAR', 'FIVE_STAR', 'SIX_STAR', 'SEVEN_STAR', 'EIGHT_STAR', 'NINE_STAR', 'EASY', 'MEDIUM', 'HARD', 'INSANE', 'EXTREME');
ALTER TABLE "progress_updates" ALTER COLUMN "difficultyOpinion" TYPE "DifficultyOpinion_new" USING (
  CASE
    WHEN "difficultyOpinion"::text = 'NOT_DEMON_WORTHY' THEN (
      CASE "difficultyOpinionStars"
        WHEN 1 THEN 'AUTO'
        WHEN 2 THEN 'TWO_STAR'
        WHEN 3 THEN 'THREE_STAR'
        WHEN 4 THEN 'FOUR_STAR'
        WHEN 5 THEN 'FIVE_STAR'
        WHEN 6 THEN 'SIX_STAR'
        WHEN 7 THEN 'SEVEN_STAR'
        WHEN 8 THEN 'EIGHT_STAR'
        WHEN 9 THEN 'NINE_STAR'
        ELSE 'AUTO'
      END
    )
    ELSE "difficultyOpinion"::text
  END::"DifficultyOpinion_new"
);
ALTER TYPE "DifficultyOpinion" RENAME TO "DifficultyOpinion_old";
ALTER TYPE "DifficultyOpinion_new" RENAME TO "DifficultyOpinion";
DROP TYPE "DifficultyOpinion_old";
COMMIT;

-- ============================================================
-- 2. LevelProgress: add relocated columns, backfill from whichever
--    progress_update actually carries a value for each column (these fields
--    were never restricted to the COMPLETION row pre-refactor — applyEdit
--    could target any progress_update). Per column, prefer the COMPLETION
--    row if it has a value, else the most recently logged row that does.
-- ============================================================
ALTER TABLE "level_progress" ADD COLUMN "coinsCollected" INTEGER,
ADD COLUMN "completionTime" INTEGER,
ADD COLUMN "simpleRating" INTEGER;

UPDATE "level_progress" lp
SET "coinsCollected" = cc."coinsCollected"
FROM (
  SELECT DISTINCT ON ("levelProgressId") "levelProgressId", "coinsCollected"
  FROM "progress_updates"
  WHERE "coinsCollected" IS NOT NULL
  ORDER BY "levelProgressId", (kind = 'COMPLETION') DESC, "loggedAt" DESC
) cc
WHERE cc."levelProgressId" = lp.id;

UPDATE "level_progress" lp
SET "completionTime" = ct."completionTime"
FROM (
  SELECT DISTINCT ON ("levelProgressId") "levelProgressId", "completionTime"
  FROM "progress_updates"
  WHERE "completionTime" IS NOT NULL
  ORDER BY "levelProgressId", (kind = 'COMPLETION') DESC, "loggedAt" DESC
) ct
WHERE ct."levelProgressId" = lp.id;

UPDATE "level_progress" lp
SET "simpleRating" = sr."simpleRating"
FROM (
  SELECT DISTINCT ON ("levelProgressId") "levelProgressId", "simpleRating"
  FROM "progress_updates"
  WHERE "simpleRating" IS NOT NULL
  ORDER BY "levelProgressId", (kind = 'COMPLETION') DESC, "loggedAt" DESC
) sr
WHERE sr."levelProgressId" = lp.id;

-- ============================================================
-- 3. RatingScore: repoint from progressUpdateId to levelProgressId, then swap
--    the FK/unique index. ratingScores were never restricted to the
--    COMPLETION row pre-refactor, so two different progress_updates on the
--    same level_progress could each hold a row for the same category —
--    dedupe (preferring the COMPLETION row, then most recently logged)
--    before the new unique(levelProgressId, categoryId) index is created.
-- ============================================================
ALTER TABLE "rating_scores" ADD COLUMN "levelProgressId" TEXT;

UPDATE "rating_scores" rs
SET "levelProgressId" = pu."levelProgressId"
FROM "progress_updates" pu
WHERE pu.id = rs."progressUpdateId";

DELETE FROM "rating_scores" rs
WHERE rs.id IN (
  SELECT ranked.id FROM (
    SELECT rs2.id,
      ROW_NUMBER() OVER (
        PARTITION BY rs2."levelProgressId", rs2."categoryId"
        ORDER BY (pu2.kind = 'COMPLETION') DESC, pu2."loggedAt" DESC
      ) AS rn
    FROM "rating_scores" rs2
    JOIN "progress_updates" pu2 ON pu2.id = rs2."progressUpdateId"
  ) ranked
  WHERE ranked.rn > 1
);

ALTER TABLE "rating_scores" ALTER COLUMN "levelProgressId" SET NOT NULL;

ALTER TABLE "rating_scores" DROP CONSTRAINT "rating_scores_progressUpdateId_fkey";
DROP INDEX "rating_scores_progressUpdateId_categoryId_key";
ALTER TABLE "rating_scores" DROP COLUMN "progressUpdateId";

CREATE UNIQUE INDEX "rating_scores_levelProgressId_categoryId_key" ON "rating_scores"("levelProgressId", "categoryId");
ALTER TABLE "rating_scores" ADD CONSTRAINT "rating_scores_levelProgressId_fkey" FOREIGN KEY ("levelProgressId") REFERENCES "level_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 4. Drop the now-relocated / merged / dead columns off progress_updates.
-- ============================================================
ALTER TABLE "progress_updates" DROP COLUMN "coinsCollected",
DROP COLUMN "completionTime",
DROP COLUMN "difficultyOpinionStars",
DROP COLUMN "simpleRating",
DROP COLUMN "top5AtTime",
DROP COLUMN "top5Position";

-- ============================================================
-- 5. levels.songSize: string "9.56MB" -> numeric MB. Every existing value
--    matches ^[0-9.]+MB$ (checked against the live table before writing
--    this migration).
-- ============================================================
ALTER TABLE "levels" RENAME COLUMN "songSize" TO "songSize_old";
ALTER TABLE "levels" ADD COLUMN "songSize" DOUBLE PRECISION;
UPDATE "levels" SET "songSize" = regexp_replace("songSize_old", 'MB$', '')::DOUBLE PRECISION
WHERE "songSize_old" IS NOT NULL;
ALTER TABLE "levels" DROP COLUMN "songSize_old";

-- ============================================================
-- 6. levels: drop confirmed-dead GDBrowser-era fields and the redundant
--    delisted boolean (delistedAt is authoritative and untouched).
-- ============================================================
ALTER TABLE "levels" DROP COLUMN "creatorPoints",
DROP COLUMN "delisted",
DROP COLUMN "diamonds",
DROP COLUMN "difficultyFace",
DROP COLUMN "editorSeconds",
DROP COLUMN "editorSecondsTotal",
DROP COLUMN "gddlTier",
DROP COLUMN "largeLevel",
DROP COLUMN "orbs",
DROP COLUMN "peakMusicBpm";

-- ============================================================
-- 7. users: drop the redundant isVerified boolean (verifiedAt is
--    authoritative and untouched).
-- ============================================================
ALTER TABLE "users" DROP COLUMN "isVerified";

-- ============================================================
-- 8. gddl_sync_jobs: one row per user (already deduped in step 0).
-- ============================================================
DROP INDEX "gddl_sync_jobs_userId_startedAt_idx";
CREATE UNIQUE INDEX "gddl_sync_jobs_userId_key" ON "gddl_sync_jobs"("userId");
