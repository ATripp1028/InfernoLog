-- Gives every user's classic ranking a complete starting state for the
-- rank-history reconstruction, and drops the one day of ranking events that
-- predate it.
--
-- WHY THIS IS NEEDED
--
-- The rank-history walk (apps/api/src/services/activityLog/rankHistory.ts)
-- rebuilds a level's position over time by replaying impact rows into a map of
-- levelId → rankingIndex, positioning the level after each event as "1 + the
-- count of indices ordered above it". That map can only ever hold levels that
-- have appeared in an impact row, and impact rows only exist from
-- 20260824120000_add_activity_log onwards. A ranking built before that date is
-- therefore invisible to the map: a user with 200 placed levels of which 5 have
-- been touched since gets a 5-entry map, and a level actually sitting at #8
-- reconstructs as #3. Worse, a level that has never been moved has no index in
-- the map at all, so every shift past it is lost rather than merely misnumbered.
--
-- WHAT THIS DOES
--
-- Writes one RANKING_REBALANCE per user carrying an impact row for every placed
-- level, with the index it holds right now and equal before/after positions.
-- That is exactly what a rebalance already means — "here is every level's index
-- in the current coordinate system" — so it needs no new event type, and being
-- the one internal-only type it can never appear in a feed or a rank history.
-- The walk reads it, re-anchors the whole map on it, and is exact from there on.
--
-- WHY THE EXISTING RANKING EVENTS GO
--
-- A baseline inserted today cannot be backdated: the indices it records are
-- today's, not the ones that held a day ago. Events older than it would replay
-- against the incomplete map and produce wrong positions, and nothing in the
-- data would tell a reader which entries those are. One day of ranking history
-- for two pre-release accounts is not worth a reconstruction that is quietly
-- wrong before a date nothing displays, so those events are deleted and history
-- restarts here. Their impact rows cascade with them.
--
-- LOG_EDIT and RATING_CONFIG_CHANGE events are untouched — they carry field
-- diffs, not positions, and nothing about them depends on the index map.
--
-- This also repairs the "every placed entry's current index is the most recent
-- one logged for that level" invariant that deleting the old events would
-- otherwise break: the baseline logs the current index for every placed level.
-- See services/invariants.integration.test.ts.

DELETE FROM "activity_log"
WHERE "eventType" IN (
  'RANKING_PLACEMENT',
  'RANKING_REORDER',
  'RANKING_UNRANKED',
  'RANKING_BULK_REPLACE',
  'RANKING_REBALANCE'
);

WITH "ranked" AS (
  SELECT
    cr."userId",
    lp."levelId",
    l."name" AS "levelName",
    cr."rankingIndex",
    -- #1 is the hardest level, which is the highest index.
    ROW_NUMBER() OVER (
      PARTITION BY cr."userId" ORDER BY cr."rankingIndex" DESC
    )::int AS "position"
  FROM "classic_ranking" cr
  JOIN "level_progress" lp ON lp."id" = cr."levelProgressId"
  LEFT JOIN "levels" l ON l."inGameId" = lp."levelId"
),
"baseline" AS (
  INSERT INTO "activity_log" ("id", "userId", "eventType", "levelId", "createdAt")
  SELECT
    gen_random_uuid()::text,
    u."userId",
    'RANKING_REBALANCE'::"ActivityEventType",
    -- List-wide: the levels it covers are its impact rows.
    NULL,
    now()
  FROM (SELECT DISTINCT "userId" FROM "ranked") u
  RETURNING "id", "userId"
)
INSERT INTO "activity_log_level_impact" (
  "id", "eventId", "levelId", "levelName", "role",
  "rankingIndex", "positionBefore", "positionAfter", "milestoneCrossed"
)
SELECT
  gen_random_uuid()::text,
  b."id",
  r."levelId",
  -- Denormalised at write time, as on every other impact row.
  r."levelName",
  'MOVER'::"ActivityImpactRole",
  r."rankingIndex",
  -- A rebalance rewrites indices but no order, so both positions are the same
  -- and nothing crossed a milestone.
  r."position",
  r."position",
  NULL
FROM "ranked" r
JOIN "baseline" b ON b."userId" = r."userId";
