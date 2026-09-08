-- Weighted ratings are the only ratings.
--
-- The SIMPLE and MANUAL rating modes are removed, and with them the mode
-- concept itself: every account now rates by per-category scores combined into
-- a weighted average. A single default "Overall" category at weight 1.00
-- reproduces what SIMPLE offered — one score per level — as an average of one
-- term, so nothing about the product needs a second mode to express it.
--
--   RatingMode                              (dropped)
--   users.ratingMode                        (dropped)
--   level_progress.simpleRating             (dropped)
--   rating_ranking                          (dropped)
--   ActivityEventType                       - RATING_PLACEMENT / _REORDER
--                                             / _REMOVED / _BULK_REPLACE
--                                             / _REBALANCE
--   import_jobs.ratingRankingPayload/Result (dropped)
--
-- This is destructive by intent: v1 is pre-release, so simple ratings and
-- hand-arranged rating orders are deleted rather than migrated onto categories.
-- Guessing which category a single score meant would invent data the user never
-- entered, and every affected account can re-rate against its own categories.

-- The MANUAL ordering's events. activity_log_level_impact and
-- activity_log_field_change both cascade off activity_log, so their rows go
-- with these.
DELETE FROM "activity_log"
WHERE "eventType" IN (
  'RATING_PLACEMENT',
  'RATING_REORDER',
  'RATING_REMOVED',
  'RATING_BULK_REPLACE',
  'RATING_REBALANCE'
);

-- Field changes naming columns that no longer exist. These hang off LOG_EDIT
-- and RATING_CONFIG_CHANGE events that are otherwise still meaningful, so only
-- the individual field rows go, not their parents.
DELETE FROM "activity_log_field_change"
WHERE "fieldName" IN ('rating_mode', 'simple_rating');

-- Postgres cannot drop a value from an enum in place, so the type is rebuilt
-- without the five RATING_* ordering values. Safe only because the DELETE above
-- already removed every row that used one.
CREATE TYPE "ActivityEventType_new" AS ENUM (
  'DEMON_LIST_PLACEMENT',
  'DEMON_LIST_REORDER',
  'DEMON_LIST_REMOVED',
  'DEMON_LIST_BULK_REPLACE',
  'DEMON_LIST_REBALANCE',
  'LOG_EDIT',
  'RATING_CONFIG_CHANGE'
);
ALTER TABLE "activity_log"
  ALTER COLUMN "eventType" TYPE "ActivityEventType_new"
  USING ("eventType"::text::"ActivityEventType_new");
DROP TYPE "ActivityEventType";
ALTER TYPE "ActivityEventType_new" RENAME TO "ActivityEventType";

-- The MANUAL ordering itself.
DROP TABLE "rating_ranking";

-- The mode, and the score it selected.
ALTER TABLE "users" DROP COLUMN "ratingMode";
DROP TYPE "RatingMode";

ALTER TABLE "level_progress" DROP COLUMN "simpleRating";

-- The spreadsheet import's MANUAL-order pass.
ALTER TABLE "import_jobs"
  DROP COLUMN "ratingRankingPayload",
  DROP COLUMN "ratingRankingResult";

-- PUT /v1/me/rating-config now rejects an empty category list, so no account
-- may sit at zero. Signup has always seeded categories, but an account that
-- lost them some other way would be unable to rate anything and unable to fix
-- it without this.
INSERT INTO "rating_categories" ("id", "userId", "name", "weight", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", 'Overall', 1.00, 0, now(), now()
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "rating_categories" c WHERE c."userId" = u."id"
);
