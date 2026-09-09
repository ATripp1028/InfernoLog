-- Global Stats Viewer (GSV) fields on the shared levels cache.
--
-- Community-list placements plus the bookkeeping timestamp for the GSV check.
-- All nullable and backfilled lazily (services/levels/gsvSync.ts + the
-- backfillGsv script), so no data migration is needed.
--
-- Note "gddlTier" reuses a column name that existed briefly before
-- (20260706200000, dropped in 20260724020000). It now means the level's
-- COMMUNITY GDDL tier, which is unrelated to level_progress."userGddlTier"
-- (one user's own tier opinion).

-- AlterTable
ALTER TABLE "levels" ADD COLUMN     "aredlRank" INTEGER,
ADD COLUMN     "gddlTier" INTEGER,
ADD COLUMN     "gsvCheckedAt" TIMESTAMP(3),
ADD COLUMN     "sheetTier" INTEGER,
ADD COLUMN     "showcaseUrl" TEXT;
