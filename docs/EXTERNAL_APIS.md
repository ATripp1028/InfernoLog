# InfernoLog — External APIs & Integrations

## GDBrowser

**Base URL:** `gdbrowser.com/api`  
**Purpose:** Primary level metadata autofill for both rated and unrated levels  
**Auth:** None required  
**Called from:** Lambda (server-side only)

GDBrowser queries the GD servers directly by level ID and returns name, creator, song, length, and description. It is the first call in the autofill pipeline for every level ID entry, regardless of whether the level is rated or unrated.

### Usage Pattern

```
GET gdbrowser.com/api/level/{levelId}
```

Response is cached in InfernoLog's `levels` table. Subsequent users logging the same level ID do not trigger a new GDBrowser call — the cached data is returned directly.

### Failure Handling

If GDBrowser is unavailable, the user is notified and may proceed with fully manual data entry. The logging flow is never blocked by GDBrowser being down.

---

## GDDL API

**Purpose:** GDDL tier autofill suggestion + optional record submission  
**Auth:** Per-user API key (stored encrypted, used server-side only)  
**Called from:** Lambda only  
**License:** Free platform — minimize load, never poll for live tier updates

### Autofill

Called after GDBrowser when a rated level is detected. Returns the current GDDL tier as a **suggested value** — the user confirms or overrides before saving. This value becomes a snapshot on the completion record.

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

For each level in the `levels` table with `is_rated = true`, the job calls GDBrowser and compares the returned values against stored values.

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

## Pointercrate API

**Purpose:** Rank autofill for Pointercrate Demonlist  
**Auth:** Public read endpoints require no auth  
**Status:** Integration feasibility confirmed for autofill; record submission to be investigated

---

## AREDL API

**Purpose:** Rank autofill for All Rated Extreme Demons List  
**Status:** Public API available, integration details to be confirmed

---

## NLW

**Purpose:** Tier reference for Non-Listworthy Spreadsheet  
**Status:** Likely no public API. Manual entry only for v1. Read-only scrape approach may be investigated for v2.
