-- GDDL's community enjoyment rating, rescaled from its native 0-10 onto the
-- 0-100 scale EDEL reports. Shown only for non-extremes: EDEL is the more
-- reliable source where a level has both, so this fills the gap everywhere
-- else. See rescaleGddlEnjoyment in apps/api/src/utils/gddl.ts.
ALTER TABLE "levels" ADD COLUMN "gddlEnjoyment" INTEGER;

-- Re-check every level GDDL indexes, so the new column fills in rather than
-- waiting for each level's turn in the 7-day rotation. GDDL is demons only.
UPDATE "levels" SET "communityCheckedAt" = NULL WHERE "isDemon" = true;
