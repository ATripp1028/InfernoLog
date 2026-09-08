-- Remove the per-user rating display-scale preference.
--
-- The scale is now fixed per FIELD rather than chosen by the user: scores
-- (simple rating, per-category scores, and the weighted average they combine
-- into) are shown on 0-10 with decimals, and enjoyment on 0-100.
--
-- No data migration: every rating figure was already stored as an integer
-- 0-100 whatever the preference said, so a stored 75 simply reads as an
-- enjoyment of 75 or a score of 7.5. Only the preference itself goes.
ALTER TABLE "users" DROP COLUMN "ratingDisplayScale";

DROP TYPE "RatingDisplayScale";
