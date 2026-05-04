# InfernoLog — Data Model

## Core Principles

- **Level identity** is the in-game Level ID. Every GD API uses it as source of truth. Reuploads share the same in-game data and are treated as the same level.
- **Level metadata is a shared cached entity.** Autofill results are cached in the `levels` table and reused across all users who log the same level.
- **Snapshots over live data.** List tier/rank values are recorded at time of logging and never automatically updated.
- **Progress over completions.** The fundamental unit is a `ProgressUpdate`. A completion is a `ProgressUpdate` with `is_completion = true`. No artificial separation between "attempting" and "completed."
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
│level_progress│   │classic_ranking│  │ user_lists  │
└──────┬──────┘   └───────────────┘  └──────┬──────┘
       │                                     │
       ├─────────────────┐          ┌────────▼────────┐
       │                 │          │level_list_entries│
┌──────▼──────┐  ┌───────▼──────┐  └─────────────────┘
│progress_    │  │ levels       │
│updates      │  │ (shared cache)│
└──────┬──────┘  └──────────────┘
       │
       ├──────────────────┬──────────────────┐
       │                  │                  │
┌──────▼──────┐  ┌────────▼──────┐  ┌───────▼──────┐
│list_        │  │rating_scores  │  │record_       │
│references   │  └───────────────┘  │acceptances   │
└─────────────┘                     └──────────────┘
```

---

## State Machine: Level Progress

```
                    ┌─────────────────┐
                    │   want_to_beat  │
                    │   (user_lists)  │
                    └────────┬────────┘
                             │ user logs first update
                             ▼
                    ┌─────────────────┐
              ┌────►│   in_progress   │◄────┐
              │     │  (no completion)│     │
              │     └────────┬────────┘     │
              │              │              │ picks back up
              │   marks      │ logs 100%    │
              │   dropped    │ + is_completion
              │              ▼              │
              │     ┌─────────────────┐     │
              │     │    completed    │     │
              │     │ (is_completion  │     │
              │     │   = true)       │     │
              │     └─────────────────┘     │
              │                             │
              ▼                             │
     ┌─────────────────┐                   │
     │     dropped     ├───────────────────┘
     │  (status flag)  │
     └─────────────────┘
```

---

## Table Definitions

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Internal primary key |
| `username` | VARCHAR | Unique, public-facing |
| `username_changed_at` | TIMESTAMP | Enforces 30-day cooldown |
| `previous_username` | VARCHAR | Held for 30 days, unavailable to others |
| `email` | VARCHAR | From Cognito |
| `discord_id` | VARCHAR | Nullable |
| `google_id` | VARCHAR | Nullable |
| `profile_public` | BOOLEAN | Default true |
| `discord_public` | BOOLEAN | Default true |
| `role` | ENUM | `user`, `moderator`, `admin` |
| `account_status` | ENUM | `active`, `suspended`, `banned` |
| `suspension_until` | TIMESTAMP | Nullable |
| `is_verified` | BOOLEAN | Default false |
| `gddl_api_key_encrypted` | VARCHAR | Encrypted at rest, never exposed to frontend |
| `rating_mode` | ENUM | `simple`, `weighted`. Default `simple` |
| `list_priority_order` | VARCHAR[] | User-configured list priority chain |
| `time_machine_top_n` | INTEGER | How many levels to track in Time Machine. Default 10 |
| `date_format_preference` | ENUM | `mdy`, `dmy`, `ymd`. Used for display and import |
| `created_at` | TIMESTAMP | |

### `levels`

| Column | Type | Notes |
|---|---|---|
| `in_game_id` | VARCHAR | Primary key |
| `level_type` | ENUM | `classic`, `platformer` |
| `is_rated` | BOOLEAN | |
| `name` | VARCHAR | |
| `creator` | VARCHAR | |
| `song_name` | VARCHAR | Newgrounds song name |
| `song_author` | VARCHAR | |
| `is_nong` | BOOLEAN | Default false. User-set flag (v2) |
| `nong_song_title` | VARCHAR | Nullable. Intended song name (v2) |
| `nong_artist` | VARCHAR | Nullable. Intended artist (v2) |
| `nong_source_url` | VARCHAR | Nullable. Link to SFH or source (v2) |
| `peak_music_bpm` | INTEGER | Nullable. Music BPM metadata (v2) |
| `data_source` | ENUM | `gdbrowser_autofill`, `manual` |
| `last_checked_at` | TIMESTAMP | For monthly sync job |
| `has_pending_update` | BOOLEAN | Set true by sync job |
| `pending_name` | VARCHAR | Nullable |
| `pending_creator` | VARCHAR | Nullable |
| `pending_song_name` | VARCHAR | Nullable |
| `pending_song_author` | VARCHAR | Nullable |
| `created_at` | TIMESTAMP | |

### `level_progress`

One row per user per level. Created when the user logs their first progress update. Not created by adding to want-to-beat list.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | UUID | FK → users |
| `level_id` | VARCHAR | FK → levels.in_game_id |
| `status` | ENUM | `in_progress`, `dropped`, `completed` |
| `dropped_reason` | TEXT | Nullable. Why dropped |
| `dropped_at` | DATE | Nullable |
| `visibility` | ENUM | `public`, `private`. Per-entry privacy |
| `created_at` | TIMESTAMP | |

### `progress_updates`

Every logged data point for a level. All fields optional except `level_progress_id` and `logged_at`. A completion is a progress update with `is_completion = true`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `level_progress_id` | UUID | FK → level_progress |
| `is_completion` | BOOLEAN | Default false. User explicitly marks this as their completion |
| `percentage` | DECIMAL | Nullable. Classic levels only (0-100) |
| `run_from` | INTEGER | Nullable. Start of best run (1-100) |
| `run_to` | INTEGER | Nullable. End of best run (1-100) |
| `completion_time` | INTERVAL | Nullable. Platformer levels only (v2) |
| `attempts` | INTEGER | Nullable. Cumulative at time of update |
| `date` | DATE | Nullable |
| `date_uncertain` | BOOLEAN | Default false |
| `on_stream` | BOOLEAN | Default false |
| `fps` | INTEGER | Nullable |
| `peak_heart_rate_bpm` | INTEGER | Nullable (v2) |
| `enjoyment` | DECIMAL | Nullable. 0-10 |
| `simple_rating` | DECIMAL | Nullable. 0-10. Used when user is in simple rating mode |
| `in_game_difficulty` | VARCHAR | Nullable. Snapshot e.g. "Insane Demon" |
| `notes` | TEXT | Nullable |
| `video_url` | VARCHAR | Nullable. Completion video |
| `highlight_url` | VARCHAR | Nullable. Highlight reel, independent of on_stream |
| `logged_at` | TIMESTAMP | |

**Rules:**
- Only one `progress_update` per `level_progress` may have `is_completion = true`
- `percentage` only applies to classic levels. Omitted for platformer
- `completion_time` only applies to platformer levels (v2)
- Non-completion entries are hidden throughout the UI unless the "show non-completions" toggle is active
- Rebeat handling (multiple completions per level) is a v3 feature

### `list_references`

Attached to a `progress_update`. Typically attached to the completion update but can be attached to any update.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `progress_update_id` | UUID | FK → progress_updates |
| `list_source` | ENUM | `gddl`, `pointercrate`, `aredl`, `nlw`, `other` |
| `tier_or_rank` | VARCHAR | Raw value |
| `at_time_of_logging` | BOOLEAN | Whether this was the value when logged |
| `added_at` | TIMESTAMP | |

### `record_acceptances`

Tracks whether a completion has an accepted record on each applicable ranking authority.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `progress_update_id` | UUID | FK → progress_updates where is_completion = true |
| `list_source` | ENUM | `gddl`, `pointercrate`, `aredl`, etc. |
| `is_accepted` | BOOLEAN | Manually set by user |
| `accepted_at` | TIMESTAMP | Nullable |

GDDL acceptance is v1. Other list authorities follow their respective integration phases.

### `rating_scores`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `progress_update_id` | UUID | FK → progress_updates |
| `category_id` | UUID | FK → rating_categories |
| `score` | DECIMAL | 0-10 |

### `rating_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | UUID | FK → users |
| `name` | VARCHAR | e.g. "Gameplay", "Decoration", "Song" |
| `weight` | DECIMAL | Used in weighted average |
| `include_enjoyment` | BOOLEAN | Default false |
| `sort_order` | INTEGER | |

### `classic_ranking`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | UUID | FK → users |
| `level_progress_id` | UUID | FK → level_progress where status = completed |
| `ranking_index` | DECIMAL | Fractional index |

Only entries where the associated `level_progress` has a completion update appear here. Must have at least one list reference assigned to appear in the Time Machine.

### `user_lists`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | UUID | FK → users |
| `name` | VARCHAR | |
| `type` | ENUM | `want_to_beat`, `favorites`, `least_favorites`, `custom` |
| `description` | TEXT | Nullable |
| `created_at` | TIMESTAMP | |

### `level_list_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `list_id` | UUID | FK → user_lists |
| `level_id` | VARCHAR | FK → levels.in_game_id |
| `position` | INTEGER | |
| `added_at` | TIMESTAMP | |

Adding a level to the want-to-beat list does **not** create a `level_progress` entry. That only happens when the first progress update is logged.

### `api_keys` *(v3)*

Not built in v1 or v2. Introduced in v3 to coincide with the Geode mod.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | UUID | FK → users |
| `name` | VARCHAR | e.g. "Geode Mod" |
| `key_hash` | VARCHAR | Never stored in plaintext |
| `scopes` | VARCHAR[] | |
| `created_at` | TIMESTAMP | |
| `last_used_at` | TIMESTAMP | Nullable |
| `revoked_at` | TIMESTAMP | Nullable |

Max 5 per user.

### `level_update_notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | UUID | FK → users |
| `level_id` | VARCHAR | FK → levels.in_game_id |
| `seen` | BOOLEAN | Default false |
| `created_at` | TIMESTAMP | |

### `reports`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `reporter_id` | UUID | FK → users |
| `reported_user_id` | UUID | FK → users |
| `reason` | TEXT | |
| `status` | ENUM | `pending`, `dismissed`, `actioned` |
| `assigned_moderator_id` | UUID | Never equals reported_user_id |
| `created_at` | TIMESTAMP | |

### `ban_appeals`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | UUID | FK → users |
| `appeal_text` | TEXT | |
| `status` | ENUM | `pending`, `approved`, `denied` |
| `reviewed_by` | UUID | Nullable FK → users |
| `created_at` | TIMESTAMP | |

One appeal per ban enforced at application level.

### `moderation_actions`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `moderator_id` | UUID | FK → users |
| `target_user_id` | UUID | FK → users |
| `action` | ENUM | `warn`, `suspend`, `ban`, `unban`, `verify`, `unverify` |
| `reason` | TEXT | |
| `duration_hours` | INTEGER | Nullable |
| `created_at` | TIMESTAMP | |

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
                  └── user_lists entries
```

A private profile forces all entries private regardless of per-entry setting. A public profile respects per-entry settings. This allows e.g. a YouTuber to hide a specific completion until their video goes live while keeping their profile public.

---

## Deletion Behavior

| Action | Effect |
|---|---|
| Delete progress update | Removes update and associated list_references, rating_scores, record_acceptances |
| Delete level_progress | Removes entry, all updates, and classic_ranking entry. Gap in ranking closes naturally |
| Suspend account | All content hidden for suspension duration |
| Ban account | All content permanently deleted. Username held, cannot be claimed |

**GDDL limitation:** GDDL records cannot be deleted via API. Users are warned in the delete confirmation modal to manage GDDL records directly on the GDDL platform.
