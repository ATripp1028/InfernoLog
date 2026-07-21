-- CreateTable
CREATE TABLE "robtop_rate_limit" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "tokens" DOUBLE PRECISION NOT NULL,
    "lastRefillAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "robtop_rate_limit_pkey" PRIMARY KEY ("id")
);

-- Seed the one singleton row every acquire() UPDATE targets. Without this,
-- the WHERE id = 'singleton' in robtopRateLimit.ts would never match any
-- row, so every RobTop call would silently wait out its timeout and fail.
-- Starts full (3 tokens) so there's an immediate burst allowance after
-- deploy rather than an empty bucket.
INSERT INTO "robtop_rate_limit" ("id", "tokens", "lastRefillAt")
VALUES ('singleton', 3, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
