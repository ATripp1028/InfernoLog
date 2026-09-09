# InfernoLog — List Integrations

## Overview

There are **two entirely separate GDDL tiers in this app**, and conflating them is the single easiest mistake to make here:

|            | `Level.gddlTier`                             | `LevelProgress.userGddlTier`                                   |
| ---------- | -------------------------------------------- | -------------------------------------------------------------- |
| What it is | The level's **real, current** community tier | **One user's own tier opinion**                                |
| Scope      | One value per level, shared by everyone      | One value per user per level                                   |
| Source     | Cached from the Global Stats Viewer          | Entered/confirmed by the user when logging                     |
| Updated    | By the GSV cron rotation                     | Never — it's a snapshot of what they thought when they beat it |
| Shown on   | The Global Level Page's TIERS section        | Their own level page, the Log, the demon list                  |

Neither is derived from the other, and neither should ever be used to fill in the other.

## Level-global placements (read-only, via GSV)

A level's placements on all three community lists — **GDDL tier, AREDL rank, and the Non-Listworthy / Listworthy spreadsheet tier** — are cached on the `levels` row from a single Global Stats Viewer call. See `EXTERNAL_APIS.md` for the client, the write contract, and the cron rotation that refreshes them.

This is **read-only**. InfernoLog reads placements through GSV and never submits to AREDL or the spreadsheets; the only write integration is GDDL record submission below, which goes to GDDL directly with the user's own key.

**The NLW/LW split is derived, not transmitted.** GSV reports one `SHEET` tier, 0–21; tiers 0–13 are the Non-Listworthy sheet and 14–21 the Listworthy one. `apps/web/src/lib/sheetTier.ts` owns that threshold along with the tier names and colours. Tier 0 ("Fuck") is a real tier — a skillset too niche to rank reliably, not a level easier than Beginner — so it is guarded with `!= null`, never truthiness.

This supersedes part of the "Abandoned Design" note below: AREDL and NLW _data_ are now surfaced, but nothing about the abandoned generic `list_references` / `ListProvider` machinery came back. There is no per-list table and no provider interface — three nullable columns on `levels`, written by one client.

## The per-user GDDL snapshot

The user's own GDDL tier is a **snapshot at time of logging**: `LevelProgress.userGddlTier` (see `schema.prisma`), one value per user per level, entered/confirmed manually rather than kept live. It is never automatically updated after logging.

---

## GDDL Integration

**API:** Confirmed available. Requires user's personal GDDL API key for write operations.

### Autofill on Level ID Entry

When a user enters a level ID during logging, InfernoLog calls the GD servers first for general metadata, then GDDL for tier-specific data. GDDL autofill populates:

- Current GDDL tier (presented to user as a suggested snapshot value to confirm)
- Record eligibility status

**Tier rounding:** GDDL's API exposes tiers as decimals (e.g. `18.43`), but GDDL itself displays and treats the tier rounded to the nearest whole number as canonical. InfernoLog rounds every GDDL rating to the nearest whole number at ingestion — both the per-level autofill lookup and the bulk submission sync — so we never store or surface the raw decimal. (Rounding lives in `roundGddlTier` in `apps/api/src/utils/gddl.ts`.)

### Record Submission

If the user has provided their GDDL API key, they can submit a completion record to GDDL when logging a completion in InfernoLog. This is optional and user-initiated. The submission is made server-side via Lambda using the encrypted stored API key.

**GDDL API key storage:** Encrypted at rest with AWS KMS. Never returned to the frontend after initial entry. See `AUTH.md`.

### Tier as Manual Snapshot

The GDDL tier is entered/confirmed manually by the user rather than fetched automatically at logging time. This is intentional:

- GDDL placements update extremely frequently
- The snapshot reflects what the tier was when the player beat it, which is more historically meaningful
- Avoids excessive API load on GDDL's free platform

### Known Limitation: Record Deletion

GDDL records cannot be deleted via the API. If a user deletes a completion from InfernoLog, they are warned in the delete confirmation modal that the associated GDDL record must be managed directly on the GDDL platform.

### CSV Import/Export

The import/export format has a `gddl_tier` column backed by `LevelProgress.userGddlTier`, plus `gddl_tier_at_drop`. It also still has an `nlw_tier` column left over from the abandoned multi-list design — it has no backing storage and is always blank on export.

---

## Favorites and Least Favorites

GDDL exposes a favorites and least favorites feature via its API. InfernoLog mirrors this concept and extends it:

- Users have built-in `favorites` and `least_favorites` collections (special `type` values on `collections`)
- On initial GDDL connection, users can optionally **import** their existing GDDL favorites/least favorites
- When marking a level as a favorite in InfernoLog, users can optionally **sync** that to their GDDL account simultaneously
- Beyond these, users can create unlimited **custom named collections** (e.g. "Recommended to Friends"); "Want to Beat" is itself a built-in

See the `Collection` and `CollectionEntry` models in `schema.prisma`.

---

## Abandoned Design (historical only — not a roadmap)

Everything below was designed at some point but was **abandoned and never built**. It's kept here only so a future read of old PRs/discussions referencing it has context. None of it should be implemented off the back of this doc.

> Note: AREDL rank and NLW/LW tiers **are** now shown on the Global Level Page — see "Level-global placements" above. What stays abandoned is the _machinery_ below, not the data.

- **Multi-list support** (AREDL, NLW, Pemonlist) behind a generic `list_references` table: one-to-many per completion, `at_time_of_completion` snapshot flag, and a `ListProvider` interface for pluggable sources (`autofillByLevelId` / optional `submitRecord`). Pointercrate was evaluated and rejected even for this design, as mirrored well enough by AREDL's top ~150.
- **AREDL rank**, shown only for extreme demons.
- **NLW bracket tier**, manual-entry only (no public API).
- **Skill tags** (e.g. "wave", "memory", "timing") sourced from GDDL/AREDL autofill and stored per-level, plus a later community-voting system on top.
