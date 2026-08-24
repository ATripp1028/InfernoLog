# InfernoLog — Ranking System

## Overview

Each user maintains a personal difficulty ranking of their completions, independent of any official list tier or star rating. Demons are the expected case but not a requirement — a non-demon completion is placeable like any other (see `LOGGING_FLOW.md` → "Scope Stance"). Classic and platformer rankings are completely separate, and that separation _is_ enforced: only `CLASSIC` completions enter the classic ranking, on every path including spreadsheet import. This document covers the classic ranking.

Only progress updates with `kind = completion` appear in the ranking by default. A v2 toggle allows non-completion entries to appear alongside completions.

---

## Fractional Indexing

Ranking positions use floating-point decimal values (`ranking_index`) rather than integers, allowing insertions without updating every surrounding row.

```
Initial:          1.0 ── 2.0 ── 3.0 ── 4.0
Insert 2↔3:       1.0 ── 2.0 ── 2.5 ── 3.0 ── 4.0
Insert 2↔2.5:     1.0 ── 2.0 ── 2.25 ── 2.5 ── 3.0 ── 4.0
Gap < 0.0001:     renormalize the whole list to integers, then insert
```

**Renormalization is not a background job.** Earlier drafts of this document
(and the `ClassicRanking` comment in `schema.prisma`) called it "the rebalancing
job", which implied a cron that does not exist. It runs **inline**, inside the
transaction of the placement or reorder that found the gap too tight —
`rebalance()` in `apps/api/src/services/ranking/index.ts`, called from
`computeIndex` — so no read ever observes a half-renormalized list, and the
insert that triggered it lands in the new coordinate system.

The spreadsheet import's full replace (`services/importExport/ranking.ts`)
rewrites the same index space, but it is **not** the same event: renormalization
leaves the order untouched and is logged internal-only, while a replace changes
the order the user sees and is logged as a normal user-facing event. See
"Two list-wide rewrites, deliberately not one event type" below.

---

## Manual Placement (No Auto-Placement)

**There is no auto-placement.** Every completion starts **unplaced**; the user places **all** of them manually. The placement prompt is offered **post-submit**, not as a mid-form checkbox — see `LOGGING_FLOW.md` → "Ranking Placement".

A list reference (GDDL tier, AREDL rank, NLW tier) is purely a **convenience** that sets the **starting scroll position** in the placement view. It does not place the level, and **no reference is required to place** — without one, the view simply opens at the top and the user scrolls.

Because placement is fully manual and a reference is only a scroll hint, there is **no priority chain, no within-band default, and no cross-list conflict handling** — difficulty consistency across list sources is the user's responsibility, since they rate their own completions.

---

## Placement View

After a completion is submitted, a compact confirm modal asks **"Place in ranking now?"**

```
            Completion submitted
                    │
                    ▼
       ┌─────────────────────────────┐
       │  Place in ranking now?      │
       │  [ Place now ]  [ Later ]   │
       └─────────────────────────────┘
         │                    │
   Place now             Place later
         │                    │
         ▼                    ▼
┌─────────────────────────┐  ┌───────────────────────┐
│      Placement View     │  │  Unplaced side panel   │
│                         │  │  (until user places)   │
│  ... [Level A] Tier 28  │  └───────────────────────┘
│  ... [Level B] Tier 27  │
│  ┄┄┄[NEW LEVEL]┄┄┄ 👻   │◄── ghost card, draggable
│  ... [Level C] Tier 26  │
│  ... [Level D] Tier 25  │
│                         │
│  ↑ pre-scrolled to the  │
│    list-reference spot  │
│    (top if no reference)│
└─────────────────────────┘
```

- **Place now:** opens the ranking. With a list reference, the view is pre-scrolled to the matching tier spot (highest match, or just above the closest under). Without a reference, it opens at the top and the user scrolls to place.
- **Place later:** the completion goes to the **Unplaced** side panel until the user places it. The Unplaced panel is only ever reached by the user _choosing_ to skip — no completion is ever _forced_ unplaced.
- Ghost card shows level name and assigned tier for visual comparison.

---

## Ranking Page

Route: `/[username]/ranking/classic`

```
┌─────────────────────────────────────────────────┐
│  Personal Ranking          [ Show unrated: ON  ]│
│                            [ Show non-completions: OFF ] (v2)
│                                                 │
│  #1  ████ Tartarus          GDDL 35  ⚡         │
│  #2  ████ Slaughterhouse    GDDL 33             │
│  #3  ████ Avernus           GDDL 31             │
│  #4  ████ Bloodbath         GDDL 27             │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

Features:

- Drag-and-drop reordering directly on page (dnd-kit)
- Toggle to show/hide unrated levels (ranking numbers update for that view)
- Unplaced completions (user chose "Place later") live in a separate **Unplaced** panel until manually placed — they are not shown inline as auto-placed entries
- Sortable by any logged metric independent of ranking order

---

## Ranking Events

Every write that touches `classic_ranking.ranking_index` records what it did in
`activity_log`, with one `activity_log_level_impact` row per level it actually
touched. The full event taxonomy — including the non-ranking event types — is in
`EVENT_LOG.md`; this section covers the ranking half and the reasoning specific
to it.

**This is a hard requirement, not a nice-to-have.** A `ranking_index` written
without a matching impact row is a hole in that level's history that nothing can
fill in afterwards, because the old value is simply gone. Every path goes through
`services/activityLog`: the placement, reorder and unranking endpoints, the
inline renormalization, the indirect unranking when deleting a completion walks
an entry out of `COMPLETED`, and the spreadsheet import's full replace.
`services/invariants.integration.test.ts` sweeps the whole database for the gap —
every placed entry's current index must be the most recent one logged for that
level — so a new write path that forgets turns that file red. Note that this
requirement is indifferent to whether the event is user-facing: the internal-only
rebalance is bound by it exactly as tightly as a placement is.

### Direct events only — the mover and its immediate neighbours

One `activity_log` row per move action, with impact rows for the mover plus the
levels **immediately adjacent to it in either the before or the after state**. A
placement has destination neighbours only; an unranking has origin neighbours
only; a reorder has up to four, since it closes one gap and opens another.

Levels further down the list whose ordinal merely shifted get **nothing**.
Dropping a level in at #3 shifts the ordinal of every level beneath it, and
recording that cascade would turn one drag into hundreds of rows saying nothing
the mover's own row does not already imply — while making the write cost scale
with the size of the ranking rather than with what happened. The positions of
uninvolved levels are always derivable from the mover's, which is why they do
not need storing.

### Impact rows store the real index, never a delta

`rankingIndex` on an impact row is the actual fractional value the level held
after that event. Not a delta, not a "moved up" boolean. This is the single
decision that makes reconstruction possible later without a dedicated snapshot
table: a level's index at any time T is just its most recent impact row at or
before T.

It is also why the renormalization has to emit even though nothing the user can
see has changed. Renormalizing rewrites every index in the list, so every value
logged before it is suddenly in a stale coordinate system. `RANKING_REBALANCE`
records each level's new index so the two are never compared. Without it,
reconstruction would silently start returning nonsense at the first
renormalization, with nothing in the data to show that it had happened.

### Two list-wide rewrites, deliberately not one event type

`RANKING_BULK_REPLACE` and `RANKING_REBALANCE` produce identical rows — one
event, one impact row per level in the list, every row a `MOVER`. They are still
two types, because the only thing that distinguishes them is the thing that
matters most about them: whether the user can see what happened.

- **`RANKING_BULK_REPLACE`** — the spreadsheet import replaced the ranking. The
  order the user sees really did change, so this is an ordinary user-facing
  event and belongs in a feed. It is **one** event for the whole import, not one
  per level: the user performed a single action, and spelling it out level by
  level would bury every other event they have. The per-level detail is in the
  impact rows, for a reader that wants to expand it into "42 levels reordered".
  Levels the replace dropped out of the ranking get a row carrying their last
  held index and a null `positionAfter`.

- **`RANKING_REBALANCE`** — the inline renormalization. Indices move, order does
  not; the user saw nothing and did nothing. It exists purely so logged index
  values stay in one coordinate system. It must never appear in a Log/timeline
  feed, and must be excluded from any future event-type → Discord channel
  mapping. It is the **only** hidden event type.

Do not merge them back together on the grounds that the row shapes match.

### Milestones are a field, not an event

`milestoneCrossed` on an impact row holds the tightest top-N boundary that level
crossed on that event (thresholds in
`apps/api/src/services/activityLog/milestones.ts`), or null for none. It is a
field rather than a separate event type because a crossing is never independent
of the move that caused it — and because one move can produce several: the mover
entering the top 10 and the neighbour it pushed out of the top 10 each carry the
crossing on their own row.

Direction is deliberately not stored. Entering the top 10 and falling out of it
are both `10`; `positionBefore` and `positionAfter` on the same row say which,
and encoding it twice would just be a second thing to keep consistent.

### The level name is denormalized on purpose

`activity_log_level_impact.levelName` is snapshotted at write time. Deleting a
`level_progress` entry deletes that level's **own** event history — the user
asked for the entry to be gone — but every other level's impact rows still name
it, and there is no longer any `level_progress` to join through for a name. The
snapshot is what keeps those rows readable. `levelId` is nullable for the same
reason: history outlives the level cache row.

Deleting an entry emits no new ranking event for the `classic_ranking` row it
cascades away. Such an event would be scoped to the deleted level and removed in
the same breath, and the surviving levels' indices are untouched by a delete, so
reconstruction is unaffected either way.

---

## Reconstruction: snapshot-at-T vs. retroactive-at-T

Neither query is built. Both are what the impact rows exist to make buildable
without a migration, and both have been decided so they do not get re-litigated
when someone does build them. They answer genuinely different questions and a
Time Machine–style view will want to name which one it is showing. (Distinct
from `TIME_MACHINE.md`, which plots completions against their **community list
tier** over time, not against the user's own ranking.)

**Snapshot-at-T — "what my ranking looked like on that day."**

Each level's most recently logged `rankingIndex` at or before T, ordered by that
value. Includes levels that have since been unranked or whose entry no longer
exists, because on that day they were in the list. Reads `activity_log` alone;
the current `classic_ranking` table is not consulted. Order by `(createdAt,
sequence)` — one request can write two events (a placement that tripped a
renormalization) and `sequence` is the only thing that separates them.

**Retroactive-at-T — "where would the levels I had beaten by then sit in the
ranking I hold today?"**

The **current** ranking, filtered to levels the user had already logged at T,
sorted by their **current** index. Excludes anything since unranked, since it has
no current position. Reads `classic_ranking` plus completion dates; the event log
is not consulted at all.

The difference is not cosmetic: a level the user later decided was much harder
sits low in the snapshot and high in the retroactive view, and a level they
unranked appears in one and not the other. Neither is more correct — snapshot is
history as it was recorded, retroactive is today's judgement applied backwards.
