-- Relocate progress_updates.difficultyOpinion -> level_progress.difficultyOpinion.
-- Hand-written (not `prisma migrate dev`, which requires a TTY): backfills data
-- before the destructive step since this environment has live rows.
--
-- WHY: difficultyOpinion is the user's read of the LEVEL, not of one run. The
-- activity log has always classified it that way (ActivityFieldCategory.METADATA,
-- see services/activityLog/fieldScope.ts) and the other two METADATA fields —
-- userGddlTier and levelNotes — already live on level_progress. Only its storage
-- disagreed, and that disagreement was load-bearing in the wrong direction: the
-- "completions only" rule for this column was enforced by the edit form
-- (useEditRunModal's isCompletion gate) and by nothing on the server, so
-- PATCH /v1/me/progress/:levelId would happily write an opinion onto a DROP row.
--
-- This is the same move steps 2-4 of 20260724020000_rebalance_level_progress made
-- for coinsCollected / completionTime / simpleRating, for the same reason, and the
-- backfill below deliberately mirrors that one.
--
-- NOT relocated in this migration: videoUrl and twoPlayerSolo/twoPlayerPartner are
-- completion-only too, but they describe a completion EVENT, and v3 rebeat support
-- turns "the completion" into "one of several" (see LEVEL_LOGGING.md and the
-- completionVideoUrl comment in routes/progress/levelPage.ts). Moving them would
-- bake one-completion-per-level into the schema and then need moving back. They
-- get a server-side kind check instead.

-- ============================================================
-- 1. Add the column and backfill it.
--    Per level_progress, prefer the COMPLETION row's opinion if it has one,
--    else the most recently logged row that does. The fallback is not
--    hypothetical: the column was never restricted to the COMPLETION row on the
--    server (that is the bug this migration closes), so an opinion typed against
--    a progress or drop row is real user data and is kept rather than dropped.
-- ============================================================
ALTER TABLE "level_progress" ADD COLUMN "difficultyOpinion" "DifficultyOpinion";

UPDATE "level_progress" lp
SET "difficultyOpinion" = d."difficultyOpinion"
FROM (
  SELECT DISTINCT ON ("levelProgressId") "levelProgressId", "difficultyOpinion"
  FROM "progress_updates"
  WHERE "difficultyOpinion" IS NOT NULL
  ORDER BY "levelProgressId", (kind = 'COMPLETION') DESC, "loggedAt" DESC
) d
WHERE d."levelProgressId" = lp.id;

-- ============================================================
-- 2. Drop the relocated column.
-- ============================================================
ALTER TABLE "progress_updates" DROP COLUMN "difficultyOpinion";
