-- Direct GDDL + AREDL fetches alongside the Global Stats Viewer.
-- See docs/EXTERNAL_APIS.md and apps/api/src/services/levels/communitySync.ts.

-- Renamed, NOT dropped and re-added: the column now records one merged check
-- across three sources rather than a GSV check, but its existing values are
-- still meaningful freshness for every non-demon in the cache, and dropping it
-- would make ~4 weeks of rotation re-walk levels that need nothing.
ALTER TABLE "levels" RENAME COLUMN "gsvCheckedAt" TO "communityCheckedAt";

ALTER TABLE "levels"
  ADD COLUMN "aredlStatus"           TEXT,
  ADD COLUMN "aredlEnjoyment"        DOUBLE PRECISION,
  ADD COLUMN "aredlEnjoymentPending" BOOLEAN,
  ADD COLUMN "durationSeconds"       INTEGER;

-- Retire the tier-0 inference. GSV never reports a sheet tier of 0, so every 0
-- in this column was inferred by the deleted sheetTierForMissingEntry — "an
-- extreme demon with no SHEET entry is bottom tier", which reached ~355 levels
-- for a tier that holds 24. AREDL states the tier by name, so the real zeros
-- come back through the rotation and the guesses do not.
UPDATE "levels" SET "sheetTier" = NULL WHERE "sheetTier" = 0;

-- Carry the rotation cursor across the key rename. readCursor returns null for
-- a missing row, so without this the next lap silently restarts at id 0.
UPDATE "level_sync_cursor" SET "id" = 'community' WHERE "id" = 'gsv';

-- Force one re-walk of exactly the population the new sources change. GDDL is
-- demons only and AREDL is extremes, so a non-demon learns nothing new here and
-- keeps the freshness it already had.
UPDATE "levels" SET "communityCheckedAt" = NULL WHERE "isDemon" = true;

-- Shared token bucket for the public GDDL lookup — GDDL publishes 100 req/60s
-- per IP, and every Lambda shares one egress IP. Mirrors robtop_rate_limit.
CREATE TABLE "gddl_rate_limit" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "tokens" DOUBLE PRECISION NOT NULL,
    "lastRefillAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldownUntil" TIMESTAMP(3),

    CONSTRAINT "gddl_rate_limit_pkey" PRIMARY KEY ("id")
);

INSERT INTO "gddl_rate_limit" ("id", "tokens", "lastRefillAt")
VALUES ('singleton', 3, CURRENT_TIMESTAMP);
