# InfernoLog — List Integrations

## Overview

There are **two entirely separate GDDL tiers in this app**, and conflating them is the single easiest mistake to make here:

|            | `Level.gddlTier`                                                  | `LevelProgress.userGddlTier`                        |
| ---------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| What it is | The level's **real, current** community tier                      | **One user's own tier opinion**                     |
| Scope      | One value per level, shared by everyone                           | One value per user per level                        |
| Source     | Cached from GDDL, or GSV as a fallback                            | Entered/confirmed by the user when logging          |
| Updated    | By the community-list cron rotation                               | Only when the user edits it — it never follows GDDL |
| Shown on   | The Global Level Page's TIERS section, and rows of the demon list | Their own level page and the Log                    |

The community tier is offered as a starting suggestion when a level is logged. After that the two are independent: neither is derived from the other, and neither should be used to overwrite the other.

## Level-global placements (read-only)

A level's placements on all three community lists — **GDDL tier, AREDL rank, and the Non-Listworthy / Listworthy spreadsheet tier** — plus its showcase video and duration, are cached on the `levels` row by one pass that fetches **three sources in parallel**: the Global Stats Viewer, GDDL and AREDL. Each column has a priority order, since more than one source can speak to it. See `EXTERNAL_APIS.md` for the clients, the priority table, the write contract, and the cron rotation that refreshes them.

This is **read-only**. InfernoLog never submits to AREDL or the spreadsheets; the only writes to an outside list are the GDDL ones below, which go to GDDL directly with the user's own key.

**Tier 0 is reported by AREDL, and used to be inferred.** GSV reports sheet tiers 1–21 and never 0, so the bottom "Fuck" tier only ever appeared there as a missing entry, and an extreme demon with no SHEET placement was read as tier 0 — an assumption that also swept up extremes the sheets simply hadn't ranked. AREDL states the tier by name, so the inference is gone. See `EXTERNAL_APIS.md` for the measurements.

**The NLW/LW split is derived, not transmitted.** GSV reports one `SHEET` tier, 0–21; tiers 0–13 are the Non-Listworthy sheet and 14–21 the Listworthy one. `packages/core/src/sheetTier.ts` owns that threshold along with the tier names (shared, because AREDL reports the tier by name and the API needs the same table to turn it back into an index); `apps/web/src/lib/sheetTier.ts` keeps the colours. Tier 0 ("Fuck") is a real tier — a skillset too niche to rank reliably, not a level easier than Beginner — so it is guarded with `!= null`, never truthiness.

**There is no per-list table and no provider interface.** The placements are nullable columns on `levels`, written by one merge step with a fixed priority order per column. Pointercrate has no integration: its coverage is largely mirrored by the top ~150 of AREDL.

## The per-user GDDL tier

The user's own GDDL tier is `LevelProgress.userGddlTier` (see `schema.prisma`): one value per user per level. When a rated level is logged, the form pre-fills it with the level's community tier; the user confirms or overrides it. After that it changes only when the user edits it — it is their opinion at the time, not a live mirror of GDDL.

That is intentional. GDDL placements update extremely frequently, and what the player thought the level was when they beat it is the more meaningful thing to keep.

**Tier rounding:** GDDL's API exposes tiers as decimals (e.g. `18.43`), but GDDL itself displays and treats the tier rounded to the nearest whole number as canonical. InfernoLog rounds every GDDL rating to the nearest whole number at ingestion — the community-tier lookup and the record import alike — so the raw decimal is never stored or shown. (Rounding lives in `roundGddlTier` in `apps/api/src/utils/gddl.ts`.)

---

## GDDL Account Integration

Everything here needs the user's personal GDDL API key, connected in Settings. It is encrypted at rest with AWS KMS and never returned to the frontend — see `AUTH.md`. The endpoints and mechanics are in `EXTERNAL_APIS.md` → "GDDL API".

### Record import

A user can pull their GDDL records in. The sync runs as a background job, reads their GDDL submissions, and creates a completion for each level they have a record on.

### Record submission

From a level's page, a user can submit their existing completion to GDDL as a record. It is an explicit action that reports GDDL's answer; logging a completion never submits anything on its own.

### Favorites and Least Favorites sync

GDDL has favorites and least-favorites lists; InfernoLog has built-in `Favorites` and `Least Favorites` collections (special `type` values on `collections`). A user-triggered sync reconciles the two in both directions.

Beyond these, users can create **custom named collections** (e.g. "Recommended to Friends"); "Want to Beat" is itself a built-in. See the `Collection` and `CollectionEntry` models in `schema.prisma`.

### Known limitation: record deletion

GDDL records cannot be deleted via the API. Deleting an entry in InfernoLog leaves the GDDL record in place, to be managed on GDDL directly. The delete endpoint returns a message saying so; the web client does not currently show it.

---

## In the Spreadsheet

The import/export format has a `gddl_tier` column backed by `LevelProgress.userGddlTier`. Two other columns, `nlw_tier` and `gddl_tier_at_drop`, have nothing behind them: they always export blank and are ignored on import. Community placements are not exported, since they belong to the level rather than the account. See `IMPORT_EXPORT.md`.
