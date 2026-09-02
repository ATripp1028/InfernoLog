-- MANUAL rating mode: the user orders their completions by hand and the
-- position IS the rating.
--
--   RatingMode                             + MANUAL
--   ActivityEventType                      + RATING_PLACEMENT / _REORDER
--                                            / _REMOVED / _REBALANCE
--   activity_log_level_impact.listIndex    → .orderIndex
--   rating_ranking                         (new)
--
-- The column rename generalises what an impact row records: DEMON_LIST_* events
-- carry a demon list index, RATING_* events carry a rating index, and the
-- event's own type says which. One NOT NULL column rather than two nullable
-- ones keeps the "every index write is logged" invariant enforceable by the
-- schema instead of only by the sweep.

-- New enum values. Postgres 12+ permits ALTER TYPE ... ADD VALUE inside a
-- transaction (which is how Prisma runs this file) provided the new value is
-- not USED in the same transaction. Nothing below writes one, so this is safe.
ALTER TYPE "ActivityEventType" ADD VALUE 'RATING_PLACEMENT';
ALTER TYPE "ActivityEventType" ADD VALUE 'RATING_REORDER';
ALTER TYPE "ActivityEventType" ADD VALUE 'RATING_REMOVED';
ALTER TYPE "ActivityEventType" ADD VALUE 'RATING_REBALANCE';

ALTER TYPE "RatingMode" ADD VALUE 'MANUAL';

-- The impact row's index column now covers both orderings.
ALTER TABLE "activity_log_level_impact" RENAME COLUMN "listIndex" TO "orderIndex";

-- The MANUAL ordering itself, shaped exactly like classic_demon_list.
CREATE TABLE "rating_ranking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelProgressId" TEXT NOT NULL,
    "ratingIndex" DECIMAL(20,10) NOT NULL,

    CONSTRAINT "rating_ranking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rating_ranking_levelProgressId_key" ON "rating_ranking"("levelProgressId");

ALTER TABLE "rating_ranking" ADD CONSTRAINT "rating_ranking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rating_ranking" ADD CONSTRAINT "rating_ranking_levelProgressId_fkey" FOREIGN KEY ("levelProgressId") REFERENCES "level_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
