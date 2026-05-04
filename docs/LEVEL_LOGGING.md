# InfernoLog — Level Logging

## Core Concept: Progress Entries

InfernoLog does not separate "completions" from "attempts." Every interaction with a level is a **progress update** on a **level progress entry**. A completion is simply a progress update the user explicitly marks as `is_completion = true`.

```
LevelProgress (one per user per level)
 └── ProgressUpdate[]
      ├── 8%  logged casually
      ├── 44% with run range 44-87
      ├── 76% on stream, notes about the attempt
      └── 100% is_completion = true ← appears in ranking + stats
```

This mirrors how the GDDL handles progress — players can log ratings and progress on levels they haven't beaten. Non-completion entries are hidden throughout the UI by default, revealed only when the user enables the "show non-completions" toggle.

---

## Autofill Flow

When a user enters a level ID, the following fires automatically:

```
User enters Level ID
        │
        ▼
  GDBrowser API ──────────────────► name, creator, song, length
        │
        ▼
  Is level rated?
    ├── Yes → GDDL API ────────────► suggested GDDL tier
    └── No  → skip GDDL
        │
        ▼
  levelthumbs.prevter.me ─────────► thumbnail (best-effort, silent fallback)
```

**Fallback:** If GDBrowser is unavailable, the user proceeds with manual entry. The logging flow is never blocked by API unavailability.

---

## Progress Update Fields

All fields are optional except the level ID. The user logs whatever is relevant to them at that moment.

| Field | Type | Notes |
|---|---|---|
| Level ID | Required | Triggers autofill on entry |
| Percentage | Decimal 0-100 | Classic only. Omitted for platformer |
| Run range | e.g. 44-87 | Start and end of best run (1-100 each) |
| Completion time | Duration | Platformer only (v2) |
| Date | Date | Checkbox to flag as uncertain |
| Attempts | Integer | Cumulative. See convention below |
| On stream | Boolean | Was this session streamed live |
| FPS | Integer | e.g. 60, 120, 240 |
| Peak heart rate | Integer | BPM from heart rate monitor (v2) |
| Enjoyment | Decimal 0-10 | |
| Rating | Simple 0-10 or per-category scores | Depends on user's rating mode |
| In-game difficulty | Text | Snapshot e.g. "Insane Demon at time of beat" |
| List references | Per-list tier/rank | GDDL tier, Pointercrate rank, etc. |
| GDDL record accepted | Boolean | Manual flag (v1). Other lists v2+ |
| Notes | Text | Freeform. Venting encouraged, see Community Policy |
| Completion video URL | URL | |
| Highlight video URL | URL | Independent of On Stream |
| Is completion | Boolean | User explicitly marks this as their beat |

### Attempt Count Convention

Attempts represent **cumulative attempts across all uploads and copies of the level**, not just the current upload. This is an honor-system convention the app cannot enforce. It is documented in the UI tooltip on the attempts field. Two-digit years are interpreted as 2000s given GD's 2013 release.

### Worst Fail vs. Percentage

In InfernoLog, percentage is used for both progress logging and worst fail tracking. The user's highest non-100% logged percentage serves as their worst fail record. No separate "worst fail" field is needed — it emerges naturally from the progress history.

### Run Range Format

Run range represents the start and end percentage of the player's best run, e.g. `44-87` meaning they started at 44% and reached 87%. Both values are integers between 1 and 100.

---

## Logging Flow

```
┌─────────────────────────────────────────────┐
│           Log Progress Update               │
│                                             │
│  1. Enter level ID → autofill fires         │
│  2. Fill in any desired fields              │
│  3. Is this your completion?                │
│     ├── Yes → mark is_completion = true     │
│     │         unlock ranking placement      │
│     └── No  → proceed to submit            │
│  4. [If completion] Place in ranking?       │
│     ├── Yes → open placement modal          │
│     └── No  → auto-placement used          │
│  5. Submit                                  │
└─────────────────────────────────────────────┘
```

---

## Completion-Specific Behavior

When `is_completion = true`:

- The `level_progress.status` is updated to `completed`
- The entry becomes eligible for the personal difficulty ranking
- Top 5 tracking snapshot is evaluated
- The GDDL record submission option appears (if API key configured)
- The ranking placement modal becomes available

**One completion per level per user in v1.** Rebeat handling is a v3 feature. If a user attempts to mark a second update as `is_completion` for the same level, they are warned and asked to confirm, which will replace the existing completion designation.

---

## Dropped Levels

A dropped level is a `level_progress` entry with `status = dropped`. It is not a separate entity — the full progress history is preserved.

```
level_progress.status transitions:
  in_progress → dropped     (user marks as dropped)
  dropped → in_progress     (user picks it back up)
  in_progress → completed   (user logs completion)
  dropped → completed       (user beats it after dropping)
```

When a dropped level is eventually beaten, the completion is logged as a normal progress update on the existing `level_progress` entry. The drop history remains intact as part of the progress timeline.

Additional drop-specific fields on `level_progress`:
- `dropped_reason` — freeform text
- `dropped_at` — date

---

## In-Progress Levels

In-progress levels are `level_progress` entries with `status = in_progress` and no `is_completion` update. They appear in a dedicated "Currently Attempting" section of the user's profile.

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
  - Log view
  - Ranking view
  - Stats
  - Export (user chooses at export time)
  - API responses
```

Non-completion entries, even if they carry enjoyment scores or ratings, are never surfaced in community averages (v4) unless `is_completion = true`. This mirrors GDDL's approach.

---

## Level Data Update Nudges

The monthly sync job (see `EXTERNAL_APIS.md`) detects changes to cached level metadata. Users with a progress entry for an affected level receive:

1. A one-time in-app notification
2. A visual indicator on the affected entry

The user can view old vs. new values and accept or dismiss the update. Nudge-worthy changes: name, creator, song name, song author.
