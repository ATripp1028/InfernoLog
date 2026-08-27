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
      └── 100%                               (kind = completion) ← appears in ranking + stats
```

This mirrors how the GDDL handles progress — players can log ratings and progress on levels they haven't beaten. Non-completion entries are hidden throughout the UI by default, revealed only when the user enables the "show non-completions" toggle (except for on the individual level page, where they are shown without the option to toggle them off).

---

## Autofill Flow

When a user enters a level ID, the following fires automatically:

```
User enters Level ID
        │
        ▼
  GD servers API ─────────────────► name, creator, song, length
        │
        ▼
  Is level rated?
    ├── Yes → GDDL API ────────────► suggested GDDL tier
    └── No  → skip GDDL
        │
        ▼
  levelthumbs.prevter.me ─────────► thumbnail (best-effort, silent fallback)
```

**Fallback:** If the GD servers are unavailable, the user proceeds with manual entry. The logging flow is never blocked by API unavailability.

---

## Progress Update Fields

All fields are optional except the level ID. The user logs whatever is relevant to them at that moment.

| Field                | Type                               | Notes                                                                                                                                                                    |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Level ID             | Required                           | Triggers autofill on entry                                                                                                                                               |
| Percentage           | Decimal 0-100                      | Progress path only (Best progress). Classic only. **Omitted on completions** (100% implied)                                                                              |
| Run range            | e.g. 30-63                         | Progress path only, "From a run" mode. Start and end of best run (0-100 each). **Not used on completions** (always 0→100)                                                |
| Completion time      | Duration                           | Platformer only (v2)                                                                                                                                                     |
| Date                 | Date                               | Checkbox to flag as uncertain                                                                                                                                            |
| Attempts             | Integer                            | Cumulative. See convention below                                                                                                                                         |
| On stream            | Boolean                            | Was this session streamed live                                                                                                                                           |
| FPS                  | Integer                            | e.g. 60, 120, 240. Pre-filled from the user's default FPS preference                                                                                                     |
| Peak heart rate      | Integer                            | BPM from heart rate monitor (v2)                                                                                                                                         |
| Enjoyment            | Decimal 0-10                       |                                                                                                                                                                          |
| Rating               | Simple 0-10 or per-category scores | Depends on user's rating mode                                                                                                                                            |
| In-game difficulty   | Cached, read-only                  | The level's actual rating, cached on `levels` from the GD servers (e.g. "Insane Demon"). Displayed, never user-edited. See `LOGGING_FLOW.md` → "Two Difficulty Concepts" |
| Difficulty opinion   | Pill selector                      | Per-completion. The user's subjective read: Not demon-worthy / Easy / Medium / Hard / Insane / Extreme. The only difficulty field the user edits                         |
| List references      | Per-list tier/rank                 | GDDL tier, AREDL rank (extreme demons only), NLW tier                                                                                                                    |
| Notes                | Text                               | Freeform. Venting encouraged, see Community Policy                                                                                                                       |
| Completion video URL | URL                                |                                                                                                                                                                          |
| Highlight video URL  | URL                                | Independent of On Stream                                                                                                                                                 |
| Kind                 | progress / drop / completion       | Set by which FAB path was chosen — never a user-facing toggle mid-form                                                                                                   |

### Attempt Count Convention

Attempts represent **cumulative attempts across all uploads and copies of the level**, not just the current upload. This is an honor-system convention the app cannot enforce. It is documented in the UI tooltip on the attempts field. Two-digit years are interpreted as 2000s given GD's 2013 release.

### Worst Fail vs. Percentage

In InfernoLog, percentage is used for both progress logging and worst fail tracking. The user's highest non-100% logged percentage serves as their worst fail record. No separate "worst fail" field is needed — it emerges naturally from the progress history.

### Run Range Format

Run range represents the start and end percentage of the player's best run, e.g. `30-63` meaning they started at 30% and reached 63%. Both values are integers between **0 and 100** (a run from the start of the level is **0%**, not 1%).

Run range applies **only to the progress path**, and only in "From a run" mode. A completion is by definition a 0→100 run, so it has **no run-range fields** — there is nothing to log. See `LOGGING_FLOW.md` for the progress path's "From 0%" / "From a run" segmented control.

---

## Logging Flow

The logging flow is a FAB-triggered, multi-step modal. **The path — log a completion, log progress, or drop a level — is chosen at the FAB before the modal opens**, so each path is a purpose-built form rather than one generic form with a mid-flow completion toggle. There is **no mid-form "Is this your completion?" decision** and **no auto-placement**: every completion starts unplaced and is placed manually, prompted _after_ submit.

See **`LOGGING_FLOW.md`** for the full specification (entry point, modal shape, the three paths, field reference, and post-submit ranking placement). It supersedes this section.

---

## Completion-Specific Behavior

When `kind = completion`:

- The `level_progress.status` is updated to `completed`
- The entry becomes eligible for the personal difficulty ranking (placed manually — see `DEMON_LIST.md`)
- Top 5 tracking snapshot is evaluated
- The GDDL record submission option appears (if API key configured)
- The post-submit "Place in ranking now?" prompt is offered

**One completion per level per user in v1, and it is edit-not-replace.** Rebeat handling is a v3 feature. Choosing "Log a completion" for a level that already has a completion **routes the user to edit the existing completion** rather than creating or overwriting a second one. There is no replace path in v1.

---

## Dropped Levels

A dropped level is a `level_progress` entry with `status = dropped`, and the drop itself is a `progress_update` with `kind = drop`. It is not a separate entity — the full progress history is preserved.

```
level_progress.status transitions:
  (none) → dropped          (drop-from-scratch — dropping a never-logged level)
  in_progress → dropped     (user marks as dropped)
  dropped → in_progress     (automatic when the user logs new progress)
  in_progress → completed   (user logs completion)
  dropped → completed       (user beats it after dropping)
```

A level can be dropped without ever having been logged ("drop-from-scratch"): the
`level_progress` row is created directly at `status = dropped`, with no prior
`in_progress` row. Conversely, logging a progress update on a dropped level
**automatically** flips it back to `in_progress` — see `LOGGING_FLOW_RECONCILIATION.md`.

When a dropped level is eventually beaten, the completion is logged as a normal progress update on the existing `level_progress` entry. The drop history remains intact as its own `progress_update` row(s) — not merged into or overwritten by the completion.

The drop screen collects date, attempts, and a reason — stored on the `kind = drop` row using the same `date`/`attempts`/`notes` columns every other progress update uses, not drop-specific fields. A level can be dropped more than once (drop → resume → drop again); each drop is its own row, so earlier drops' reasons and dates aren't lost when a later one is logged.

---

## In-Progress Levels

In-progress levels are `level_progress` entries with `status = in_progress` and no `kind = completion` update. They appear in a dedicated "Currently Attempting" section of the user's profile.

- Up to **10 simultaneous in-progress levels** (soft cap, subject to revision)
- Progress is a manually updated snapshot — the user logs updates whenever they have something worth recording
- Per-entry privacy — each in-progress entry can be set public or private independently

**Motivating example for per-entry privacy:** A well-known player may want to hide a completion entry until their video goes live (e.g. KrMaL verifying Low Death in mid-March but holding the video until April 1st). Per-entry privacy supports this without requiring the entire profile to go private.

---

## Unrated Levels

Fully supported with the same fields as rated levels, with these differences:

- GDDL autofill skipped (GDDL tracks rated levels only)
- List references entered manually
- Thumbnails best-effort via levelthumbs (covers significant unrated levels)
- Skill tags unavailable until v4
- Appear in personal ranking with blank official tier fields
- Toggle on ranking page to hide unrated levels (ranking numbers update for that view)

---

## Platformer Levels

Tracked in a separate log and ranking. Classic and platformer are entirely independent systems. Platformer-specific details are a v2 design concern. Known v2 differences:

- **Percentage omitted** — not meaningful for platformer
- **Completion time added** — the platformer equivalent of worst fail / progress percentage
- **Separate ranking page** — `/[username]/ranking/platformer`
- **Different list references** — Pemonlist and others TBD
- **Attempt count** — applicability TBD in v2

Schema accommodates platformer from day one via `level_type: ENUM (classic, platformer)` on the `levels` table.

---

## Non-Completion Entries: Visibility Rules

```
Toggle OFF (default)          Toggle ON
─────────────────────         ─────────────────────
Completion entries only       All progress updates shown
                              Non-completions visually
                              distinguished (badge/tint)

Applies to:
  - The Log
  - The Ranking view
  - Stats
  - Export (user chooses at export time)
  - API responses for list/ranking endpoints

Does NOT apply to:
  - The Level Page timeline — the Level Page always shows the
    full history unconditionally. The per-entry privacy
    (level_progress.visibility) is still enforced independently.
```

Non-completion entries, even if they carry enjoyment scores or ratings, are never surfaced in community averages (v4) unless `kind = completion`. This mirrors GDDL's approach.

---

## Level Data Sync

The RobTop sync jobs (see `EXTERNAL_APIS.md`) keep the shared `levels` cache current with GD's servers on two cadences (weekly volatile + monthly standard). When a level's cached metadata (name, creator, difficulty, rating status, song) changes upstream, the sync overwrites the cache row **directly and silently** — there is no notification, no nudge, and no accept/dismiss step. A level RobTop no longer returns is flagged `delisted` and frozen at its last-known values. Per-user progress data (including each completion's difficulty snapshot) is never affected.
