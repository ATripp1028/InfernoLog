-- Drop the redundant `sfhSongId` column. An SFH entry is keyed by the
-- Newgrounds song it replaces, so its songID always equals the level's own
-- `songId` (the in-game placeholder song). A separate column carried no extra
-- information and only invited a false "all levels using this song" query.
ALTER TABLE "levels" DROP COLUMN "sfhSongId";
