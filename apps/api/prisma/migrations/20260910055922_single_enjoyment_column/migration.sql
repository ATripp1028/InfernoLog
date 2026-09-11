-- Community enjoyment becomes ONE column fed by two sources, chosen by the
-- level's difficulty: EDEL (via AREDL) for extreme demons, GDDL for everything
-- at Insane and below. The source is a pure function of the difficulty
-- (isExtremeDemon in packages/core), so it is derived at both ends rather than
-- stored. See docs/EXTERNAL_APIS.md.

ALTER TABLE "levels" RENAME COLUMN "aredlEnjoyment" TO "enjoyment";
ALTER TABLE "levels" RENAME COLUMN "aredlEnjoymentPending" TO "enjoymentPending";

-- Everything currently stored came from EDEL, which under the new rule may
-- only supply extremes. Clearing the rest is deliberate: a non-extreme's EDEL
-- score would otherwise be relabelled as GDDL's until the re-check below
-- replaces it, and briefly showing no score beats showing a mislabelled one.
-- The predicate mirrors isExtremeDemon: prefix match on the token (it has a
-- "-featured" variant), falling back to the label for rows cached before the
-- token column existed.
UPDATE "levels"
SET "enjoyment" = NULL, "enjoymentPending" = NULL
WHERE NOT (
  CASE
    WHEN "partialDiff" IS NOT NULL THEN "partialDiff" LIKE 'demon-extreme%'
    ELSE lower(regexp_replace(COALESCE("inGameDifficulty", ''), '[^a-zA-Z]', '', 'g')) = 'extremedemon'
  END
);

-- Re-check every level GDDL or AREDL indexes so the column refills under the
-- new rule instead of waiting out the 7-day rotation. Both are demons only.
UPDATE "levels" SET "communityCheckedAt" = NULL WHERE "isDemon" = true;
