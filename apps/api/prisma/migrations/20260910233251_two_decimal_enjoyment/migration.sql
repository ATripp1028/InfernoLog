-- Community enjoyment is stored to two decimal places from both sources — the
-- precision EDEL itself displays — and a provisional EDEL score is stored as
-- null rather than flagged. See docs/EXTERNAL_APIS.md.

-- A score EDEL still marks provisional becomes no score. This has to run
-- before the flag it reads is dropped.
UPDATE "levels" SET "enjoyment" = NULL WHERE "enjoymentPending" = true;

ALTER TABLE "levels" DROP COLUMN "enjoymentPending";

-- Two decimals, enforced by the column. EDEL values stored so far carry its
-- full upstream precision (up to eight places); round() makes the rule
-- explicit rather than leaving it to the type coercion.
ALTER TABLE "levels" ALTER COLUMN "enjoyment" SET DATA TYPE DECIMAL(5,2) USING round("enjoyment"::numeric, 2);

-- Any GDDL score already written was stored under the old whole-number rule
-- (4.954 → 50, not 49.54). Re-check every demon so those refill at two
-- decimals; GDDL and AREDL both index demons only.
UPDATE "levels" SET "communityCheckedAt" = NULL WHERE "isDemon" = true;
