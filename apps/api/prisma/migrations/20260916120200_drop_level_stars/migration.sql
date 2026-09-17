-- A rated level in the cache is now a demon, and every demon awards 10 stars,
-- so the star count carries nothing. starsRequested was never displayed.
ALTER TABLE "levels" DROP COLUMN "stars",
DROP COLUMN "starsRequested";
