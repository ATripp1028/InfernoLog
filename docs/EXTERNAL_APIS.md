# InfernoLog — External APIs & Integrations

## Geometry Dash servers (RobTop / boomlings.com)

**Base URL:** `http://www.boomlings.com/database` (override via `ROBTOP_API_BASE_URL`)  
**Purpose:** Primary level metadata autofill for both rated and unrated levels  
**Auth:** None — a fixed public secret (`Wmfd2893gb7`) is sent as a request param  
**Called from:** Lambda (server-side only). Client: `apps/api/src/utils/robtop.ts`

We call RobTop's official servers directly (previously via the third-party GDBrowser proxy). The endpoint is `getGJLevels21.php` with `type=10` (fetch specific levels by id), so we query a single id and read the first (only) level. It returns name, creator, song, length, description, and the full stat/flag set, which we parse into the `levels` cache columns. See `https://wyliemaster.github.io/gddocs`.

### Usage Pattern

```
POST http://www.boomlings.com/database/getGJLevels21.php
Content-Type: application/x-www-form-urlencoded
User-Agent:                      ← MUST be empty (Cloudflare returns HTTP 1020 otherwise)

type=10&str={levelId}&secret=Wmfd2893gb7&gameVersion=22&binaryVersion=42
```

The response is a raw delimited blob (not JSON): `levels # creators # songs # pageInfo # hash`, where the level is colon/`:`-paired keys, creators are `playerID:username:accountID`, and songs are `~|~`-delimited objects separated by `~:~`. `parseGetGJLevels21` (unit-tested in `robtop.test.ts`) joins the level to its creator and song and derives the human-readable difficulty from the raw keys (`8`/`9`/`17`/`25`/`43`). Rate limits are ~2 req/s for data endpoints; our usage is per-user cache-miss only.

`-1` (or empty/malformed) means not found → the client returns `null`. Custom (Newgrounds) songs come from the response; **official/built-in tracks** are resolved name/author from a static table in `robtop.ts` (the level object only carries the official-song index). A few fields GDBrowser used to compute (creator points, orbs, diamonds) are not in the level object and are stored `null`.

Response is cached in InfernoLog's `levels` table (`data_source = robtop_autofill`). Subsequent users logging the same level ID do not trigger a new request — the cached data is returned directly.

### Failure Handling

If the servers are unavailable, the user is notified and may proceed with fully manual data entry. The logging flow is never blocked by the servers being down.

**Auto-fallback to manual entry.** When the fetch fails or returns nothing (down/timed out, or an unrated/brand-new level), the flow **automatically** falls back to a manual entry view — there is no "enter manually" escape hatch in the happy path, and the view never appears when autofill succeeds. It collects the fields autofill would normally provide: level name, creator, in-game difficulty, song name, song author, length. These map to the shared `levels` cache columns. Crucially, with no cached value to defer to, **the difficulty the user picks becomes the level's `in_game_difficulty`** (the one exception to "in-game difficulty is always cached and read-only"). Manually-sourced rows are stored with `data_source = manual` and `verified = false` so a later sync can backfill and verify/override them. See `LOGGING_FLOW.md` and `DATA_MODEL.md`.

### Cache-Backed Name Search

The logging flow's level-entry field accepts **either an ID or a name** (one field, disambiguated by `^\d+$` → ID lookup, else → name search). Name search resolves against **InfernoLog's own `levels` cache**, not GD's live search — this controls the result set, costs nothing externally, and is fast (local Postgres). A level becomes name-searchable only after its first log by any user; entering a raw ID routes through autofill and **populates the cache**, seeding the search index for next time. See `LOGGING_FLOW.md` and `LEVEL_PICKER.md`.

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

| Job | Cadence | Query (levels passed to the shared core) |
| --- | --- | --- |
| **Volatile sync** | Weekly (Mondays, midnight UTC) | `delisted = false` AND (`is_rated = false` OR `rating_status_since >= now() - interval '14 days'`) |
| **Standard sync** | First of every month, midnight UTC | `is_rated = true` AND `delisted = false` AND (`rating_status_since IS NULL` OR `rating_status_since < now() - interval '14 days'`) |

The queries are complementary: the weekly job covers never-rated levels (a rating can appear at any time) and rated levels whose rating status changed within the last 14 days (the volatile window, most likely to be revised soon). The monthly job covers everything else that's rated and not delisted — including rated levels whose `rating_status_since` was never stamped (e.g. cached via import/resolve rather than a sync). No level is processed by both jobs in the same window.

### Shared Core Behavior (per level)

The core calls `fetchRobtopLevel`, then:

**Not found** (RobTop `-1`/empty → `null`, the same contract the `/resolve` endpoint uses):

- Set `delisted = true`, `delisted_at = now()` (and `last_checked_at`).
- Freeze all metadata (`name`, `creator`, `in_game_difficulty`, `song_name`, `song_author`, `is_rated`) at last-known values.
- Run no diff logic. Delisted rows are excluded from both jobs thereafter.

**Found** — diff against the cached row, writing only what changed:

- If `is_rated` or `in_game_difficulty` changed → write the new value(s) directly **and** stamp `rating_status_since = now()` (this is the only thing that drives the volatile window).
- If `name`, `creator`, `song_name`, or `song_author` changed → write the new value(s) directly (no timestamp tracking).
- `last_checked_at = now()` on every level processed, found or not.

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
