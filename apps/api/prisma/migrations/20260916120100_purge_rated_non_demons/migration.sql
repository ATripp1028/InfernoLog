-- InfernoLog no longer tracks rated non-demons: the level cache refuses them,
-- and this removes the ones already cached. Unrated levels stay.
--
-- A row still referenced by progress or a collection entry is kept rather than
-- deleted with the user's data. None are expected to exist; a demon GD demoted
-- after someone logged it is the one legitimate way a referenced row can be
-- here, and it stays in the cache like any other demoted demon.
--
-- activity_log and activity_log_level_impact reference levels ON DELETE SET
-- NULL, so no history is deleted with a level; impact rows keep the level's
-- name alongside.

DELETE FROM "levels" l
WHERE l."isRated"
  AND NOT l."isDemon"
  AND NOT EXISTS (SELECT 1 FROM "level_progress" lp WHERE lp."levelId" = l."inGameId")
  AND NOT EXISTS (SELECT 1 FROM "collection_entries" ce WHERE ce."levelId" = l."inGameId");
