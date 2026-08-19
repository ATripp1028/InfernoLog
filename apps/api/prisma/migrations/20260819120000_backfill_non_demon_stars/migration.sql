-- Backfills the star count for rated non-demon levels that only ever carried a
-- difficulty label, where the label determines the count.
--
-- GD awards 1-10 stars and the difficulty face is a BAND over that range:
--
--     1  Auto      2  Easy      3  Normal
--     4-5  Hard    6-7  Harder  8-9  Insane
--     10  Demon (every tier)
--
-- The star count is the CANONICAL identifier of a non-demon's difficulty — it
-- is what code compares, filters and matches on, and it wins over the label
-- wherever the two disagree (deriveInGameDifficulty,
-- packages/core/src/starDifficulty.ts). The label is stored alongside it as the
-- display copy, and remains the only representation of what a count cannot
-- express: which tier a 10-star demon is, and "Unrated".
--
-- ONLY Auto / Easy / Normal are backfilled. Those three faces are one star count
-- each, so the label determines the count exactly. Hard, Harder and Insane each
-- span two counts, and nothing in the row says which — writing 4 for every
-- "Hard" would be inventing data, and inventing it into the canonical field.
-- Those rows keep a null count until a RobTop refresh supplies a real one; until
-- then deriveInGameDifficulty falls back to their label, which is exactly the
-- case that fallback exists for.
--
-- Adds data only — nothing is cleared — so this is safe to re-run and loses
-- nothing if rolled back.
--
-- Scoped to isDemon = false AND isRated = true: demons are always 10 stars
-- regardless of tier, and unrated levels have no awarded stars to recover.

UPDATE "levels"
SET "stars" = CASE lower(btrim("inGameDifficulty"))
    WHEN 'auto'   THEN 1
    WHEN 'easy'   THEN 2
    WHEN 'normal' THEN 3
  END
WHERE "isDemon" = false
  AND "isRated" = true
  AND ("stars" IS NULL OR "stars" = 0)
  AND lower(btrim("inGameDifficulty")) IN ('auto', 'easy', 'normal');
