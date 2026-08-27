# InfernoLog — Event Log

The event log is the record of things a user **did** that are not already
recoverable from a timestamp somewhere else: ranking moves, edits to a log entry,
and rating-configuration changes.

The schema and its emission discipline came first; the two surfaces that read it
are the **Log page** (`/log`, `GET /v1/me/activity`) and the **rank history**
panel on a level page (`GET /v1/me/levels/{levelId}/rank-history`). See
"Surfaces". Discord wiring is still later work, and the shape below is chosen so
it can be added without a migration.

Events have been written since 2026-08-24 regardless of what reads them, because
history cannot be backfilled after the fact. Every surface therefore has a hard
floor at that date, and nothing before it can be shown.

Tables: `activity_log` (the parent event), `activity_log_level_impact` (ranking
events' per-level detail), `activity_log_field_change` (edit and rating-config
diffs). The models in `apps/api/prisma/schema.prisma` are the source of truth for
the columns; emission lives in `apps/api/src/services/activityLog`.

---

## The one rule that cannot be relaxed

**Every write path that touches `classic_demon_list.ranking_index` must emit an
event.** Not most of them. A `ranking_index` written without a matching impact
row is a permanent hole in that level's history — the previous value is gone and
nothing can reconstruct it later. `services/invariants.integration.test.ts`
sweeps the whole database for that gap after driving each write path, so a new
path that forgets fails there rather than losing history quietly.

Nothing else in this document has that property. A missed `LOG_EDIT` costs one
feed entry; a missed ranking event corrupts every reconstruction that spans it.

---

## Event taxonomy

| `eventType`               | Scope          | Children      | Emitted by                                                                                                            |
| ------------------------- | -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DEMON_LIST_PLACEMENT`    | One level      | Impact rows   | `POST /v1/me/demon-list/classic`                                                                                      |
| `DEMON_LIST_REORDER`      | One level      | Impact rows   | `PATCH /v1/me/demon-list/classic/:levelProgressId`                                                                    |
| `DEMON_LIST_REMOVED`      | One level      | Impact rows   | `DELETE /v1/me/demon-list/classic/:levelProgressId`, and deleting a completion that walks an entry out of `COMPLETED` |
| `DEMON_LIST_BULK_REPLACE` | The whole list | Impact rows   | The spreadsheet import's full replace of the demon list                                                               |
| `DEMON_LIST_REBALANCE`    | The whole list | Impact rows   | The inline index renormalization                                                                                      |
| `LOG_EDIT`                | One level      | Field changes | `PATCH /v1/me/progress/:levelId`                                                                                      |
| `RATING_CONFIG_CHANGE`    | The account    | Field changes | `PUT /v1/me/rating-config`; a rating-mode switch on `PATCH /v1/me`                                                    |

`DEMON_LIST_REBALANCE` is **internal-only** — the one hidden type. It exists so
every level's logged index values stay in one coordinate system; the order the
user sees does not change, and nothing they did is described by it. It must be
filtered out of any Log/timeline surface and excluded from any future
event-type → Discord channel mapping.

**Every other type is user-facing**, `DEMON_LIST_BULK_REPLACE` included. That one
produces rows structurally identical to a rebalance's — one event, one impact row
per level in the list — and is a separate type anyway, precisely so one can be
shown and the other suppressed: a spreadsheet import really does change the order
the user sees, so it belongs in their feed. Do not collapse the two on the
grounds that the shapes match.

A bulk replace is **one** event for the whole import, not one per level. The user
performed a single action, and a feed that listed every level it touched would
bury everything else they have. The per-level detail lives in its impact rows,
for a reader that wants to expand it into "42 levels reordered".

The rest of the demon list half — direct-events-only, milestones as a field, the
denormalized level name, and the snapshot-at-T / retroactive-at-T reconstruction
definitions — is documented in `DEMON_LIST.md` → "Ranking Events". The rest
of the taxonomy is below.

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

### What an edit does and does not snapshot

`LOG_EDIT` captures no `ranking_index` and no classic-ranking position. Those
belong to ranking events, and editing a rating does **not** move a level in the
difficulty ranking — that ranking is ordered by hand, not by score.

A rating change does record what it did to the two things that _are_ ordered by
score. Both are ordinary `activity_log_field_change` rows on the same event,
carrying `category = RATING`:

| `fieldName`        | Holds                                                             |
| ------------------ | ----------------------------------------------------------------- |
| `weighted_average` | The level's overall rating, before and after the save             |
| `rating_rank`      | Its 1-based position in the user's rating order, before and after |

These are the one deliberate exception to "actually changed is measured against
the values already stored" — nothing stores them today, so they are computed
inside the same transaction. `computeOverallRating` in `packages/core` does the
arithmetic for the average; the rank is one ordered pass over that user's own
levels, ties broken on enjoyment, then completion date, then `levelId` (always
unique, and the number a user recognises).

**Both must be written at save time, because neither can be recovered
afterwards.** The average could in principle be recomputed from the field changes
plus the config in force then; the rank cannot, because it depends on every
_other_ level's average at that instant and nothing records those.

`category = RATING` rather than a new `DERIVED` one, deliberately. `LevelProgress`
is expected to gain stored columns for both, at which point these stop being
derived and become ordinary field changes — and `RATING` is what they would have
been all along. Choosing `DERIVED` now would mean migrating them back later.

A weight change still logs no knock-on effect on any level (see "Rating-config
events" below), so the rating order's history has deliberate gaps: every stored
`rating_rank` predating a reweight was measured on a scale that no longer
applies.

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

The one cost of that, now that edits record `rating_rank`: a reweight silently
puts every previously logged rank on a scale that no longer applies. Ranks are
comparable within a config era, not across one.

---

## Deliberately not tracked

**Progress logs, completions and drops.** These are already events —
`progress_updates.kind` plus `logged_at` — and duplicating them into
`activity_log` would create two records of one fact that can drift apart. The Log
page reads both tables and merges them at read time (the "hybrid merge") — see
"Surfaces". Nothing should start writing progress rows into `activity_log`
instead.

**Collection add/remove.** Adding a level to Want to Beat, Favorites, or a custom
collection is not tracked at all, in any form. If it is ever wanted, it is a new
`eventType` and (probably) no new tables.

**Whole-ranking reconstruction.** The snapshot-at-T and retroactive-at-T queries
in `DEMON_LIST.md` remain unbuilt. The rank-history walk under "Surfaces"
answers a narrower question — one level's position over time — and is not a
substitute for either.

**Anything in the spreadsheet import or export.** Events never round-trip: the
import template must not accept them and the export must not emit them. An import
still _emits_ a `DEMON_LIST_BULK_REPLACE`, which is the opposite direction — the
import producing an event, not events being carried in a file.

**Discord notifications and the event-type → channel mapping.** Not built. The
`eventType` enum is the natural key for that mapping when it lands. The only
constraint it inherits is that `DEMON_LIST_REBALANCE` must never be mapped to
anything — which is exactly why the import's bulk replace is its own type rather
than sharing that one.

---

## Ordering

Order by `(createdAt, sequence)`, or by `sequence` alone within one user.

`sequence` is not decoration. One request routinely writes two events — a
placement that trips a renormalization emits `DEMON_LIST_REBALANCE` and then
`DEMON_LIST_PLACEMENT` — and `createdAt` cannot separate them reliably: Prisma
stamps it per statement, so the two are a millisecond apart at best and can land
in the same one, and the column's `DEFAULT CURRENT_TIMESTAMP` is frozen at
transaction start for anything inserted by raw SQL. Reading those two in the
wrong order makes a reconstruction return indices from the stale coordinate
system.

### Ordering across the merge

The Log page reads `activity_log` and `progress_updates` together, and keyset
pagination over the pair needs a **total** order. `sequence` does not exist on
`progress_updates`, so the key is three levels deep:

1. **Timestamp, descending** — `created_at` for an event, `logged_at` for a
   progress update. Never `progress_updates.date`: that is when the user says the
   run happened, is optionally uncertain, and can be back-dated. This log records
   when a thing was written down, not when it happened. A back-dated completion
   therefore sits at the top of the day it was entered.
2. **`activity_log` before `progress_updates`** on a tie. An event normally
   follows the write that triggered it — a placement follows its completion — so
   this reads in causal order.
3. **Within one table:** `sequence` for events, `id` for progress updates.

Key 3 only ever compares rows in the same table, because key 2 has already
separated them. That is what makes a cursor whose third component is an `int` for
one table and a `uuid` for the other sound.

Key 3 is **not** optional. The spreadsheet import writes its progress updates in
a single `createMany` (`services/importExport/import/processBatch.ts`), so an
entire batch shares one `logged_at` — precisely the case where a page boundary
landing mid-batch would skip or repeat rows.

---

## Surfaces

Two read surfaces consume this schema. Both are scoped to the authenticated
user's own data; neither has a public equivalent while `visibility` is inert.

### The Log page

`/log` — one merged, filtered, paginated feed of `activity_log` events and
`progress_updates`, newest first by the order above.

- **`DEMON_LIST_REBALANCE` is excluded in the query**, not styled quiet. It must
  never reach a feed response.
- **The chips are four things a user recognises having done**, not the event
  types behind them: **Progress** (`progress_updates`, all three kinds),
  **Ranking** (the four visible `DEMON_LIST_*` types), **Edits** (`LOG_EDIT`) and
  **Settings** (`RATING_CONFIG_CHANGE`). Naming no chip is "All". They are a
  hand-written list on purpose — anything that enumerated `ActivityEventType`
  and rendered what it found would grow a chip for the hidden type.
- **The Edits chip narrows on `category`** (see "Filter on `category`, never on
  `fieldName`"), and on nothing else — it is the sub-filter of one chip, not a
  filter over the whole feed. A level and a date range apply across all of them;
  the range uses the same recorded-time clock the ordering does.
- **The level filter is a union, not a column match.** A `DEMON_LIST_BULK_REPLACE`
  has a null `level_id` and belongs to every level its impact rows touched, so
  filtering by a level must match `activity_log.level_id` **or**
  `activity_log_level_impact.level_id`. Without the union, an import that moved a
  level goes missing from that level's history.
- `RATING_CONFIG_CHANGE` is account-scoped and drops out of a level-filtered feed
  by definition. Say so in the UI rather than leaving a silent hole.

A glossary explains this vocabulary in the user's terms. It must not name event
types, and `DEMON_LIST_REBALANCE` must not appear in it at all.

### Rank history on a level page

The user's own level page only — never the Global Level Page. This is personal
data.

Direct events come straight from that level's impact rows. **Indirect shifts —
the level moving because something else was placed above it — have no rows of
their own** (`DEMON_LIST.md` → "Direct events only"), and are reconstructed:
walk that user's ranking events in `(created_at, sequence)` order maintaining a
map of `level_id` → current `ranking_index`, applying every impact row; after
each event the level's position is 1 + the count of indices ordered above it.

**This is the first reader of `DEMON_LIST_REBALANCE`.** Index comparisons are only
valid inside one coordinate system, and a rebalance rewrites all of them, so the
walk must consume those events to re-anchor the map. The one type that is never
_displayed_ is now one that must be _read_. `DEMON_LIST_BULK_REPLACE` updates the map
wholesale for the same reason.

#### The baseline rebalance

The map is only as complete as the impact rows it is built from, and those only
exist from 2026-08-24. A ranking built before that date is invisible to it: a user
with 200 placed levels of which 5 have been touched since gets a 5-entry map, and
a level actually sitting at #8 reconstructs as #3. Worse, a level that has never
been moved has no index in the map at all, so every shift past it is lost rather
than merely misnumbered — and "a level the user has never moved" is exactly the
level whose page is being looked at.

So **every user's ranking starts with a baseline `DEMON_LIST_REBALANCE`** carrying an
impact row for every placed level, written by
`20260825120000_rank_history_baseline`. That is already what a rebalance means —
"here is every level's index in the current coordinate system" — so it needs no
new event type, and being the internal-only type it can never surface. The walk
re-anchors the whole map on it and is exact from there on.

The same migration **deletes the demon list events that predate the baseline**. A
baseline written today records today's indices, not the ones that held a day ago,
so older events would replay against the incomplete map and produce wrong
positions with nothing in the data to flag which entries those are. One day of
ranking history for two pre-release accounts was not worth a reconstruction that
is quietly wrong. `LOG_EDIT` and `RATING_CONFIG_CHANGE` events were untouched —
they carry field diffs, not positions.

A user who places their first level after that migration needs no baseline: their
map is complete from their first placement.

#### Holes a deletion leaves

Where a deleted entry has left a hole (see "Deletion and privacy" below), the
recomputed position will disagree with a stored `position_before`. Trust the
stored value and render the shift unattributed — "1 level placed above" rather
than a name. The shift itself is never lost: a `position_before` that does not
match the reconstruction is proof that drift happened, independent of the walk.

Deleting an entry removes that level's **own** events but leaves its impact rows
on every other level's events standing, so the map goes on counting a level that
is no longer ranked, and the deletion emits nothing of its own. Two things follow.
The correction is carried forward once re-anchored, so one hole is not re-reported
at every later event. And the walk ends with one more comparison — the
reconstructed position against `classic_demon_list` — because a hole opened after the
level's last direct event has no later event to be caught at.

### Keeping the surfaces fresh

Every path that emits an event must invalidate the surfaces that read them — the
client-side sibling of the rule at the top of this document. That is
`INVALIDATE_ON_EVENT` in `apps/web/src/lib/api/activity.ts`: its **own** exported
constant, not extra entries in `INVALIDATE_ON_WRITE`
(`apps/web/src/lib/api/logging.ts`), which means "affected by a
completion/progress/drop write". The event surfaces are affected by a superset:
ranking moves and rating-config saves emit events too, and a config save
otherwise invalidates the `me` query alone. Widening the older set would make a
config save needlessly refetch the list and collections.

The relationship runs one way, and `lib/api/tests/activity.spec.ts` pins it:
`invalidateOnWrite` covers **both** sets, because a progress write is also an
event, while the demon list mutations, the rating-config save and the rating-mode
switch on `PATCH /v1/me` call `invalidateOnEvent` alone. A later "just add it to
the other list" edit is exactly what that test exists to catch.

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
