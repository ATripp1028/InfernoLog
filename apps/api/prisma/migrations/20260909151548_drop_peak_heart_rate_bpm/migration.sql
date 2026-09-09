-- Drop progress_updates."peakHeartRateBpm".
--
-- The column was created by 20260420180521_move_enjoyment_to_user and never
-- written to: no route, service, schema, or import path has ever referenced it,
-- and it was dropped from schema.prisma without a matching migration. That left
-- the migration history and the schema permanently out of step, so every
-- `prisma migrate dev` wanted to generate this DROP as a side effect of whatever
-- else it was doing. This makes the removal deliberate and dated instead.
--
-- Verified zero non-null values in both dev and production before dropping, so
-- no data is lost. Recreating it later is a new migration, not a revert.

-- AlterTable
ALTER TABLE "progress_updates" DROP COLUMN "peakHeartRateBpm";
