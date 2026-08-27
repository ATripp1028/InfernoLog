-- Page rename: List → Log, Log → Events, Ranking → (my) Demon List.
--
--   classic_ranking              → classic_demon_list
--   classic_ranking.rankingIndex → classic_demon_list.listIndex
--   activity_log_level_impact.rankingIndex → .listIndex
--   list_presets                 → log_presets
--   ActivityEventType RANKING_*  → DEMON_LIST_*
--
-- Every statement here is a RENAME. No table is dropped and no row is
-- rewritten, so this migration preserves all existing data — which matters
-- most for the enum: Prisma's default diff would DROP and recreate
-- ActivityEventType, taking every activity_log row with it. ALTER TYPE ...
-- RENAME VALUE keeps them.
--
-- collection_entries.rankingIndex is a DIFFERENT fractional index (a
-- collection's own order) and is deliberately untouched.

-- Enum values: renamed in place, rows preserved.
ALTER TYPE "ActivityEventType" RENAME VALUE 'RANKING_PLACEMENT' TO 'DEMON_LIST_PLACEMENT';
ALTER TYPE "ActivityEventType" RENAME VALUE 'RANKING_REORDER' TO 'DEMON_LIST_REORDER';
ALTER TYPE "ActivityEventType" RENAME VALUE 'RANKING_UNRANKED' TO 'DEMON_LIST_REMOVED';
ALTER TYPE "ActivityEventType" RENAME VALUE 'RANKING_BULK_REPLACE' TO 'DEMON_LIST_BULK_REPLACE';
ALTER TYPE "ActivityEventType" RENAME VALUE 'RANKING_REBALANCE' TO 'DEMON_LIST_REBALANCE';

-- classic_ranking → classic_demon_list.
ALTER TABLE "classic_ranking" RENAME TO "classic_demon_list";
ALTER TABLE "classic_demon_list" RENAME COLUMN "rankingIndex" TO "listIndex";
ALTER INDEX "classic_ranking_pkey" RENAME TO "classic_demon_list_pkey";
ALTER INDEX "classic_ranking_levelProgressId_key" RENAME TO "classic_demon_list_levelProgressId_key";
ALTER TABLE "classic_demon_list" RENAME CONSTRAINT "classic_ranking_userId_fkey" TO "classic_demon_list_userId_fkey";
ALTER TABLE "classic_demon_list" RENAME CONSTRAINT "classic_ranking_levelProgressId_fkey" TO "classic_demon_list_levelProgressId_fkey";

-- The impact row's index column follows the table it describes.
ALTER TABLE "activity_log_level_impact" RENAME COLUMN "rankingIndex" TO "listIndex";

-- list_presets → log_presets.
ALTER TABLE "list_presets" RENAME TO "log_presets";
ALTER INDEX "list_presets_pkey" RENAME TO "log_presets_pkey";
ALTER TABLE "log_presets" RENAME CONSTRAINT "list_presets_userId_fkey" TO "log_presets_userId_fkey";
