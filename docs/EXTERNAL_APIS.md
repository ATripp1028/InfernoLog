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
  onError={(e) => { e.currentTarget.src = '/placeholder-level.png'; }}
  alt={levelName}
/>
```

Respect rate limits. Do not prefetch thumbnails in bulk or load them outside of visible UI.

---

## Monthly Level Data Sync Job

**Infrastructure:** AWS EventBridge Scheduler → Lambda  
**Schedule:** First of every month, midnight UTC  
**Purpose:** Detect nudge-worthy changes to cached level metadata

### What It Does

For each level in the `levels` table with `is_rated = true`, the job re-fetches from RobTop's servers (`fetchRobtopLevel`) and compares the returned values against stored values.

**Nudge-worthy changes (trigger notification):**
- Level name
- Creator
- Song name
- Song author

**Not nudge-worthy (ignored):**
- Description
- Any other metadata

### On Change Detection

1. Set `levels.has_pending_update = true`
2. Store new values in `levels.pending_name`, `levels.pending_creator`, etc.
3. Create a `level_update_notifications` row for every user who has a completion for that level
4. Update `levels.last_checked_at`

### User Experience

Users with a pending update see:
- A one-time notification in their notification feed
- A visual indicator on the affected entry in their log and ranking views

From either surface, the user can view old vs. new values and choose to accept (updates the stored values, clears the indicator) or dismiss (clears the indicator without updating).

### Accepting an Update

When the user accepts an update, `levels.name` (and other changed fields) are updated to the pending values and `has_pending_update` is set to false. The `level_update_notifications` row for that user is marked as seen.

### Infrastructure Note

EventBridge Scheduler is serverless and costs essentially nothing at InfernoLog's scale. No always-on infrastructure is required for this job.

---

## AREDL API

**Purpose:** Rank autofill for All Rated Extreme Demons List  
**Status:** Public API available, integration details to be confirmed

AREDL rank is surfaced **only for extreme demons** (AREDL lists extreme demons only). Pointercrate was evaluated and **cut from v1** — its coverage is largely mirrored by the top ~150 of AREDL, and a separate integration was not worth the development burden.

---

## NLW

**Purpose:** Tier reference for Non-Listworthy Spreadsheet  
**Status:** Likely no public API. Manual entry only for v1. Read-only scrape approach may be investigated for v2.
