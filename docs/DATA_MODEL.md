# InfernoLog — Data Model

## Core Principles

- **Level identity** is the in-game Level ID. Every GD API uses it as source of truth. Reuploads share the same in-game data and are treated as the same level.
- **Level metadata is a shared cached entity.** Autofill results are cached in the `levels` table and reused across all users who log the same level.
- **Snapshots over live data.** List tier/rank values are recorded at time of logging and never automatically updated.
- **Progress over completions.** The fundamental unit is a `ProgressUpdate`. A completion is a `ProgressUpdate` with `kind = COMPLETION`; a drop is one with `kind = DROP` (reusing `date`/`attempts`/`notes` rather than drop-specific fields). No artificial separation between "attempting," "completed," and "dropped" — they're all just events on one timeline.
- **Raw scores always stored.** Weighted rating averages are computed at query time from stored per-category scores.
- **Platformer and classic levels are parallel, independent systems.** Accommodated from day one via `level_type` enum.

---

## Entity Relationship Diagram

```
┌─────────────┐
│    users    │
└──────┬──────┘
       │
       ├──────────────────┬─────────────────┐
       │                  │                 │
┌──────▼──────┐   ┌───────▼──────┐  ┌──────▼──────┐
│level_progress│   │classic_ranking│  │ collections │
└──────┬──────┘   └───────────────┘  └──────┬──────┘
       │                                     │
       ├─────────────────┐          ┌────────▼────────┐
       │                 │          │collection_entries│
┌──────▼──────┐  ┌───────▼──────┐  └─────────────────┘
│progress_    │  │ levels       │
│updates      │  │ (shared cache)│
└──────┬──────┘  └──────────────┘
       │
       ├──────────────────┐
       │                  │
┌──────▼──────┐  ┌────────▼──────┐
│list_        │  │rating_scores  │
│references   │  └───────────────┘
└─────────────┘
```

---

## State Machine: Level Progress

```
                    ┌─────────────────┐
                    │   want_to_beat  │
                    │  (collections)  │
                    └────────┬────────┘
                             │ user logs first update
                             ▼
                    ┌─────────────────┐
              ┌────►│   in_progress   │◄────┐
              │     │  (no completion)│     │
              │     └────────┬────────┘     │
              │              │              │ picks back up
              │   marks      │ logs 100%    │
              │   dropped    │ + progress_update
              │   (progress_ ▼  kind=COMPLETION
              │   update     ┌─────────────────┐
              │   kind=DROP) │    completed    │
              │              └─────────────────┘
              │
              ▼
     ┌─────────────────┐
     │     dropped     ├───────────────────┐
     │ (status flag +  │                   │
     │ progress_update │◄──────────────────┘
     │  kind=DROP)      picks back up
     └─────────────────┘
```

**Entry points & transitions:**

- A `level_progress` row is created on the user's **first action** for that level. That first action can be a progress log (→ `in_progress`), a completion (→ `completed`), or a **drop** (→ `dropped` directly — "drop-from-scratch"; the row need not pass through `in_progress` first). Every one of these actions creates a `progress_update` row (`kind = PROGRESS | COMPLETION | DROP`) — there is no action that creates a `level_progress` row without one.
- `in_progress → dropped` when the user drops the level (creating a `kind = DROP` update). `dropped → in_progress` happens **automatically** when the user logs new progress on a dropped level (logging progress implies active play). A level can be dropped more than once (drop → resume → drop again) — each drop is its own `progress_update` row, so the full history survives even though `level_progress.status` only reflects the current state.
- `completed` is left untouched by further progress logs in v1 (rebeat is a future feature).

See `LOGGING_FLOW_RECONCILIATION.md` for the `dropped → in_progress` and drop-from-scratch decisions.

---

## Table Definitions

### `users`

| Column                       | Type      | Notes                                                                                                                                                                                                |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | UUID      | Internal primary key                                                                                                                                                                                 |
| `username`                   | VARCHAR   | Unique, public-facing                                                                                                                                                                                |
| `username_changed_at`        | TIMESTAMP | Enforces 30-day cooldown                                                                                                                                                                             |
| `previous_username`          | VARCHAR   | Held for 30 days, unavailable to others                                                                                                                                                              |
| `email`                      | VARCHAR   | From Cognito                                                                                                                                                                                         |
| `discord_id`                 | VARCHAR   | Nullable                                                                                                                                                                                             |
| `cognito_sub`                | VARCHAR   | Nullable. Cognito's `sub` claim — the federated-identity key, set once `signup/start` or the post-auth trigger's backfill runs                                                                       |
| `onboarding_completed`       | BOOLEAN   | Default false. Gates whether `_authenticated` routes to `/onboarding`                                                                                                                                |
| `legal_accepted_at`          | TIMESTAMP | Nullable. Stamped when the onboarding wizard's combined ToS/Privacy Policy checkbox is accepted                                                                                                      |
| `profile_public`             | BOOLEAN   | Default true                                                                                                                                                                                         |
| `discord_public`             | BOOLEAN   | Default true                                                                                                                                                                                         |
| `role`                       | ENUM      | `user`, `moderator`, `admin`                                                                                                                                                                         |
| `account_status`             | ENUM      | `active`, `suspended`, `banned`                                                                                                                                                                      |
| `suspension_until`           | TIMESTAMP | Nullable                                                                                                                                                                                             |
| `is_verified`                | BOOLEAN   | Default false                                                                                                                                                                                        |
| `gddl_api_key_encrypted`     | VARCHAR   | Encrypted at rest, never exposed to frontend                                                                                                                                                         |
| `rating_mode`                | ENUM      | `simple`, `weighted`. Default `simple`                                                                                                                                                               |
| `rating_display_scale`       | ENUM      | `zero_to_ten`, `zero_to_hundred`. Default `zero_to_ten`. Display-only — ratings/enjoyment are always stored as 0-100 integers regardless of this setting; the frontend converts at the display layer |
| `default_percentage_version` | ENUM      | `two_one`, `two_two`. Default `two_two`. Which GD version's percentage system (2.1 distance-based / 2.2 time-based) to pre-select when logging                                                       |
| `time_machine_top_n`         | INTEGER   | How many levels to track in Time Machine. Default 10                                                                                                                                                 |
| `date_format_preference`     | ENUM      | `mdy`, `dmy`, `ymd`, `iso`. Used for display and import                                                                                                                                              |
| `default_fps`                | INTEGER   | Nullable. Pre-fills the FPS field in the logging flow's Session Details                                                                                                                              |
| `created_at`                 | TIMESTAMP |                                                                                                                                                                                                      |

### `levels`

| Column                | Type      | Notes                                                                                                                                                                                          |
| --------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `in_game_id`          | VARCHAR   | Primary key                                                                                                                                                                                    |
| `level_type`          | ENUM      | `classic`, `platformer`                                                                                                                                                                        |
| `is_rated`            | BOOLEAN   |                                                                                                                                                                                                |
| `is_demon`            | BOOLEAN   | Default false. Whether GD classifies the level as a demon, cached from the GD servers' demon flag. Drives the non-demon soft gate (see `LOGGING_FLOW.md`)                                      |
| `name`                | VARCHAR   |                                                                                                                                                                                                |
| `creator`             | VARCHAR   |                                                                                                                                                                                                |
| `in_game_difficulty`  | VARCHAR   | The level's actual rated difficulty (e.g. "Insane Demon"), cached from the GD servers. **Read-only in the UI** — the per-user difficulty _opinion_ lives on `progress_updates`. See item below |
| `song_name`           | VARCHAR   | Newgrounds song name                                                                                                                                                                           |
| `song_author`         | VARCHAR   |                                                                                                                                                                                                |
| `is_nong`             | BOOLEAN   | Default false. User-set flag (v2)                                                                                                                                                              |
| `nong_song_title`     | VARCHAR   | Nullable. Intended song name (v2)                                                                                                                                                              |
| `nong_artist`         | VARCHAR   | Nullable. Intended artist (v2)                                                                                                                                                                 |
| `nong_source_url`     | VARCHAR   | Nullable. Link to SFH or source (v2)                                                                                                                                                           |
| `peak_music_bpm`      | INTEGER   | Nullable. Music BPM metadata (v2)                                                                                                                                                              |
| `data_source`         | ENUM      | `robtop_autofill`, `manual`. Provenance of the cached metadata (legacy rows may read `gdbrowser_autofill`)                                                                                     |
| `verified`            | BOOLEAN   | Default false for `manual` rows. A later sync can backfill and verify/override manually-entered metadata (including `in_game_difficulty`)                                                      |
| `last_checked_at`     | TIMESTAMP | Updated by the RobTop sync jobs on every level processed (found or not). See `EXTERNAL_APIS.md`                                                                                                |
| `rating_status_since` | TIMESTAMP | Nullable. Stamped whenever `is_rated` flips or `in_game_difficulty` changes value. Drives the weekly "volatile" sync's 14-day window                                                           |
| `delisted`            | BOOLEAN   | Default false. Set true when a sync finds the level gone from RobTop's servers; a delisted row is frozen at last-known values and excluded from both sync jobs                                 |
| `delisted_at`         | TIMESTAMP | Nullable. When the level was first detected as delisted                                                                                                                                        |
| `created_at`          | TIMESTAMP |                                                                                                                                                                                                |

### `level_progress`

One row per user per level. Created when the user logs their first progress update. Not created by adding to the Want to Beat collection.

| Column        | Type      | Notes                                                                                                                                                                                  |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID      |                                                                                                                                                                                        |
| `user_id`     | UUID      | FK → users                                                                                                                                                                             |
| `level_id`    | VARCHAR   | FK → levels.in_game_id                                                                                                                                                                 |
| `status`      | ENUM      | `in_progress`, `dropped`, `completed`. Derived from the latest `progress_updates` event, but stored (not computed at query time) so it can be filtered/indexed                         |
| `visibility`  | ENUM      | `public`, `private`. Per-entry privacy                                                                                                                                                 |
| `level_notes` | TEXT      | Nullable. "About this level overall" — distinct from per-completion `progress_updates.notes`. One value per user per level; survives edits or deletions of individual progress updates |
| `created_at`  | TIMESTAMP |                                                                                                                                                                                        |

### `progress_updates`

Every logged event for a level: a session log, a completion, or a drop. All fields optional except `level_progress_id`, `kind`, and `logged_at`. A completion is a progress update with `kind = COMPLETION`; a drop is one with `kind = DROP`. Drop reuses `date`/`attempts`/`notes` rather than drop-specific columns — a drop's reason is just its `notes` under a different label, its date is just its `date`, and so on. This is the same reasoning that already applies to `percentage`/`run_from`/`run_to` being shared between progress and completion rows: the columns describe _an event_, and `kind` says which kind of event it is.

| Column                        | Type      | Notes                                                                                                                                                                                                                                            |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                          | UUID      |                                                                                                                                                                                                                                                  |
| `level_progress_id`           | UUID      | FK → level_progress                                                                                                                                                                                                                              |
| `kind`                        | ENUM      | `progress`, `drop`, `completion`. Default `progress`. Declared in that order so a `kind DESC` sort puts a completion first regardless of `logged_at` — the query every "representative update" lookup uses                                       |
| `percentage`                  | DECIMAL   | Nullable. Classic levels only (0-100). Progress path only — omitted on completions (100% implied) and drops                                                                                                                                      |
| `run_from`                    | INTEGER   | Nullable. Start of best run (0-100). Populated only on progress entries in "From a run" mode — never on completions                                                                                                                              |
| `run_to`                      | INTEGER   | Nullable. End of best run (0-100). Populated only on progress entries in "From a run" mode — never on completions                                                                                                                                |
| `completion_time`             | INTERVAL  | Nullable. Platformer levels only (v2)                                                                                                                                                                                                            |
| `attempts`                    | INTEGER   | Nullable. Cumulative at time of update                                                                                                                                                                                                           |
| `date`                        | DATE      | Nullable                                                                                                                                                                                                                                         |
| `date_uncertain`              | BOOLEAN   | Default false                                                                                                                                                                                                                                    |
| `on_stream`                   | BOOLEAN   | Default false                                                                                                                                                                                                                                    |
| `fps`                         | INTEGER   | Nullable                                                                                                                                                                                                                                         |
| `peak_heart_rate_bpm`         | INTEGER   | Nullable (v2)                                                                                                                                                                                                                                    |
| `enjoyment`                   | DECIMAL   | Nullable. 0-10                                                                                                                                                                                                                                   |
| `simple_rating`               | DECIMAL   | Nullable. 0-10. Used when user is in simple rating mode                                                                                                                                                                                          |
| `difficulty_opinion`          | ENUM      | Nullable. The user's subjective read: `not_demon_worthy`, `easy`, `medium`, `hard`, `insane`, `extreme`. The only difficulty field the user edits                                                                                                |
| `in_game_difficulty_snapshot` | VARCHAR   | Nullable. Optional historical snapshot of the level's cached `in_game_difficulty` at time of beat. Populated **automatically from the `levels` cache** — never user-edited                                                                       |
| `notes`                       | TEXT      | Nullable                                                                                                                                                                                                                                         |
| `video_url`                   | VARCHAR   | Nullable. Completion video. The Level Page hero embeds this; unambiguous in v1 (one completion per level). In v3, rebeat introduces multiple completions each with their own video — "which video is the hero" is deferred to the rebeat design. |
| `highlight_url`               | VARCHAR   | Nullable. Highlight reel, independent of on_stream                                                                                                                                                                                               |
| `logged_at`                   | TIMESTAMP |                                                                                                                                                                                                                                                  |

**Rules:**

- Only one `progress_update` per `level_progress` may have `kind = COMPLETION`. `kind = DROP` may repeat — a level can be dropped, resumed, and dropped again, and each drop keeps its own row (not overwritten)
- `percentage` only applies to classic levels. Omitted for platformer
- `completion_time` only applies to platformer levels (v2)
- Non-completion, non-drop entries are hidden throughout the UI unless the "show non-completions" toggle is active
- Rebeat handling (multiple completions per level) is a v3 feature
- **Two difficulty concepts, never conflated.** The level's _actual rating_ (`levels.in_game_difficulty`) is cached and read-only; the per-user `difficulty_opinion` here is the only difficulty the user edits. Surfacing the two side by side lets the user state where they disagree. A `not_demon_worthy` opinion is a **disagreement flag only** — the level stays in the difficulty ranking (it is still a rated demon). This is distinct from the non-demon **soft gate** (see `LOGGING_FLOW.md`), which fires when the GD servers report the level isn't a demon at all

### `list_references`

Attached to a `progress_update`. Typically attached to the completion update but can be attached to any update.

| Column               | Type      | Notes                                                                                                                              |
| -------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | UUID      |                                                                                                                                    |
| `progress_update_id` | UUID      | FK → progress_updates                                                                                                              |
| `list_source`        | ENUM      | `gddl`, `aredl`, `nlw`, `other`. (Pointercrate cut from v1 — see `LIST_INTEGRATIONS.md`.) `aredl` rendered only for extreme demons |
| `tier_or_rank`       | VARCHAR   | Raw value                                                                                                                          |
| `at_time_of_logging` | BOOLEAN   | Whether this was the value when logged                                                                                             |
| `added_at`           | TIMESTAMP |                                                                                                                                    |

### `rating_scores`

| Column               | Type    | Notes                  |
| -------------------- | ------- | ---------------------- |
| `id`                 | UUID    |                        |
| `progress_update_id` | UUID    | FK → progress_updates  |
| `category_id`        | UUID    | FK → rating_categories |
| `score`              | DECIMAL | 0-10                   |

### `rating_categories`

| Column              | Type    | Notes                                 |
| ------------------- | ------- | ------------------------------------- |
| `id`                | UUID    |                                       |
| `user_id`           | UUID    | FK → users                            |
| `name`              | VARCHAR | e.g. "Gameplay", "Decoration", "Song" |
| `weight`            | DECIMAL | Used in weighted average              |
| `include_enjoyment` | BOOLEAN | Default false                         |
| `sort_order`        | INTEGER |                                       |

### `classic_ranking`

| Column              | Type    | Notes                                        |
| ------------------- | ------- | -------------------------------------------- |
| `id`                | UUID    |                                              |
| `user_id`           | UUID    | FK → users                                   |
| `level_progress_id` | UUID    | FK → level_progress where status = completed |
| `ranking_index`     | DECIMAL | Fractional index                             |

Only entries where the associated `level_progress` has a completion update appear here. Must have at least one list reference assigned to appear in the Time Machine.

Placement is fully manual — nothing auto-places a completion or assumes a default position (fractional `ranking_index` is set when the user places the level). A completion with **no `classic_ranking` row is simply "unplaced"** (the user chose "Place later"); no schema change is needed to represent this.

### `collections`

User-owned groupings of levels: the three built-ins (Want to Beat, Favorites, Least Favorites) plus unlimited custom named collections. Distinct from `list_references`, which point at external community difficulty lists.

| Column        | Type      | Notes                                                    |
| ------------- | --------- | -------------------------------------------------------- |
| `id`          | UUID      |                                                          |
| `user_id`     | UUID      | FK → users                                               |
| `name`        | VARCHAR   |                                                          |
| `type`        | ENUM      | `want_to_beat`, `favorites`, `least_favorites`, `custom` |
| `description` | TEXT      | Nullable                                                 |
| `created_at`  | TIMESTAMP |                                                          |

Built-ins are created at signup, cannot be renamed or deleted, and their names are reserved (case-insensitively) for custom collections. Want to Beat only holds levels without a completion: adding a completed level is rejected, and logging a completion auto-removes the level from Want to Beat inside the same transaction (all completion write paths: logging, spreadsheet import, GDDL sync).

### `collection_entries`

| Column          | Type      | Notes                                              |
| --------------- | --------- | -------------------------------------------------- |
| `id`            | UUID      |                                                    |
| `collection_id` | UUID      | FK → collections                                   |
| `level_id`      | VARCHAR   | FK → levels.in_game_id                             |
| `ranking_index` | DECIMAL   | Fractional index (same pattern as classic_ranking) |
| `added_at`      | TIMESTAMP |                                                    |

Entries are displayed by `ranking_index` ascending. Reorders bisect the gap between the two neighbours; when a gap shrinks past 0.0001 the collection is renormalised to integers — the same fractional-indexing scheme as `classic_ranking`.

Adding a level to the Want to Beat collection does **not** create a `level_progress` entry. That only happens when the first progress update is logged.

### `api_keys` _(v3)_

Not built in v1 or v2. Introduced in v3 to coincide with the Geode mod.

| Column         | Type      | Notes                     |
| -------------- | --------- | ------------------------- |
| `id`           | UUID      |                           |
| `user_id`      | UUID      | FK → users                |
| `name`         | VARCHAR   | e.g. "Geode Mod"          |
| `key_hash`     | VARCHAR   | Never stored in plaintext |
| `scopes`       | VARCHAR[] |                           |
| `created_at`   | TIMESTAMP |                           |
| `last_used_at` | TIMESTAMP | Nullable                  |
| `revoked_at`   | TIMESTAMP | Nullable                  |

Max 5 per user.

### `reports`

| Column                  | Type      | Notes                              |
| ----------------------- | --------- | ---------------------------------- |
| `id`                    | UUID      |                                    |
| `reporter_id`           | UUID      | FK → users                         |
| `reported_user_id`      | UUID      | FK → users                         |
| `reason`                | TEXT      |                                    |
| `status`                | ENUM      | `pending`, `dismissed`, `actioned` |
| `assigned_moderator_id` | UUID      | Never equals reported_user_id      |
| `created_at`            | TIMESTAMP |                                    |

### `ban_appeals`

| Column        | Type      | Notes                           |
| ------------- | --------- | ------------------------------- |
| `id`          | UUID      |                                 |
| `user_id`     | UUID      | FK → users                      |
| `appeal_text` | TEXT      |                                 |
| `status`      | ENUM      | `pending`, `approved`, `denied` |
| `reviewed_by` | UUID      | Nullable FK → users             |
| `created_at`  | TIMESTAMP |                                 |

One appeal per ban enforced at application level.

### `moderation_actions`

| Column           | Type      | Notes                                                   |
| ---------------- | --------- | ------------------------------------------------------- |
| `id`             | UUID      |                                                         |
| `moderator_id`   | UUID      | FK → users                                              |
| `target_user_id` | UUID      | FK → users                                              |
| `action`         | ENUM      | `warn`, `suspend`, `ban`, `unban`, `verify`, `unverify` |
| `reason`         | TEXT      |                                                         |
| `duration_hours` | INTEGER   | Nullable                                                |
| `created_at`     | TIMESTAMP |                                                         |

---

## Level Page — Runs Graph

The Level Page (`/list/{levelId}`) shows a "Runs over time" chart: one horizontal bar per progress entry, ordered oldest→newest, each spanning `[from, to]` as a percentage of the level. This is computed server-side by `computeRunsGraph` in `apps/api/src/utils/runsGraph.ts`.

### Bar kinds

| Kind         | `from`    | `to`         |
| ------------ | --------- | ------------ |
| `from_zero`  | `0`       | `percentage` |
| `from_run`   | `runFrom` | `runTo`      |
| `completion` | `0`       | `100`        |

Ordering uses each entry's effective date: the explicitly logged `date`, falling back to `logged_at`.

### Drop-merge rule

A drop is a `progress_update` (`kind = DROP`), but unlike a completion or progress log it doesn't get a bar of its own by default — it has no run range to draw. To represent "the level was dropped after this run," the rule marks an existing bar or emits a synthetic one:

- **If** the drop's level has a `worst_fail` percentage that **differs** from the most recent prior progress entry's `to` value: emit a **synthetic bar** at `[0, worstFail]` with `kind=from_zero` and `droppedAfter=true`. The `progressUpdateId` on the synthetic bar is `null`.
- **Otherwise** (no `worst_fail`, or it equals the prior entry's `to`): set `droppedAfter=true` on that most recent prior progress entry. No synthetic bar is emitted. This is the common case.

The frontend colors any bar with `droppedAfter=true` red. A level may have multiple drops across its history (drop → pick back up → drop again) — each is its own `progress_update` row, so the full date/attempts/notes history survives regardless of current status. `worst_fail` is a rolling `level_progress`-level value rather than per-drop (the logging UI asks for it once and remembers it, via the "already logged" checkbox), so it's only ever attributed to the CURRENT drop (the level's most recent update, while status is not `completed`) — older drops in the same history still get the plain `droppedAfter` flag, just without a synthetic worst-fail bar. `computeRunsGraph` handles this generally.

---

## Fractional Indexing

Personal ranking positions use floating-point decimal values rather than integers, allowing insertion and reordering without updating every row.

```
Initial state:    1.0  —  2.0  —  3.0  —  4.0
Insert between 2 and 3:   →  2.5
Insert between 2 and 2.5: →  2.25
Gap < 0.0001:  rebalancing job renormalizes to integers
```

Classic and platformer rankings are completely independent tables with independent indexes.

---

## Privacy Model Summary

```
Profile public/private (global override)
         │
         └── Per-entry visibility (public/private)
                  │
                  ├── level_progress entries
                  ├── progress_updates
                  └── collections entries
```

A private profile forces all entries private regardless of per-entry setting. A public profile respects per-entry settings. This allows e.g. a YouTuber to hide a specific completion until their video goes live while keeping their profile public.

---

## Deletion Behavior

| Action                 | Effect                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Delete progress update | Removes update and associated list_references, rating_scores                           |
| Delete level_progress  | Removes entry, all updates, and classic_ranking entry. Gap in ranking closes naturally |
| Suspend account        | All content hidden for suspension duration                                             |
| Ban account            | All content permanently deleted. Username held, cannot be claimed                      |

**GDDL limitation:** GDDL records cannot be deleted via API. Users are warned in the delete confirmation modal to manage GDDL records directly on the GDDL platform.
