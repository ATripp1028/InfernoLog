-- Expression indexes backing the /v1/levels/browse "most downloaded" and "most
-- liked" sorts — the only browse sorts reachable with no query and no filter
-- (i.e. a full-cache browse). They match the COALESCE(...)::float8 sort/keyset
-- expressions in services/levelBrowse.ts (sortDef) EXACTLY, so Postgres serves
-- both the ORDER BY and the keyset range scan from the index instead of
-- seq-scanning and top-N sorting the whole levels cache on every page.
--
-- NOTE: Prisma can't represent expression indexes, so these are managed by hand
-- here (see the note on the Level model in schema.prisma). If `prisma migrate
-- dev` ever emits a DROP INDEX for either of these, delete that statement — the
-- index is intentional. Keep the expressions in sync with sortDef(): if the
-- ORDER BY expression changes, the planner silently stops using the index.
CREATE INDEX "levels_browse_downloads_idx"
  ON "levels" (((COALESCE("downloads", -1))::float8) DESC, "inGameId");

CREATE INDEX "levels_browse_likes_idx"
  ON "levels" (((COALESCE("likes", -1))::float8) DESC, "inGameId");
