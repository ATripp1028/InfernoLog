-- Bump weight precision so weights can be normalized to sum to exactly 1.0.
-- Decimal(5,2) rounds 1/3 to 0.33, which sums to 0.99 across three equal
-- categories; Decimal(5,4) supports 0.3333 + 0.3333 + 0.3334 = 1.0000.
--
-- Pre-existing weight values were unconstrained (any positive integer or
-- decimal). They are *not* renormalized here — the rating-config UI forces
-- users to set valid weights on the next edit. Existing values that don't
-- sum to 1.0 will simply produce a backend error until the user saves a
-- valid config, which is the safest stance pre-release.

-- AlterTable
ALTER TABLE "rating_categories" ALTER COLUMN "weight" SET DATA TYPE DECIMAL(5,4);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "enjoymentWeight" SET DEFAULT 0,
ALTER COLUMN "enjoymentWeight" SET DATA TYPE DECIMAL(5,4);
