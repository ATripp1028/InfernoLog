-- Collapse the nine "not demon-worthy" DifficultyOpinion values (AUTO ..
-- NINE_STAR, one per star count) into a single NOT_DEMON_WORTHY. InfernoLog no
-- longer tracks non-demons, so which non-demon difficulty a player thinks a
-- demon deserved is no longer worth recording. Deliberately lossy.
--
-- Hand-written: `prisma migrate dev` renders an enum value removal as a
-- drop-and-recreate, which would null every opinion. Same shape as the enum
-- rewrite in 20260724020000_rebalance_level_progress.

BEGIN;

-- ============================================================
-- 1. level_progress.difficultyOpinion
-- ============================================================
CREATE TYPE "DifficultyOpinion_new" AS ENUM ('NOT_DEMON_WORTHY', 'EASY', 'MEDIUM', 'HARD', 'INSANE', 'EXTREME');
ALTER TABLE "level_progress" ALTER COLUMN "difficultyOpinion" TYPE "DifficultyOpinion_new" USING (
  CASE
    WHEN "difficultyOpinion"::text IN ('AUTO', 'TWO_STAR', 'THREE_STAR', 'FOUR_STAR', 'FIVE_STAR', 'SIX_STAR', 'SEVEN_STAR', 'EIGHT_STAR', 'NINE_STAR')
      THEN 'NOT_DEMON_WORTHY'
    ELSE "difficultyOpinion"::text
  END::"DifficultyOpinion_new"
);
ALTER TYPE "DifficultyOpinion" RENAME TO "DifficultyOpinion_old";
ALTER TYPE "DifficultyOpinion_new" RENAME TO "DifficultyOpinion";
DROP TYPE "DifficultyOpinion_old";

-- ============================================================
-- 2. Activity log history. Field changes store the enum value as plain text
--    (serializeFieldValue), so the old values would otherwise outlive the
--    enum and render as unknown strings.
-- ============================================================
CREATE TEMP TABLE "_collapsed_opinion_events" ON COMMIT DROP AS
SELECT DISTINCT "eventId"
FROM "activity_log_field_change"
WHERE "fieldName" = 'difficulty_opinion';

UPDATE "activity_log_field_change"
SET
  "oldValue" = CASE
    WHEN "oldValue" IN ('AUTO', 'TWO_STAR', 'THREE_STAR', 'FOUR_STAR', 'FIVE_STAR', 'SIX_STAR', 'SEVEN_STAR', 'EIGHT_STAR', 'NINE_STAR')
      THEN 'NOT_DEMON_WORTHY'
    ELSE "oldValue"
  END,
  "newValue" = CASE
    WHEN "newValue" IN ('AUTO', 'TWO_STAR', 'THREE_STAR', 'FOUR_STAR', 'FIVE_STAR', 'SIX_STAR', 'SEVEN_STAR', 'EIGHT_STAR', 'NINE_STAR')
      THEN 'NOT_DEMON_WORTHY'
    ELSE "newValue"
  END
WHERE "fieldName" = 'difficulty_opinion';

-- A change between two star counts (7★ → 8★) is now a change from
-- NOT_DEMON_WORTHY to itself. A field-change row records a field that actually
-- changed, so these go.
DELETE FROM "activity_log_field_change"
WHERE "fieldName" = 'difficulty_opinion'
  AND "oldValue" IS NOT DISTINCT FROM "newValue";

-- An edit event whose only change was one of those is now an event that
-- changed nothing. Scoped to the events touched above, so no other event is
-- affected.
DELETE FROM "activity_log" a
WHERE a."eventType" = 'LOG_EDIT'
  AND a."id" IN (SELECT "eventId" FROM "_collapsed_opinion_events")
  AND NOT EXISTS (
    SELECT 1 FROM "activity_log_field_change" fc WHERE fc."eventId" = a."id"
  );

COMMIT;
