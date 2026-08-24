# InfernoLog — Event Log

The event log is the record of things a user **did** that are not already
recoverable from a timestamp somewhere else: ranking moves, edits to a log entry,
and rating-configuration changes.

It is schema and emission discipline only. There is no timeline UI, no feed, no
reconstruction query, and no Discord wiring — all of that is v2 or later, and the
shape below is chosen so each can be added without a migration. The dedicated Log
page is currently shelved (see `PROJECT_OVERVIEW.md`); the events are being
written now regardless, because history cannot be backfilled after the fact.

Tables: `activity_log` (the parent event), `activity_log_level_impact` (ranking
events' per-level detail), `activity_log_field_change` (edit and rating-config
diffs). The models in `apps/api/prisma/schema.prisma` are the source of truth for
the columns; emission lives in `apps/api/src/services/activityLog`.

---

## The one rule that cannot be relaxed

**Every write path that touches `classic_ranking.ranking_index` must emit an
event.** Not most of them. A `ranking_index` written without a matching impact
row is a permanent hole in that level's history — the previous value is gone and
nothing can reconstruct it later. `services/invariants.integration.test.ts`
sweeps the whole database for that gap after driving each write path, so a new
path that forgets fails there rather than losing history quietly.

Nothing else in this document has that property. A missed `LOG_EDIT` costs one
feed entry; a missed ranking event corrupts every reconstruction that spans it.

---

## Event taxonomy

| `eventType`            | Scope          | Children      | Emitted by                                                                                                         |
| ---------------------- | -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `RANKING_PLACEMENT`    | One level      | Impact rows   | `POST /v1/me/ranking/classic`                                                                                      |
| `RANKING_REORDER`      | One level      | Impact rows   | `PATCH /v1/me/ranking/classic/:levelProgressId`                                                                    |
| `RANKING_UNRANKED`     | One level      | Impact rows   | `DELETE /v1/me/ranking/classic/:levelProgressId`, and deleting a completion that walks an entry out of `COMPLETED` |
| `RANKING_REBALANCE`    | The whole list | Impact rows   | The inline index renormalization; the spreadsheet import's full replace                                            |
| `LOG_EDIT`             | One level      | Field changes | `PATCH /v1/me/progress/:levelId`                                                                                   |
| `RATING_CONFIG_CHANGE` | The account    | Field changes | `PUT /v1/me/rating-config`; a rating-mode switch on `PATCH /v1/me`                                                 |

`RANKING_REBALANCE` is **internal-only**. It exists so every level's logged index
values stay in one coordinate system; nothing the user did is described by it. It
must be filtered out of any Log/timeline surface and excluded from any future
event-type → Discord channel mapping. Every other type is user-facing.

The ranking half — direct-events-only, milestones as a field, the denormalized
level name, and the snapshot-at-T / retroactive-at-T reconstruction definitions —
is documented in `RANKING_SYSTEM.md` → "Ranking Events". The rest is below.

---

## Edit events

### One event per save, not one per field

A `LOG_EDIT` is one row per **save action**, with one `activity_log_field_change`
child per field that actually changed in it. Changing five fields and pressing
Save once is one event with five children, not five events. A save where nothing
in scope changed writes nothing at all — an event with no field changes is a feed
entry with nothing to say.

"Actually changed" is measured against the values already stored, on serialized
strings, so re-sending a percentage stored as `85.00` as the number `85` is not an
edit. It is also measured against the values being **written**, not against the
request body: setting `percentage` clears `runFrom`/`runTo` even though the client
never sent them, and that really did change the entry.

### What is in scope

The scope is "fields a user would think of as editing their log entry". It lives
as a table in `apps/api/src/services/activityLog/fieldScope.ts`; adding a new
editable field means adding one line to it.

| Category         | Fields                                                                                                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RATING`         | `simple_rating`, `rating_score:<categoryId>` (one per weighted category), `enjoyment`                                                                                                                                                                                                              |
| `SESSION_DETAIL` | `percentage`, `run_from`, `run_to`, `attempts`, `date`, `date_timezone`, `date_uncertain`, `fps`, `percentage_version`, `on_stream`, `device`, `notes`, `two_player_solo`, `two_player_partner`, `worst_fail`, `worst_fail_date`, `worst_fail_date_timezone`, `coins_collected`, `completion_time` |
| `METADATA`       | `difficulty_opinion`, `user_gddl_tier`, `level_notes`                                                                                                                                                                                                                                              |

**Out of scope, deliberately:** the `visibility` privacy toggle, `video_url`, and
`highlight_url`. They are edited on the same form but are administrative rather
than part of the story a feed tells. A save that touched only those emits nothing.

### Filter on `category`, never on `fieldName`

`category` is the tag every filter is meant to key off. That is the entire reason
it exists: a feed that wants "rating changes only" should not carry a hardcoded
list of rating field names that goes stale the moment a field is added.
`fieldName` is a raw identifier for display and for reading one specific field's
history — not a filter key.

`SESSION_DETAIL` follows the logging flow's own "Session Details" grouping (see
`LOGGING_FLOW.md`), so what the user grouped together stays grouped.
`METADATA` is the narrower idea of "the user's read of the **level** rather than
of one run".

Per-category weighted scores are keyed by category **id**, not by the category's
name at edit time: names are renameable and ids are not, and the name history is
recoverable from that user's `RATING_CONFIG_CHANGE` events. A reader resolves the
id against the user's current categories; one that no longer exists renders as a
removed category rather than as a name that may since have moved elsewhere.

### No rank or position snapshot on an edit

Unlike ranking events, `LOG_EDIT` captures no index and no position. Weighted
totals are computed at query time (see `RATING_SYSTEM.md`), and there is no
reconstruction requirement for rating history, so there is nothing to snapshot.
Editing a rating does **not** emit anything about the level's rank.

---

## Rating-config events

`RATING_CONFIG_CHANGE` is account-scoped: `levelId` is null and it has no impact
rows. It reuses `activity_log_field_change` with `category = RATING_CONFIG`
rather than adding a JSON column, because the save is already a diff of named
things.

One event per successful save, and none when the save changed nothing. The config
is saved on command rather than live per keystroke, so a save maps cleanly onto
an event.

Rows it can carry:

- `rating_categories` — the whole category list before and after, as JSON
  (`name`, `weight`, `sortOrder`) in priority order. One row rather than one per
  category: categories get added, removed, renamed and reweighted in the same
  save, and a per-category row set would have to invent a stable identity for a
  category that does not have one yet.
- `include_enjoyment`, `enjoyment_weight`, `enjoyment_sort_order` — scalars.
- `rating_mode` — the SIMPLE ↔ WEIGHTED switch.

`rating_mode` comes from a different endpoint. `User.ratingMode` is written by
`PATCH /v1/me` alongside every other preference and is not part of the
rating-config payload at all, so that route emits its own `RATING_CONFIG_CHANGE`
when — and only when — the mode actually moves. Without it the event type would be
lying by omission about the most consequential setting in a user's rating setup.
Nothing else on `PATCH /v1/me` is logged.

**A config change never logs its knock-on effect on levels.** Changing a weight
shifts every level's weighted total and can reshuffle a rating-sorted view, and
none of that is recorded. It was ruled out as noise: the averages are computed at
query time, so nothing about any level actually changed, and logging it would
bury the one thing the user did under hundreds of things they did not.

---

## Deliberately not tracked

**Progress logs, completions and drops.** These are already events —
`progress_updates.kind` plus `logged_at` — and duplicating them into
`activity_log` would create two records of one fact that can drift apart. A
timeline is expected to read both tables and merge at read time (the "hybrid
merge"). That merge is not built; nothing here prevents it, and nothing here
should start writing progress rows into `activity_log` instead.

**Collection add/remove.** Adding a level to Want to Beat, Favorites, or a custom
collection is not tracked at all, in any form. If it is ever wanted, it is a new
`eventType` and (probably) no new tables.

**Timeline UI, feeds, and reconstruction queries.** Not built. The schema
supports them; see `RANKING_SYSTEM.md` for the two reconstruction definitions
already settled.

**Discord notifications and the event-type → channel mapping.** Not built. The
`eventType` enum is the natural key for that mapping when it lands. The only
constraint it inherits is that `RANKING_REBALANCE` must never be mapped to
anything.

---

## Ordering

Order by `(createdAt, sequence)`, or by `sequence` alone within one user.

`sequence` is not decoration. One request routinely writes two events — a
placement that trips a renormalization emits `RANKING_REBALANCE` and then
`RANKING_PLACEMENT` — and `createdAt` cannot separate them reliably: Prisma
stamps it per statement, so the two are a millisecond apart at best and can land
in the same one, and the column's `DEFAULT CURRENT_TIMESTAMP` is frozen at
transaction start for anything inserted by raw SQL. Reading those two in the
wrong order makes a reconstruction return indices from the stale coordinate
system.

---

## Deletion and privacy

Deleting a `level_progress` entry deletes that level's own events for that user —
the user asked for the entry to be gone. Impact rows on **other** levels' events
that happen to name it survive, readable through the denormalized
`levelName`. Deleting the account cascades everything away.

`activity_log.visibility` reuses the `EntryVisibility` enum and defaults to
`PUBLIC`. It is inert today: every route is scoped to the authenticated user's
own data, and no public-profile route exists. It is written now so events do not
all turn out to have been retroactively public the day a profile route ships.
