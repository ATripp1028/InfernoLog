# InfernoLog — External APIs & Integrations

## Geometry Dash servers (RobTop / boomlings.com)

**Base URL:** `https://www.boomlings.com/database` (override via `ROBTOP_API_BASE_URL`)  
**Purpose:** Primary level metadata autofill for both rated and unrated levels  
**Auth:** None — a fixed public secret (`Wmfd2893gb7`) is sent as a request param  
**Called from:** Lambda (server-side only). Client: `apps/api/src/utils/robtop.ts`

We call RobTop's official servers directly (previously via the third-party GDBrowser proxy). The endpoint is `getGJLevels21.php` with `type=0` (search), passing the level id as the search string and selecting the exact id out of the response. It is **not** `type=10` (fetch specific levels by id), despite that being the obvious choice: `type=10` returns only RATED levels, so an unrated id looks like a not-found. `type=0` returns the exact level for rated and unrated ids alike, along with community-voted difficulty for the unrated ones. It returns name, creator, song, length, description, and the full stat/flag set, which we parse into the `levels` cache columns. See `https://wyliemaster.github.io/gddocs`.

### Usage Pattern

```
POST https://www.boomlings.com/database/getGJLevels21.php
Content-Type: application/x-www-form-urlencoded
User-Agent:                      ← MUST be empty (Cloudflare returns HTTP 1020 otherwise)

type=0&str={levelId}&secret=Wmfd2893gb7&gameVersion=22&binaryVersion=42
```

The response is a raw delimited blob (not JSON): `levels # creators # songs # pageInfo # hash`, where the level is colon/`:`-paired keys, creators are `playerID:username:accountID`, and songs are `~|~`-delimited objects separated by `~:~`. `parseGetGJLevels21` (unit-tested in `robtop.test.ts`) joins the level to its creator and song and derives the human-readable difficulty from the raw keys (`8`/`9`/`17`/`25`/`43`). Rate limits are ~2 req/s for data endpoints; our usage is per-user cache-miss only.

`-1` (or empty/malformed) means not found → the client returns `null`. Custom (Newgrounds) songs come from the response; **official/built-in tracks** are resolved name/author from a static table in `robtop.ts` (the level object only carries the official-song index). A few fields GDBrowser used to compute (creator points, orbs, diamonds, difficulty face, "large level", editor time) aren't in the raw level object at all — they don't exist as `levels` columns, rather than being stored permanently `null`.

**Object count is the one field RobTop is no longer authoritative for** — see the Global Stats Viewer section below. Response is cached in InfernoLog's `levels` table (`data_source = robtop_autofill`). Subsequent users logging the same level ID do not trigger a new request — the cached data is returned directly.

### Failure Handling

If the servers are unavailable, the user is notified and may proceed with fully manual data entry. The logging flow is never blocked by the servers being down.

**Being blocked is a distinct failure from being down.** Two upstream statuses mean "stop calling", and both open the shared cooldown in `robtopRateLimit.ts` so every consumer backs off together rather than only the one that got hit: a **429** (RobTop rate-limiting our IP — honours `Retry-After`) and a **403** (Cloudflare's block page, from a WAF rule or the egress IP's reputation, with no `Retry-After` — fixed 5-minute backoff, since continuing to hit a block helps keep it). Anything else, including a 5xx, is logged as unreachable but opens no cooldown. Every non-OK response is logged with `cf-ray`, `cf-mitigated`, `server`, and a body snippet: those are what distinguish a UA/WAF block from an IP block after the fact, and a 403 run is not diagnosable without them.

**Reachability canary.** A production-only cron (`RobtopCanary`, every 15 minutes, `handlers/robtopCanaryWorker.ts` → `services/levels/canary.ts`) makes one `getGJLevels21` call for a known-good level (`128`, a constant in `canary.ts`) and alerts to Sentry when it comes back unreachable. It exists because the level-cache sync runs every 6 hours, so without it the first sign that GD's servers have cut us off is a circuit-breaker log up to a full interval later — how the Aug 2026 Cloudflare block was found. It skips its check entirely while a cooldown is open, and reports a deleted canary level as a config problem rather than an outage.

**It alerts on a failed _pair_, never a single failure.** RobTop answers in ~300ms against a 5s timeout, so a lone request overrunning it is upstream noise; on 15-minute runs that noise pages roughly every couple of days, and an alarm that cries wolf is worse than no alarm. On a failed sample the canary waits 3s and samples again, alerting only if both fail (`recovered` is logged, never alerted). This was not theoretical: on 2026-08-27 a single `AbortError` between 191 healthy checks paged as an outage. A real refusal fails both samples, so detection speed is unchanged.

**The alert says which kind of failure it saw.** `RobtopFetchResult`'s `unreachable` carries a `RobtopUnreachableReason` (`limiter` / `blocked` / `throttled` / `http_error` / `timeout` / `network`), because the runbook differs: `blocked`/`throttled` mean GD's edge refused us and the alert points at the probe below, while `timeout`/`network` mean nobody refused anything and comparing egress IPs would waste the window. Note a genuine block reads as `blocked` then `limiter` — the 403 opens the shared cooldown, which then denies the retry a slot — so both reasons appear in the alert. The name-search outcome deliberately carries no reason: nothing alerts on a failed search, it just degrades to "no results".

**Telling an egress block from a bad request.** The logs establish _that_ Cloudflare refused us; they cannot establish _why us_. The block page carries no numeric error code, and `cf-ray` resolves only inside RobTop's Cloudflare account, not ours. The one thing that separates "our egress IP is blocked" from "our request shape is wrong" is running the identical request from somewhere else at the same moment: `pnpm probe:robtop [levelId]` (from `apps/api`) does exactly that, sharing the request builder in `utils/robtopRequest.ts` so it cannot drift from what production sends. It needs no database or AWS credentials, and both the canary and sync circuit-breaker alerts name it. Run it **while an alert is firing** — a block that has cleared is no longer diagnosable.

**Auto-fallback to manual entry.** When the fetch fails or returns nothing (down/timed out, or an unrated/brand-new level), the flow **automatically** falls back to a manual entry view — there is no "enter manually" escape hatch in the happy path, and the view never appears when autofill succeeds. It collects the fields autofill would normally provide: level name, creator, in-game difficulty, song name, song author, length. These map to the shared `levels` cache columns. Crucially, with no cached value to defer to, **the difficulty the user picks becomes the level's `in_game_difficulty`** (the one exception to "in-game difficulty is always cached and read-only"), and for a rated non-demon it also fixes the canonical `stars` count, which is derived from it and stored alongside. Manually-sourced rows are stored with `data_source = manual` and `verified = false` so a later sync can backfill and verify/override them. See `LOGGING_FLOW.md` and the `Level` model in `schema.prisma`.

### Cache-Backed Name Search

The logging flow's level-entry field accepts **either an ID or a name** (one field, disambiguated by `^\d+$` → ID lookup, else → name search). Name search resolves against **InfernoLog's own `levels` cache**, not GD's live search — this controls the result set, costs nothing externally, and is fast (local Postgres). A level enters the cache when anyone logs it, enters its ID, or reaches it via the opt-in GD-server search escalation; entering a raw ID routes through autofill and **populates the cache**, seeding the search index for next time. See `LOGGING_FLOW.md` and `LEVEL_PICKER.md`.

**GD-server name search escalation.** When a cache name search comes up short (zero results or partial hits), the user can opt in — on explicit confirmation, never on keystroke — to a single `getGJLevels21` name query (the same `type=0` search the ID lookup uses, with a name as the search string instead of an id; `parseGetGJLevels21` handles the plural response). Levels already in the cache are omitted from the results; rated matches are seeded automatically (`data_source = robtop_autofill`, same as any other autofill — no seeded-vs-logged distinction is stored), unrated matches are seeded only if selected. Routed through the shared RobTop client (`searchRobtopByNameResult`), so throttling and the not-found/unreachable split apply. Backend: `services/gdSearch.ts` + `GET /v1/levels/gd-search`. Available at every cache-search call site: the toolbar, the logging-flow entry step, and collections add.

---

## GDDL API

**Purpose:** GDDL tier autofill suggestion + optional record submission  
**Auth:** Per-user API key (stored encrypted, used server-side only)  
**Called from:** Lambda only  
**License:** Free platform — minimize load, never poll for live tier updates

### Autofill

Called after the level-metadata fetch when a rated level is detected. Returns the current GDDL tier as a **suggested value** — the user confirms or overrides before saving. This value becomes a snapshot on the completion record.

GDDL placements update extremely frequently. InfernoLog does **not** maintain live parity with GDDL tiers. The snapshot approach is intentional and respectful of GDDL's free infrastructure.

### Record Submission

Optional. Triggered by user action during completion logging (not automatic). Requires the user to have provided and saved their GDDL API key. Submitted server-side via Lambda using the encrypted stored key.

### Favorites / Least Favorites Sync

On initial GDDL connection, users can optionally import their GDDL favorites/least favorites into InfernoLog lists. When marking a favorite in InfernoLog, users can optionally sync that action to their GDDL account.

### Known Limitation

GDDL records cannot be deleted via the API. Users are warned of this in the completion delete confirmation modal.

---

## Song File Hub (SFH)

**Base URL:** `https://api.songfilehub.com`
**Endpoint:** `GET /songs?levelID={levelId}&states={state}`
**Purpose:** NONG (Not On NewGrounds) song metadata — the real song behind a level whose in-game song entry is a placeholder.
**Auth:** None (public endpoint)
**Called from:** Lambda only (`apps/api/src/utils/songFileHub.ts`)
**License:** Community-run API — no published rate limit; pace calls and never poll.

The response is an array of song objects; we persist the canonical one (highest `downloads`) to the `levels` cache (`sfh*` columns). `isNong` is derived from SFH alone.

**The `states` filter mirrors the GD level's rating status:** rated levels query `states=rated`, unrated levels `states=unrated`. Both catalogs are curated the same way (mashups/remixes of Newgrounds-hosted songs are excluded), so a non-empty result from either is a **legitimate NONG**.

The state is chosen at check time from the level's `is_rated` (in the sync job, from the value RobTop just returned).

### Re-check Cadence

A level's song — and therefore its NONG status — changing is vanishingly rare (e.g. Slaughterhouse gaining a NONG on a rework, Battle of the Shades being unrated after repeated reworks). So a successful check is trusted and **re-checked at most once every ~6 months** (`SFH_RECHECK_DAYS` in `services/sfhSync.ts`), not on every sync pass. `sfhCheckDue(sfhCheckedAt)` is the single gate both call sites use:

- **`sfh_checked_at IS NULL`** (never succeeded — including a first check that failed) → always due, so failed checks retry every run until one succeeds and a transient outage never costs 6 months.
- **`sfh_checked_at` older than the cadence** → due again; catches the rare after-the-fact NONG add/remove or a rating flip that moves a level between catalogs.
- **`sfh_checked_at` within the cadence** → skipped.

This applies to found and not-found levels alike. Trade-off worth noting: because a found level is re-queried, a spurious empty response on a re-check would flip `is_nong` back to false and clear the `sfh*` fields — acceptable given how rare both the song change and a spurious-empty are, but it's why the re-check window is long rather than aggressive.

### Failure Handling

SFH being slow/down/erroring is an **expected branch**, never a blocking error — same philosophy as RobTop and GDDL. `fetchSongFileHubNong` returns:

- a result when a NONG exists (highest `downloads` wins if the array ever has more than one entry — not expected for a level-scoped query, but handled deterministically),
- `null` when the call succeeded but the array was empty (a valid, cacheable "checked, no NONG"),
- `undefined` when the call itself failed (network/timeout/non-2xx).

The shared write step (`services/sfhSync.ts`) stamps `sfh_checked_at = now()` on found **and** empty (both are "checked"); a failure writes nothing and leaves `sfh_checked_at` null so a later run retries. A failed SFH call never sets `is_nong` and never surfaces a 5xx.

### Decision Log

- **No manual NONG entry.** SFH is the sole source of truth; the speculative `nong_song_title` / `nong_artist` / `nong_source_url` columns (never built into any UI) were dropped.
- **`is_nong` is derived from SFH only** — `true` when a match is found, `false` when SFH confirms none.
- **Re-checked at most once per ~6 months**, not one-and-done: cheap insurance against the rare song change, without flooding a community API for data that almost never moves.
- **When checked:** at resolve time (best-effort, non-blocking, same contract as the GDDL suggested-tier fetch) and opportunistically during the RobTop sync jobs (see below), for any level currently due.

### Sync-Job Integration

`syncLevelBatch` (the shared core behind both sync schedules — see below) also runs an SFH check for any level in its batch that is due (`delisted_at IS NULL AND (sfh_checked_at IS NULL OR sfh_checked_at < now() - SFH_RECHECK_DAYS)`). It piggybacks on the levels each job already pulls in (no new schedule, no new query — just a per-level filter). SFH calls are paced sequentially (~670ms) like the RobTop calls, since SFH is community infrastructure. A level that RobTop reports **delisted in the same run** skips its SFH check for that run.

---

## Global Stats Viewer (GSV)

**Base URL:** `https://api.globalstatsviewer.com` (override via `GSV_API_BASE_URL`)
**Endpoint:** `GET /v3/levels/{levelId}`
**Purpose:** A level's placements on the three community difficulty lists, its showcase video, and a trustworthy object count.
**Auth:** None (public endpoint)
**Called from:** Lambda only (`apps/api/src/utils/globalStatsViewer.ts`)
**License:** Community-run aggregator — no published rate limit; pace calls and never poll.

One request returns what would otherwise take three integrations. `additional_info.lists` is an array holding any subset of:

| `name`  | `value`                        | Stored as                                             |
| ------- | ------------------------------ | ----------------------------------------------------- |
| `GDDL`  | decimal tier (`39.0`, `23.98`) | `gddlTier` (rounded at ingestion via `roundGddlTier`) |
| `AREDL` | rank int (`5`)                 | `aredlRank`                                           |
| `SHEET` | NLW/LW tier int, 0–21          | `sheetTier`                                           |

The array is often **empty** — a rated level on none of the three lists is normal, not an error.

**GSV never reports sheet tier 0, so we infer it.** Its SHEET values run 1–21 — verified across all 1805 extreme demons it indexes, with no zeroes anywhere in the distribution — which means the spreadsheets' bottom "Fuck" tier is indistinguishable from having no placement at all. `sheetTierForMissingEntry` in the client resolves that toward tier 0 for **extreme demons** (GSV `difficulty` 12), the only population the sheets rank.

This is an assumption, not something GSV states, and it deliberately over-reaches: 355 of those 1805 extreme demons (20%) carry no SHEET entry, and the evidence says most are unranked rather than bottom-tier — median level id 119.7M against 88.7M for placed levels, 89% above 100M, 347 of 355 on 2.2, and only 30% present on AREDL versus 100% of placed levels. A level the sheets simply haven't reached yet renders as tier 0. Because a real 0 never arrives from GSV, every stored 0 came from this rule and it reverses unambiguously with `UPDATE levels SET "sheetTier" = NULL WHERE "sheetTier" = 0;`. It also self-heals: once a level is placed, the next check overwrites the 0.

**`SHEET` is two spreadsheets on one ladder.** Tiers 0–13 are the Non-Listworthy sheet, 14–21 the Listworthy one, and nothing on the wire says which; the threshold is the whole of that knowledge, and it lives in `apps/web/src/lib/sheetTier.ts`. **Tier 0 ("Fuck") is a real tier** — a level whose skillset is too niche to rank reliably, _not_ one easier than Beginner. Every guard on a sheet tier is `!= null`, never truthiness, or tier-0 levels vanish from the UI.

### Object count

GSV's `stats.object_count` **supersedes RobTop's**. `getGJLevels21` key 45 reports `65535` for any level over the in-game object limit and `0`/null for older levels, so it cannot be shown to a user as-is. Both write the same `levels.objectCount` column: RobTop seeds it on first resolve, GSV overwrites it whenever GSV has a count. A GSV record _without_ one leaves RobTop's value standing rather than nulling it.

### Coverage

GSV indexes rated levels only (~58.6k at time of writing). An unrated or unindexed id returns **HTTP 404 `{"reason":"Level not found."}`** — an answer, not a failure. The check is therefore gated on `isRated`, since an unrated level would 404 on every pass forever; one that later gets rated is picked up anyway when its `gsvCheckedAt` ages out.

### Failure Handling

Same golden rule as RobTop / GDDL / SFH: GSV being slow/down/erroring is an **expected branch**, never a blocking error. `fetchGlobalStatsViewerLevel` returns:

- a result when GSV has the level,
- `null` on a 404 (a valid, cacheable "checked, not indexed"),
- `undefined` when the call itself failed (network/timeout/non-404 non-2xx).

The shared write step (`services/levels/gsvSync.ts`) stamps `gsvCheckedAt = now()` on found **and** 404; a failure writes nothing and leaves `gsvCheckedAt` null so a later run retries. A 404 deliberately does **not** clear existing placements — a level dropping out of GSV's index is far more likely an upstream gap than a real de-listing from all three lists at once.

### When It Runs

**Never on page view.** Two paths write it:

- **First resolve** — `findOrResolveLevel` runs `checkGsvIfDue` alongside the SFH check (in parallel; they hit unrelated hosts) so a level opened for the first time shows its tiers immediately.
- **Its own cron rotation** — `runGsvSyncSlice` in `services/levels/sync.ts`, driven by the same `LevelSync` cron, with its own `level_sync_cursor` key (`gsv`), a 200-level slice and ~300ms pacing.

**Why a separate rotation rather than piggybacking on the RobTop sweep** (the way the SFH check does): the RobTop slice is 50 levels/run, sized by RobTop's per-IP rate limit and the 670ms pacing — about 200 levels/day of turnover. List placements, GDDL tiers especially, move far faster than that. GSV is a different host under no such limit, so its rotation walks the cache several times faster while remaining a bounded cron slice. It also reaches levels the RobTop sweep deliberately skips: `official` rows are excluded there (getGJLevels21 never returns them, so a sync would look like a not-found and wrongly delist a level that plainly exists), but GSV does index them.

The re-check cadence is `GSV_RECHECK_DAYS` (7), applied as a SQL filter so a slice is 200 levels of actual work rather than 200 rows it then skips. In practice the rotation's speed, not the cadence, is the binding constraint.

`pnpm tsx src/scripts/backfillGsv.ts <dev|prod> [--dry-run]` (from `apps/api`) does the same check eagerly across the whole backlog, reusing the identical write path, so a freshly-shipped integration doesn't wait for the rotation to walk every cached level.

---

## levelthumbs

**Base URL:** `https://levelthumbs.prevter.me/thumbnail/{levelId}`  
**Purpose:** Level thumbnails  
**License:** Apache 2.0 — hotlinking permitted within rate limits  
**Called from:** Frontend (image src, no proxy needed)

Thumbnails are constructed as a deterministic URL on the frontend — no API call, no storage, no caching required.

```javascript
const getThumbnailUrl = (levelId: string) =>
  `https://levelthumbs.prevter.me/thumbnail/${levelId}`;
```

Covers rated levels and some significant unrated levels. Silently falls back to a placeholder image on `onError`.

```jsx
<img
  src={getThumbnailUrl(levelId)}
  onError={(e) => {
    e.currentTarget.src = '/placeholder-level.png'
  }}
  alt={levelName}
/>
```

Respect rate limits. Do not prefetch thumbnails in bulk or load them outside of visible UI.

---

## RobTop Level-Cache Sync Jobs

**Infrastructure:** AWS EventBridge Scheduler → Lambda (two schedules)
**Purpose:** Keep the shared `levels` cache current with RobTop's servers, and detect levels pruned from those servers.

Both schedules run one shared fetch/compare/write **core** (`apps/api/src/services/levelSync.ts`, `syncLevelBatch`). There is **no** staging, no pending fields, and no notification: a detected diff is written to the shared cache **silently**. Per-user progress data (including `progress_updates.in_game_difficulty_snapshot`) is never touched — this is a `levels` cache change only.

### The Two Schedules

| Job               | Cadence                            | Query (levels passed to the shared core)                                                                                              |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Volatile sync** | Weekly (Mondays, midnight UTC)     | `delisted_at IS NULL` AND (`is_rated = false` OR `rating_status_since >= now() - interval '14 days'`)                                 |
| **Standard sync** | First of every month, midnight UTC | `is_rated = true` AND `delisted_at IS NULL` AND (`rating_status_since IS NULL` OR `rating_status_since < now() - interval '14 days'`) |

The queries are complementary: the weekly job covers never-rated levels (a rating can appear at any time) and rated levels whose rating status changed within the last 14 days (the volatile window, most likely to be revised soon). The monthly job covers everything else that's rated and not delisted — including rated levels whose `rating_status_since` was never stamped (e.g. cached via import/resolve rather than a sync). No level is processed by both jobs in the same window.

### Shared Core Behavior (per level)

The core calls `fetchRobtopLevel`, then:

**Not found** (RobTop `-1`/empty → `null`, the same contract the `/resolve` endpoint uses):

- Set `delisted_at = now()` (and `last_checked_at`); `delisted` on the wire is derived as `delisted_at != null` — no separate boolean column.
- Freeze all metadata (`name`, `creator`, `in_game_difficulty`, `song_name`, `song_author`, `is_rated`) at last-known values.
- Run no diff logic. Delisted rows are excluded from both jobs thereafter (there is no un-delist path, so the timestamp alone is authoritative).

**Found** — diff against the cached row, writing only what changed:

- If `is_rated` or `in_game_difficulty` changed → write the new value(s) directly **and** stamp `rating_status_since = now()` (this is the only thing that drives the volatile window).
- If `name`, `creator`, `song_name`, or `song_author` changed → write the new value(s) directly (no timestamp tracking).
- `last_checked_at = now()` on every level processed, found or not.
- After a **found** level is reconciled, run the Song File Hub NONG check if the level is due (`delisted_at IS NULL AND (sfh_checked_at IS NULL OR sfh_checked_at older than the re-check cadence)`). A level **delisted this run** skips it. See the Song File Hub section above.

### Infrastructure Note

EventBridge Scheduler is serverless and costs essentially nothing at InfernoLog's scale. The sync Lambdas pace their RobTop calls (~670ms/level) and run under a 15-minute timeout. No always-on infrastructure is required.

---

## AREDL API

**Purpose:** Rank autofill for All Rated Extreme Demons List  
**Status:** Public API available, integration details to be confirmed

AREDL rank is surfaced **only for extreme demons** (AREDL lists extreme demons only). Pointercrate was evaluated and **cut from v1** — its coverage is largely mirrored by the top ~150 of AREDL, and a separate integration was not worth the development burden.

---

## NLW

**Purpose:** Tier reference for Non-Listworthy Spreadsheet  
**Status:** Likely no public API. Manual entry only for v1. Read-only scrape approach may be investigated for v2.
