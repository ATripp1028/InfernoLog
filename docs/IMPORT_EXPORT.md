# InfernoLog — Import & Export

## Overview

InfernoLog supports importing data from spreadsheets and exporting data back to spreadsheets. The import and export formats are **identical** — a user can export their data, modify it, and re-import it cleanly. This also means the import template is simply a blank copy of the export format.

Spreadsheet import is a **v1 feature** because onboarding friction is the biggest risk to early adoption. Players with years of existing spreadsheet data should be able to bring that history into InfernoLog on day one, including full Time Machine reconstruction from historical completion dates.

---

## File Format

**SheetJS (xlsx)** is used for both import and export. The file contains multiple tabs:

| Tab           | Contents                                                                             |
| ------------- | ------------------------------------------------------------------------------------ |
| `Completions` | All completion progress updates (kind = completion)                                  |
| `Progress`    | All non-completion, non-drop progress updates — session logs short of the completion |
| `Dropped`     | All drop progress updates (kind = drop) — a level can have more than one             |
| `Ranking`     | Your personal classic difficulty ranking, hardest → easiest                          |
| `Lists`       | Collection membership — Want to Beat, Favorites, Least Favorites, and custom lists   |
| `Ratings`     | Weighted per-category scores                                                         |

Import processes every tab above. A blank/omitted tab is simply left untouched on import.

---

## Date Format Handling

Date format is the most critical import concern given the global player base.

### Format Selection

Before uploading, the user selects their date format:

```
┌────────────────────────────────────────┐
│  What date format does your sheet use? │
│                                        │
│  ○ MM/DD/YYYY  (US)                    │
│  ○ DD/MM/YYYY  (International)         │
│  ○ YYYY/MM/DD  (ISO with slashes)      │
│  ○ YYYY-MM-DD  (ISO with dashes)       │
└────────────────────────────────────────┘
```

This selection pre-populates from the user's `date_format_preference` account setting but can be overridden per-import.

### Silent Handling

These are resolved automatically without flagging:

- Missing leading zeros (`1/4/2019` → `2019-04-01`)
- Two-digit years (`19` → `2019`, valid since GD released in 2013)
- Dashes vs. slashes as separators

### Flagged for Manual Resolution

Dates that can't be interpreted are flagged as a **warning** (see severities below) — the date is dropped and the rest of the row still imports:

- Dates unparseable in the selected format
- Dates written as phrases (`"April 5th 2019"`, `"early 2019"`)

### Internal Storage

All dates stored as **ISO 8601 (YYYY-MM-DD)** regardless of input format. Displayed back to the user in their `date_format_preference`.

---

## Import Flow

```
┌─────────────────────────────────────────────────┐
│                  Import Flow                    │
│                                                 │
│  1. User downloads template (= blank export)   │
│                                                 │
│  2. User fills in template OR reformats         │
│     their existing sheet to match              │
│                                                 │
│  3. User selects date format                   │
│                                                 │
│  4. User uploads file                          │
│                                                 │
│  5. Validation pass runs:                      │
│     ├── Parse all dates                        │
│     ├── Check required fields                  │
│     ├── Flag ambiguous/invalid rows            │
│     └── Preview: X rows valid, Y rows flagged  │
│                                                 │
│  6. User reviews validation report             │
│     ├── Fix flagged rows and re-upload, OR     │
│     └── Proceed importing valid rows only      │
│                                                 │
│  7. Conflict check runs against existing data  │
│     └── Field conflicts (Completions/Progress/ │
│         Dropped/Ratings) and order conflicts   │
│         (Ranking/Lists) are detected up front  │
│                                                 │
│  8. User resolves any conflicts found          │
│     ├── Field conflicts: drop / overwrite /    │
│     │   merge, per field or in bulk            │
│     └── Order conflicts: three-column drag     │
│         board, git-merge style                 │
│                                                 │
│  9. Import commits                             │
│     └── Flagged rows skipped with report       │
└─────────────────────────────────────────────────┘
```

Steps 7-8 are skipped entirely — straight from review to commit — whenever the check finds nothing to reconcile, which is the common case for a first import or an unmodified reimport.

### Validation Report

Flags have two severities, following the general rule of thumb for bad data — never throw away a whole row over one bad cell:

- **Error (row skipped)** — the row can't be imported at all: no `level_id` **and** no `level_name`, or a non-numeric `level_id` with no name to fall back on.
- **Warning (value dropped, rest of the row imported)** — one field is bad but the row is otherwise fine: an unparseable/out-of-range percentage/run/rating, an unparseable date, an unknown `difficulty_opinion`, or a missing `level_id` that will be resolved from `level_name`. The bad value is dropped; the row still imports.

Rows are identified by **level name** (falling back to the level ID, then the spreadsheet row number) rather than by row number alone.

```
Import Preview: 847 rows ready, 3 skipped, 5 with dropped values

Bloodbath · attempts — attempts "~10000" isn't a valid number — value dropped
Phobos · date — Phrase date "June 18" — use MDY format — value dropped
row 512 · level_id — Missing level_id and level_name — row cannot be imported

[ Fix and re-upload ]  [ Import 847 rows, skip 3 ]
```

### Commit Outcomes

After committing, each row reports one outcome:

- **Imported** — a new entry was created.
- **Updated** — an existing entry was modified: a resolved Overwrite or Merge (see Conflict Resolution below), or an ordinary `drop_id`/`progress_id` round-trip on Dropped/Progress.
- **Skipped** — the row's data was not used at all: a resolved Drop, an unmodified reimport with nothing to reconcile, an exact duplicate of an existing Progress/Dropped entry, or a row superseded by a later row for the same level/entry within this import.
- **Failed** — the row could not be processed (e.g. its level name couldn't be resolved).

Only rows whose data is genuinely unused are reported as _skipped_ — a modified row is always reported as _updated_, never skipped. One exception surfaces as **Imported** rather than a clean skip: a Progress/Dropped row whose derived key (see below) partially matches an existing entry, but that arrived too late to be checked ahead of time (a name-only row, resolved only at commit time) — it's still created as a new entry, just flagged for a second look rather than silently duplicated without comment.

---

## Conflict Resolution

Five of the seven tabs can find their data already present in your account, under a different value or a different order. Two mechanisms cover every case, both modeled on git's own merge-conflict handling.

### Field conflicts — Completions, Progress, Dropped, Ratings

A field conflict is a single entry — a completion, a progress log, a drop, or one category's rating — where the sheet's value for a field disagrees with what's already stored. You resolve it with three choices, applied per field, per entry in bulk, or across every conflicting entry in the import at once:

- **Drop** — discard the imported row/value entirely; the existing data is left exactly as it was.
- **Overwrite** — the imported value replaces the existing one outright, including clearing a field the sheet leaves blank. This is a true replace, not a merge.
- **Merge** — reconcile field-by-field: for each differing field, pick "Imported," "Existing," or type a replacement value by hand. A field the sheet leaves blank always keeps its existing value under Merge — blank never clears.

A field that's blank on the sheet, or that already matches the existing value, never needs a decision — those auto-resolve silently, and only genuine disagreements are shown for review.

For Progress and Dropped specifically, a row with no `progress_id`/`drop_id` is first matched against your existing entries by a derived key — the exact combination of date and percentage/run range (see each tab's Semantics below) — before field conflicts even come into play: an exact match on every field is a silent no-op, and only a match on the key with something else different becomes a field conflict.

**Imported data always wins** — a checkbox on the Review step — skips this whole step-by-step review. Every field conflict the check finds is auto-resolved as an Overwrite and every order conflict auto-picks the spreadsheet's order (see below), exactly as if you'd clicked "Use imported for all" and "Use spreadsheet order" everywhere yourself; the wizard goes straight from Review to committing. Not offered during onboarding, where there's nothing yet to conflict with.

### Order conflicts — Ranking, Lists

The Demon List tab and each collection in the Lists tab are ordered lists, so a "conflict" here means the sheet and your account disagree about relative order, not a single value. The resolution mirrors a git merge: a three-column board shows the imported order on the left, your existing order on the right, and a middle column pre-filled with everything both orderings already agree on. You drag the disputed (and any newly-added) entries into the middle to decide the final order — or, if reconciling by hand isn't worth it, two buttons above the board ("Use spreadsheet order" / "Use InfernoLog order") let you pick one side's order wholesale instead.

Nothing is forced — if you leave entries unplaced in either source column, they're simply excluded from the final list once you confirm; a required checkbox makes sure that's deliberate. A pure insertion (an entry only one side has, whose position relative to the agreed order is unambiguous) never shows the board at all — it's spliced into the final order automatically, with no review needed. Only a genuine order disagreement, or an existing entry the sheet omits entirely, triggers manual review.

---

## Completions Tab Format

| Column                     | Required | Notes                                                                                                                                                                                                                                       |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level_id`                 | Yes      | In-game level ID                                                                                                                                                                                                                            |
| `level_name`               | No       | If blank, autofilled from the GD servers                                                                                                                                                                                                    |
| `date`                     | No       | In selected date format                                                                                                                                                                                                                     |
| `date_uncertain`           | No       | TRUE/FALSE                                                                                                                                                                                                                                  |
| `attempts`                 | No       | Integer                                                                                                                                                                                                                                     |
| `percentage`               | No       | Worst fail / last logged percentage (a trailing `%` is accepted)                                                                                                                                                                            |
| `run_from`                 | No       | Integer 0-100 (trailing `%` accepted)                                                                                                                                                                                                       |
| `run_to`                   | No       | Integer 0-100 (trailing `%` accepted)                                                                                                                                                                                                       |
| `on_stream`                | No       | TRUE/FALSE                                                                                                                                                                                                                                  |
| `fps`                      | No       | Integer                                                                                                                                                                                                                                     |
| `device`                   | No       | pc or mobile                                                                                                                                                                                                                                |
| `enjoyment`                | No       | 0-10                                                                                                                                                                                                                                        |
| `simple_rating`            | No       | 0-10                                                                                                                                                                                                                                        |
| `difficulty_opinion`       | No       | One of: not_demon_worthy, easy, medium, hard, insane, extreme                                                                                                                                                                               |
| `difficulty_opinion_stars` | No       | Integer 1-9 — only when `difficulty_opinion` is not_demon_worthy                                                                                                                                                                            |
| `coin_1`                   | No       | TRUE/FALSE — 1st user coin collected (ignored if the level has no coins)                                                                                                                                                                    |
| `coin_2`                   | No       | TRUE/FALSE — 2nd user coin collected (ignored if the level has no coins)                                                                                                                                                                    |
| `coin_3`                   | No       | TRUE/FALSE — 3rd user coin collected (ignored if the level has no coins)                                                                                                                                                                    |
| `two_player_solo`          | No       | TRUE = solo, FALSE = with a partner (blank if not a 2-player level)                                                                                                                                                                         |
| `two_player_partner`       | No       | Partner's name (only when `two_player_solo` is FALSE)                                                                                                                                                                                       |
| `in_game_difficulty`       | No       | Filters name resolution when `level_id` is blank; otherwise autofilled. Bare tier names mean the DEMON tier ("Easy" = Easy Demon); a non-demon writes a star count (`5★`), or marks the face when the count is unknown (`Hard (non-demon)`) |
| `gddl_tier`                | No       | Whole-number tier                                                                                                                                                                                                                           |
| `nlw_tier`                 | No       | Tier name                                                                                                                                                                                                                                   |
| `notes`                    | No       | Text about this completion                                                                                                                                                                                                                  |
| `level_notes`              | No       | Text about the level overall (separate from `notes`)                                                                                                                                                                                        |
| `video_url`                | No       | URL                                                                                                                                                                                                                                         |
| `highlight_url`            | No       | URL                                                                                                                                                                                                                                         |
| `visibility`               | No       | public or private (defaults to public)                                                                                                                                                                                                      |

A level's drop history — if it was ever dropped, including before being beaten — lives entirely on the `Dropped` tab, not here. Completions and drops are independent entries, so a dropped-then-completed level simply has rows on both tabs.

### Semantics

- **One completion per level**, round-tripping by `level_id` — there's no separate identity column the way Progress/Dropped have `progress_id`/`drop_id`.
- **Conflict resolution**: a row for a level that already has a completion, where at least one field genuinely differs, goes through the canonical field-conflict flow (see Conflict Resolution above) — Drop, Overwrite, or Merge. An unmodified reimport, where every field already matches, needs no resolution and is silently skipped.

### Column Tolerance

- Extra columns in the user's sheet are ignored
- Column order does not matter — columns are matched by header name
- Header names are case-insensitive and whitespace-tolerant (`"Level ID"`, `"level_id"`, `"LevelID"` all match)

---

## Progress Tab Format

Non-completion session logs — the history short of (or alongside) the eventual completion. Unlike every other tab, **multiple rows per level are expected**: one row per logged session.

| Column           | Required | Notes                                                                                                               |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `progress_id`    | No       | Round-trip identity for this exact entry, auto-filled on export. Leave blank when adding a new session log by hand. |
| `level_id`       | Yes\*    | In-game level ID                                                                                                    |
| `level_name`     | No\*     | If blank, autofilled from the GD servers                                                                            |
| `creator`        | No       | Narrows name resolution when the name matches many levels                                                           |
| `date`           | No       | In selected date format                                                                                             |
| `date_uncertain` | No       | TRUE/FALSE                                                                                                          |
| `attempts`       | No       | Cumulative attempt count as of this session                                                                         |
| `percentage`     | No       | Percentage reached this session (a trailing `%` is accepted)                                                        |
| `run_from`       | No       | Integer 0-100 (trailing `%` accepted) — use instead of `percentage` for a run-range session                         |
| `run_to`         | No       | Integer 0-100 (trailing `%` accepted)                                                                               |
| `on_stream`      | No       | TRUE/FALSE                                                                                                          |
| `fps`            | No       | Integer                                                                                                             |
| `device`         | No       | pc or mobile                                                                                                        |
| `enjoyment`      | No       | 0-10                                                                                                                |
| `notes`          | No       | Text about this session                                                                                             |
| `highlight_url`  | No       | URL                                                                                                                 |
| `visibility`     | No       | public or private (defaults to public)                                                                              |

\* one of `level_id` / `level_name` required per row.

### Semantics

- **Additive, not one-per-level.** Every row becomes its own progress entry — this tab has no "existing entry per level" concept the way Completions does.
- **Round-trips by `progress_id`.** A row whose `progress_id` matches one of your existing entries (for that same level) updates it in place (merge — only the fields the row provides are written).
- **Deduplicates by date/percentage/run range when `progress_id` is blank.** The row is matched against your existing entries for that level by the exact combination of `date`, `percentage`, `run_from`, and `run_to` — all four must agree, including all being blank together. A flat percentage reading and a run-range reading logged on the same day count as different sessions, not the same one recorded two ways. An exact match (every other field agrees too) is a silent no-op, so re-importing an unmodified export doesn't duplicate your session history. A match on just that key with something else different (a different `enjoyment`, `fps`, note, etc.) is surfaced as a field conflict (see Conflict Resolution above). No match at all — including any genuinely new, hand-added row — creates a new entry.
- **Never changes a level's completed/dropped status.** Status is established by the Completions/Dropped tabs; historical progress rows are pure session data, so reimporting them can't accidentally un-drop or un-complete a level.
- A level referenced only in this tab (no completion, no drop) is created as `IN_PROGRESS` — this is the only tab that can produce that state on import.

---

## Dropped Tab Format

Unlike Completions, **multiple rows per level are expected** — a level can be dropped, resumed, and dropped again, and each drop keeps its own independent history (same shape as the Progress tab).

| Column               | Required | Notes                                                                                                                                                                |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drop_id`            | No       | Round-trip identity for this exact drop, auto-filled on export. Leave blank when adding a new drop by hand.                                                          |
| `level_id`           | No\*     | In-game level ID                                                                                                                                                     |
| `level_name`         | No\*     | If blank, resolved from the GD servers by name                                                                                                                       |
| `creator`            | No       | Narrows name resolution when the name matches many levels                                                                                                            |
| `in_game_difficulty` | No       | Filters name resolution when `level_id` is blank; a bare tier name means the DEMON tier, a star count (`5★`) or a marked face (`Hard (non-demon)`) means a non-demon |
| `best_progress`      | No       | Percentage (a trailing `%` is accepted)                                                                                                                              |
| `run_from`           | No       | Trailing `%` accepted                                                                                                                                                |
| `run_to`             | No       | Trailing `%` accepted                                                                                                                                                |
| `attempts_at_drop`   | No       |                                                                                                                                                                      |
| `dropped_at`         | No       | Date                                                                                                                                                                 |
| `reason`             | No       | Text                                                                                                                                                                 |
| `gddl_tier_at_drop`  | No       | Snapshot (whole number)                                                                                                                                              |

\* one of `level_id` / `level_name` required per row.

### Semantics

- **Additive, not one-per-level.** Every row becomes its own drop entry — same as Progress, and unlike Completions.
- **Round-trips by `drop_id`.** A row whose `drop_id` matches one of your existing drops (for that same level) updates it in place (merge — only the fields the row provides are written).
- **Deduplicates by date/progress/run range when `drop_id` is blank** — the same rule as Progress above, keyed on `dropped_at`/`best_progress`/`run_from`/`run_to` (all four must agree, including all blank). An exact match is a silent no-op; a match on just the key with something else different surfaces as a field conflict (see Conflict Resolution above); no match creates a new drop entry.
- **Sets status to `dropped`**, unless the level is already completed (a drop logged against a completed level records history without un-completing it).

---

## Ranking Tab Format

Your personal difficulty ranking of levels you've completed. The tab is deliberately lean — the rest of each level's data lives in the log.

| Column       | Required | Notes                                                                                                                             |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `rank`       | No       | Optional number, **1 = hardest**. If present it sorts the tab; if absent, the sheet's row order is the order (top row = hardest). |
| `level_id`   | No\*     | In-game level ID of a level you've completed                                                                                      |
| `level_name` | No\*     | Matched against **your completed levels** (not the GD servers)                                                                    |

\* one of `level_id` / `level_name` required.

Semantics:

- **Merges with your existing ranking via the canonical order-conflict flow** (see Conflict Resolution above) whenever the two disagree on relative order. If you have no existing ranking, or the sheet's order and your existing order already agree once pure insertions are accounted for, the sheet's order is used directly with no review needed — the practical result is the same "sheet wins" outcome as a blind replace, just with a review step whenever something's genuinely at stake. Omit the tab (or leave it empty) to keep the account's existing ranking untouched entirely.
- Ranking applies only to **completions** — a listed level you haven't completed (or that only appears in the Dropped tab) is skipped with a note.
- Committed as one dedicated call **after** the completion/drop batches, so every ranked level already exists in your log.
- Internally the order maps to `ClassicDemonList.rankingIndex` (higher = harder); the numbers themselves are normalized, so gaps or duplicate `rank` values are fine.

---

## Lists Tab Format

Membership of your collections — Want to Beat / Favorites / Least Favorites and any custom collections. (The tab is named `Lists` for compatibility; it maps to the in-app Collections feature.)

| Column               | Required | Notes                                                                                                                                                                |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`               | Yes      | Reserved: `want_to_beat`, `favorites`, `least_favorites`. Anything else is a custom collection of that name.                                                         |
| `level_id`           | No\*     | In-game level ID                                                                                                                                                     |
| `level_name`         | No\*     | Matched against the GD servers (a listed level need not be completed)                                                                                                |
| `creator`            | No       | Narrows name resolution when the name matches many levels                                                                                                            |
| `in_game_difficulty` | No       | Filters name resolution when `level_id` is blank; a bare tier name means the DEMON tier, a star count (`5★`) or a marked face (`Hard (non-demon)`) means a non-demon |
| `position`           | No       | Order within the collection; row order is used if blank                                                                                                              |

\* one of `level_id` / `level_name` required.

Semantics:

- **Merges with each collection's existing membership via the canonical order-conflict flow** (see Conflict Resolution above), one collection at a time — only collections the sheet actually mentions are ever touched; collections you don't mention are left alone. If a mentioned collection doesn't exist yet, is currently empty, or the sheet's order already agrees with what's there, the sheet's rows are used directly with no review needed. Custom collections are created on demand by name. Rows targeting `want_to_beat` for a level you've already completed are skipped with a note (Want to Beat only holds unbeaten levels).
- A listed level need not be completed — want-to-beat levels usually aren't. Unknown levels are stubbed and queued for background enrichment, so their names fill in shortly after import.
- Committed as one dedicated call **after** the completion/drop batches (and ranking).

---

## Ratings Tab Format

Weighted per-category scores. The tab is "wide": identity columns, then **one column per rating category** (headers named after your categories).

| Column               | Required | Notes                                                                                                                                                                |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level_id`           | No\*     | In-game level ID                                                                                                                                                     |
| `level_name`         | No\*     | Matched against **your completed levels** (scores attach to the completion)                                                                                          |
| `creator`            | No       | Narrows name resolution                                                                                                                                              |
| `in_game_difficulty` | No       | Filters name resolution when `level_id` is blank; a bare tier name means the DEMON tier, a star count (`5★`) or a marked face (`Hard (non-demon)`) means a non-demon |
| _(any other column)_ | No       | Treated as a **category name**; the cell is that level's score                                                                                                       |

\* one of `level_id` / `level_name` required.

Semantics:

- **Score scale**: a value ≤ 10 is read as 0–10 (×10), a value > 10 as 0–100; both are stored as a 0–100 integer. So `9.5` and `95` both become `95`.
- **Categories matched by name** (case-insensitive). A name with no matching category is **created with weight 0** — it never disturbs the account's 1.00 weight-sum invariant, and the **rating mode is left unchanged** (set weights / switch to weighted in Settings).
- **Merge, not replace**: only the categories a row names are written; a completion's other category scores are left alone.
- **Conflict resolution per score**: if a named category already has a score for that completion, an identical incoming value is a silent no-op; a genuinely different value is surfaced as a field conflict via the canonical flow (see Conflict Resolution above) — Drop keeps the existing score, Overwrite/Merge take the sheet's value.
- A level must be **completed** to be rated (scores attach to a completion) — rows for uncompleted levels are skipped.
- Committed as one dedicated call **after** the completion/drop batches.

---

## Export

Export produces the **same workbook shape as the import template** (all tabs above + a Field Descriptions tab), so an export is itself a valid import file — export → reimport round-trips.

- **Endpoint**: `GET /v1/me/export?section=<section>&offset=<n>&limit=<n>`. The account's data is returned one section at a time (`completions`, `progress`, `dropped`, `ranking`, `lists`/`collections`, `ratings`, `categories`) with offset pagination, so no single response can exceed API Gateway's ~6 MB cap for a large account. The client fetches every section to completion and stitches them into the workbook.
- **Formatting is client-side**: dates in the user's `date_format_preference`, ratings on the 0–10 scale (internal `0-100 ÷ 10`, which round-trips through the importer's ≤10 rule), coin bitmask → `coin_1/2/3`, enum casing lowered.
- **`in_game_difficulty` is the level's difficulty now**, taken from the shared cache rather than the snapshot each entry stored when it was logged. The column only ever filters name resolution on the way back in, and it is matched against that same cache — a snapshot that has since gone stale could only rule the row's own level out. Import re-snapshots from the cache itself and never stores this cell, so nothing round-trips away. Non-demons are written as a star count (`5★`), or as a marked face (`Insane (non-demon)`) when no count on the 1-9 scale describes them — a cache row that only ever had a label, or an official level whose bespoke award runs past 9. Writing the bare face would re-import as the demon tier of that name.
- **Not included** (out of the import model / user-only, so a round-trip won't restore them): rating category weights + rating mode, system timestamps, and AREDL references. `nlw_tier` is a reserved column with no backing data yet (no NLW list integration) — it always exports blank and is ignored on import.
- **Drop-then-completed history round-trips too**: a dropped-then-beaten level exports rows on **both** the Dropped and Completions tabs — the drop is its own independent entry (with its own `drop_id`), never merged into or overwritten by the later completion. A level dropped more than once (drop → resume → drop again) exports one Dropped-tab row per drop, each with its own date/attempts/reason. The Level Page timeline and runs graph show every drop as its own entry, regardless of the level's current status.

---

## Template Download

A blank template file is always available for download from the import screen. It contains:

- All column headers with correct names
- One example row (clearly marked as example, to be deleted)
- A second tab with field descriptions and valid value ranges

The template is identical to an export file, making the workflow for existing spreadsheet users:

```
Export from InfernoLog → modify → re-import  (round-trip safe)
Existing sheet → reformat to match template → import
```
