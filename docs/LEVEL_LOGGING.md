# InfernoLog — Level Logging

## Core Concept: Progress Entries

InfernoLog does not separate "completions" from "attempts." Every interaction with a level is a **progress update** on a **level progress entry**. A completion is simply a progress update with `kind = completion`; a drop is one with `kind = drop`.

```
LevelProgress (one per user per level)
 └── ProgressUpdate[]
      ├── 8%  logged casually                (kind = progress)
      ├── 44% with run range 44-87           (kind = progress)
      ├── 76% on stream, notes about the attempt (kind = progress)
      ├── dropped, reason in notes           (kind = drop)
      └── 100%                               (kind = completion) ← can be placed on the demon list
```

This mirrors how the GDDL handles progress — players can log ratings and progress on levels they haven't beaten.

Two tables hold it. `LevelProgress` is the user's relationship to the level and carries everything that has **one current value per level**: status, rating scores, difficulty opinion, the user's GDDL tier, worst fail, coins collected, level notes, and visibility. `ProgressUpdate` is one logged event and carries what belongs to **that session**: percentage or run range, date, attempts, enjoyment, FPS, device, notes, and video links. See `schema.prisma` for the columns.

---

## Autofill Flow

When a user enters a level ID, the following fires automatically:

```
User enters Level ID (or picks a level by name)
        │
        ▼
  Level in InfernoLog's cache?
    ├── Yes → use it (no external call)
    └── No  → GD servers ──────────► name, creator, song, length, difficulty
                 ├── rated non-demon → refused, nothing is logged
                 └── unreachable / no such level → manual entry
        │
        ▼
  Community lists (first resolve only) ► GDDL tier, AREDL rank, sheet tier
        │
        ▼
  Rated level? → its community GDDL tier pre-fills the user's own tier
        │
        ▼
  levelthumbs.prevter.me ─────────► thumbnail (best-effort, silent fallback)
```

**Fallback:** If the GD servers are unavailable, the user proceeds with manual entry. The logging flow is never blocked by API unavailability. See `EXTERNAL_APIS.md` for each source.

**Only demons and unrated levels can be logged.** The cache refuses a rated non-demon (see `LOGGING_FLOW.md` → "Scope Stance").

---

## Fields

All fields are optional except the level. The user logs whatever is relevant to them at that moment. "Per event" fields live on the `ProgressUpdate`; "per level" fields live on the `LevelProgress` and hold one current value however many times the level is logged.

| Field                | Scope     | Type                           | Notes                                                                                                                                             |
| -------------------- | --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level                | —         | Required                       | An ID or a name. Triggers autofill                                                                                                                |
| Kind                 | Per event | progress / drop / completion   | Set by which FAB path was chosen — never a user-facing toggle mid-form                                                                            |
| Percentage           | Per event | Decimal, above 0 up to 100     | Progress path only ("From 0%"). **Omitted on completions** (100% implied)                                                                         |
| Run range            | Per event | e.g. 30-63                     | Progress path only, "From a run" mode. Integers 0-100, end above start. **Not used on completions**                                               |
| Percentage version   | Per event | 2.1 / 2.2                      | Which game version's percentage system the figure is in. Pre-filled from the user's default                                                       |
| Date                 | Per event | Date, optional time + timezone | Checkbox to flag as uncertain. A time is stored with the timezone it was entered in                                                               |
| Attempts             | Per event | Integer                        | Cumulative. See convention below                                                                                                                  |
| On stream            | Per event | Boolean                        | Was this session streamed live                                                                                                                    |
| FPS                  | Per event | Integer                        | e.g. 60, 120, 240. Pre-filled from the user's default FPS                                                                                         |
| Device               | Per event | pc / mobile                    | Pre-filled from the user's default device                                                                                                         |
| Enjoyment            | Per event | Integer 0-100                  | Whole numbers on 0-100. See `RATING_SYSTEM.md` → Scales                                                                                           |
| Notes                | Per event | Text                           | Freeform. Venting encouraged, see Community Policy                                                                                                |
| Completion video URL | Per event | URL                            | Completions only                                                                                                                                  |
| Highlight video URL  | Per event | URL                            | Independent of On Stream                                                                                                                          |
| 2-player             | Per event | Solo / with a partner + name   | Completions of 2-player levels only                                                                                                               |
| In-game difficulty   | Per event | Snapshot, read-only            | Copied from the cached level when the event is logged (e.g. "Insane Demon"). Never user-edited. See `LOGGING_FLOW.md` → "Two Difficulty Concepts" |
| Rating               | Per level | 0-10 score per rating category | Combined into a weighted average. One category ("Overall") by default                                                                             |
| Difficulty opinion   | Per level | Pill selector                  | The user's subjective read: Not demon-worthy / Easy / Medium / Hard / Insane / Extreme. The only difficulty field the user edits                  |
| GDDL tier            | Per level | Integer                        | The user's own tier opinion, pre-filled from the level's community tier                                                                           |
| Worst fail           | Per level | Integer 0-100, optional date   | Best run from 0% before beating or dropping the level                                                                                             |
| Coins collected      | Per level | Up to three coins              | Only for levels that have coins                                                                                                                   |
| Level notes          | Per level | Text                           | About the level overall, separate from a session's notes                                                                                          |
| Visibility           | Per level | public / private               | Stored per entry, default public. See "Per-entry visibility" below                                                                                |

The level's community placements (GDDL tier, AREDL rank, sheet tier) are properties of the level, not of the user's entry, and are not logged — see `EXTERNAL_APIS.md` → "Community lists".

### Attempt Count Convention

Attempts represent **cumulative attempts across all uploads and copies of the level**, not just the current upload. This is an honor-system convention the app cannot enforce. It is stated in a hint under the attempts field.

### Worst Fail

Worst fail is its own stored field on the level entry, with an optional date. The completion and drop forms ask for it; it is not derived from the progress history. The Level Page shows it as its own milestone in the timeline.

### Run Range Format

Run range represents the start and end percentage of the player's best run, e.g. `30-63` meaning they started at 30% and reached 63%. Both values are integers between **0 and 100** (a run from the start of the level is **0%**, not 1%), and the end must be above the start.

Run range applies **only to the progress path**, and only in "From a run" mode. A completion is by definition a 0→100 run, so it has **no run-range fields** — there is nothing to log. See `LOGGING_FLOW.md` for the progress path's "From 0%" / "From a run" segmented control.

---

## Logging Flow

The logging flow is a FAB-triggered, multi-step modal. **The path — log a completion, log progress, or drop a level — is chosen at the FAB before the modal opens**, so each path is a purpose-built form rather than one generic form with a mid-flow completion toggle. There is **no mid-form "Is this your completion?" decision** and **no auto-placement**: every completion starts unplaced and is placed manually, prompted _after_ submit.

See **`LOGGING_FLOW.md`** for the full specification (entry point, modal shape, the three paths, field reference, and post-submit placement).

---

## Completion-Specific Behavior

When `kind = completion`:

- `LevelProgress.status` becomes `COMPLETED`
- The level is removed from Want to Beat, in the same transaction
- A classic level becomes eligible for the demon list (placed manually — see `DEMON_LIST.md`), and the last step of the flow offers to place it now
- The level counts on the Ranking page, which orders completions by rating

Saving a completion sends nothing to GDDL by itself. A user with a GDDL key connected is then offered a "Submit to GDDL?" card, and the same action is available later from the level's page (see `EXTERNAL_APIS.md` → "Record submission").

**One completion per level per user, and it is edit-not-replace.** Choosing "Log a completion" for a level that already has one **routes the user to edit the existing completion** rather than creating or overwriting a second. There is no replace path.

### Progress on a beaten level

**A progress entry may never be dated after the level's completion.** Backfill — a session dated before it, or on the same day — is always allowed.

A completion records the run that beat the level, so nothing logged after it can be progress toward beating it; a later entry either duplicates the completion or is a lower number that means nothing. What a completed level _can_ hold is everything logged on the way there, which is why the rule is an ordering rather than "a beaten level has no progress rows". Backfilling never un-completes a level: its status stays `COMPLETED`.

**One rule, one comparator.** `isDatedAfterCompletion` (`apps/api/src/services/progress/completionOrder.ts`) is the whole of it, and every path that can put a progress entry on a completed level calls it:

| Path                             | Enforced in                    | On violation                       |
| -------------------------------- | ------------------------------ | ---------------------------------- |
| `POST /v1/me/progress`           | `applyProgress`                | 409 `ProgressAfterCompletionError` |
| `PATCH /v1/me/progress/:levelId` | `applyEdit` (PROGRESS targets) | 409 `ProgressAfterCompletionError` |
| Spreadsheet import, Progress tab | `planProgress`                 | Row skipped, reason reported       |

Both sides are compared as calendar days, each read back through its own timezone; the raw instants are never compared. Undated on either side, or the same day, is not a violation — grinding a level and beating it in one sitting is the ordinary case, and refusing what cannot be placed would reject real history over a blank date field.

The completion is found by looking for a `kind = completion` update, not by reading `status`, so a level dropped after being beaten is covered too.

**Not policed:** editing the _completion's_ date earlier, which can strand existing sessions after it. Only an edit can reach that state, and refusing it would leave the user unable to correct a mistyped completion date without deleting the sessions first.

**Deleting an event** re-derives the status from what remains, and a stray progress entry after a completion does not un-complete the level there either — rows that predate this rule can still be in that shape.

**Both level pages drop the "Log progress" action once a level is beaten** (`resolveLevelOwnership`, `useGlobalLevelDetailPage`), which is stricter than the rule: in-app backfill has no entry point, so backfilling a beaten level's history is an import job. That is a UI decision, not the rule — the endpoint accepts a backfilled session from any caller.

---

## Dropped Levels

A dropped level is a `LevelProgress` entry with `status = DROPPED`, and the drop itself is a `ProgressUpdate` with `kind = drop`. It is not a separate entity — the full progress history is preserved.

```
LevelProgress.status transitions:
  (none) → DROPPED          (drop-from-scratch — dropping a never-logged level)
  IN_PROGRESS → DROPPED     (user marks as dropped)
  DROPPED → IN_PROGRESS     (automatic when the user logs new progress)
  IN_PROGRESS → COMPLETED   (user logs completion)
  DROPPED → COMPLETED       (user beats it after dropping)
```

A level can be dropped without ever having been logged ("drop-from-scratch"): the
`LevelProgress` row is created directly at `DROPPED`, with no prior
`IN_PROGRESS` row. This is deliberate, not an oversight.

Conversely, logging a progress update on a dropped level **automatically** flips it
back to `IN_PROGRESS` (`applyProgress` in `apps/api/src/services/progress/index.ts`).
Logging fresh progress implies the user has picked the level back up, and without the
flip a "dropped" level would keep accumulating progress updates while still displaying
as dropped. A level created by a progress log starts `IN_PROGRESS`.

When a dropped level is eventually beaten, the completion is logged as a normal progress update on the existing entry. The drop history remains intact as its own `ProgressUpdate` row(s) — not merged into or overwritten by the completion.

The drop screen collects date, attempts, worst fail, and a reason — the reason and date stored on the `kind = drop` row using the same `date`/`attempts`/`notes` columns every other progress update uses, not drop-specific fields. A level can be dropped more than once (drop → resume → drop again); each drop is its own row, so earlier drops' reasons and dates aren't lost when a later one is logged.

Deleting a single logged event re-derives the status from what remains. Deleting the last one deletes the whole entry.

---

## In-Progress Levels

In-progress levels are `LevelProgress` entries with `status = IN_PROGRESS` and no `kind = completion` update. They appear in the Log alongside everything else, and the Log's status filter narrows to them. There is no limit on how many a user can have.

Progress is a manually updated snapshot — the user logs updates whenever they have something worth recording.

### Per-entry visibility

Each level entry has a public/private setting, independent of the account's profile visibility. It is stored and editable, and **nothing enforces it**, because no part of the app shows one user's data to another.

**Motivating example:** A well-known player may want to hide a completion entry until their video goes live (e.g. KrMaL verifying Low Death in mid-March but holding the video until April 1st). Per-entry privacy is what will let that happen without taking the whole profile private.

---

## Unrated Levels

Fully supported with the same fields as rated levels — and the only levels besides demons that can
be logged at all, since the cache refuses a rated non-demon (see `LOGGING_FLOW.md` → "Scope
Stance"). The differences:

- No GDDL tier is pre-filled (GDDL tracks rated levels only); the user can still enter their own
- Thumbnails best-effort via levelthumbs (covers significant unrated levels)
- Appear on the demon list with blank community tier fields
- A toggle on the demon list page hides unrated levels (rank numbers update for that view)
- Not reachable through the GD-server search escalation unless the face its player votes gave it is
  a demon one — the escalation asks GD for demons only, so anything else is added by its level ID
- Filtering by a demon tier hides them: an unrated level has no tier of its own

---

## Platformer Levels

The schema distinguishes them — `Level.levelType` is `CLASSIC` or `PLATFORMER`, and `LevelProgress.completionTime` exists for a platformer completion's time — but there is no platformer-specific logging UI. A platformer level can be logged with the same fields as a classic one. It is excluded from the demon list, which holds classic levels only, and the Log can filter by level type.

---

## Where Non-Completions Appear

| Surface         | Non-completion entries                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| The Log         | Shown. Every logged level is listed; the status filter narrows to completed, in progress, or dropped |
| The Level Page  | Shown. The timeline is always the full history                                                       |
| The Events feed | Shown. Every progress update is an entry                                                             |
| The demon list  | Not shown — only completions can be placed                                                           |
| The Ranking     | Not shown — it ranks completions by rating                                                           |
| Export          | Included, on the Progress and Dropped tabs                                                           |

---

## Level Data Sync

The level-cache sync (see `EXTERNAL_APIS.md` → "Level-Cache Sync") keeps the shared `levels` cache current with GD's servers, re-checking a slice of the cache every 6 hours. When a level's cached metadata (name, creator, difficulty, rating status, song) changes upstream, the sync overwrites the cache row **directly and silently** — there is no notification, no nudge, and no accept/dismiss step. A level GD no longer returns is flagged delisted, once that has been confirmed on a later pass, and frozen at its last-known values. Per-user progress data (including each event's difficulty snapshot) is never affected.
