# InfernoLog — My Demon List

## Overview

Each user maintains their own demon list: a personal difficulty ordering of their completions, independent of any official list tier or star rating. Always possessive in UI copy — "my demon list", never "the Demon List", which is Pointercrate's.

Only completed **classic** levels can be placed, enforced on every path including spreadsheet import: an entry that isn't `COMPLETED`, or whose level isn't `CLASSIC`, is refused. Placement checks no demon flag, and needs none: a rated non-demon cannot be logged in the first place, so the only non-demon that can reach the board is a demon GD demoted after it was logged, which stays placeable (see `LOGGING_FLOW.md` → "Scope Stance").

Distinct from **the Ranking** (`/ranking`), which orders the same completions by rating rather than by difficulty.

The API surface is the four `/v1/me/demon-list/classic` routes in `API_DESIGN.md`; the logic is `apps/api/src/services/demonList/index.ts`.

---

## Fractional Indexing

A placed entry is a `ClassicDemonList` row whose `listIndex` (`Decimal(20,10)`) fixes its position: **lower is easier, higher is harder**, so the displayed list is `listIndex` descending and #1 is the hardest. Positions are fractional rather than integers so an insertion never has to update the surrounding rows.

```
Initial:          1.0 ── 2.0 ── 3.0 ── 4.0
Insert 2↔3:       1.0 ── 2.0 ── 2.5 ── 3.0 ── 4.0
Insert 2↔2.5:     1.0 ── 2.0 ── 2.25 ── 2.5 ── 3.0 ── 4.0
Gap < 0.0001:     renormalize the whole list to integers, then insert
```

The client never sends an index. A placement or reorder names the entry's new neighbours (`aboveId`, the harder one, and `belowId`, the easier one — either may be absent at an end of the list) and the server bisects the gap between them. A drop at the top or bottom steps one whole unit past the end; the first entry in an empty list gets `1`. The math is `utils/fractionalIndex.ts`, shared with collections.

**Renormalization is not a background job.** It runs **inline**, inside the
transaction of the placement or reorder that found the gap too tight —
`rebalance()` in `apps/api/src/services/demonList/index.ts`, called from
`computeIndex` — so no read ever observes a half-renormalized list, and the
insert that triggered it lands in the new coordinate system.

The spreadsheet import's full replace (`services/importExport/demonList.ts`)
rewrites the same index space, but it is **not** the same event: renormalization
leaves the order untouched and is logged internal-only, while a replace changes
the order the user sees and is logged as a normal user-facing event. See
"Two list-wide rewrites, deliberately not one event type" below.

---

## Manual Placement (No Auto-Placement)

**There is no auto-placement.** Every completion starts **unplaced**; the user places **all** of them manually. Placement is offered **post-submit**, not as a mid-form checkbox — see `LOGGING_FLOW.md` → "Ranking Placement".

The level's community **GDDL tier** is purely a **convenience** that sets the **starting scroll position** when the user arrives to place it. It does not place the level, and **no tier is required to place** — without one, the list simply opens at the top and the user scrolls. GDDL is the hint because it is the one list that covers every demon; AREDL and sheet tiers are shown on the rows but do not drive the scroll.

Because placement is fully manual and the tier is only a scroll hint, there is **no priority chain, no within-band default, and no cross-list conflict handling** — difficulty consistency across list sources is the user's responsibility, since they rate their own completions.

---

## Placing a Fresh Completion

The logging flow's last step, once a completion is saved, asks whether to place it now:

- **Place later** closes the flow. The completion sits in the **Unplaced** panel until the user places it.
- **Place now** opens `/demon-list?place=<levelProgressId>`. The completion is still unplaced — it is highlighted in the Unplaced panel, and the placed list scrolls to where its GDDL tier suggests it belongs: the topmost entry with the same tier, otherwise just above the closest easier entry, otherwise the bottom (or the top when the level has no GDDL tier). The user then drags it into the list themselves (`features/demon-list/placement.ts`).

Either way the completion is unplaced until the user drags it. Nothing is ever placed for them.

---

## Demon List Page

Route: `/demon-list`

```
┌──────────────────────────────────────────────────────────────┐
│  My demon list              [ Search ]  [ Show unrated: ON ] │
│                                                              │
│  #1  ████ Tartarus        GDDL 35      │  Unplaced           │
│  #2  ████ Slaughterhouse  GDDL 33      │  [ Search ]         │
│  #3  ████ Avernus         GDDL 31      │  ░░ New level ░░    │
│  #4  ████ Bloodbath       GDDL 27      │  ░░ ...       ░░    │
│  ...                                   │                     │
└──────────────────────────────────────────────────────────────┘
```

- Two columns: the placed list in difficulty order, and the **Unplaced** panel of completions not yet placed. The whole set arrives in one payload — there is no pagination.
- Drag-and-drop (dnd-kit) between and within the columns: drag from Unplaced to place, drag within the list to reorder, drag back to unplace.
- Each row shows the level's community tiers (GDDL, AREDL, sheet) for comparison, not the user's own tier opinion.
- **Show unrated** (on by default) hides in-game-unrated levels when off, and the rank numbers renumber for that view.
- Search filters the placed list by level; the Unplaced panel has its own search.
- **Reordering is disabled while a search or the unrated filter is active**, since the visible neighbours would not be the real ones.
- Below 768px the page switches to a single-column layout with the Unplaced panel in a sheet.
- The toolbar also shows a disabled "Non-completions" chip labelled v2; it does nothing.

The board itself (`components/ordering/`, `lib/ordering/`) is shared with ordered collections.

---

## Demon List Events

Every write that touches `ClassicDemonList.listIndex` records what it did in
`activity_log`, with one `activity_log_level_impact` row per level it actually
touched. The full event taxonomy — including the non-ranking event types — is in
`EVENT_LOG.md`; this section covers the demon list half and the reasoning specific
to it.

**This is a hard requirement, not a nice-to-have.** A `listIndex` written
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
with the size of the demon list rather than with what happened. The positions of
uninvolved levels are always derivable from the mover's, which is why they do
not need storing.

### Impact rows store the real index, never a delta

`orderIndex` on an impact row is the actual fractional value the level held
after that event. Not a delta, not a "moved up" boolean. This is the single
decision that makes reconstruction possible without a dedicated snapshot
table: a level's index at any time T is just its most recent impact row at or
before T.

It is also why the renormalization has to emit even though nothing the user can
see has changed. Renormalizing rewrites every index in the list, so every value
logged before it is suddenly in a stale coordinate system. `DEMON_LIST_REBALANCE`
records each level's new index so the two are never compared. Without it, the
rank-history walk below would silently start returning nonsense at the first
renormalization, with nothing in the data to show that it had happened.

### Two list-wide rewrites, deliberately not one event type

`DEMON_LIST_BULK_REPLACE` and `DEMON_LIST_REBALANCE` produce identical rows — one
event, one impact row per level in the list, every row a `MOVER`. They are still
two types, because the only thing that distinguishes them is the thing that
matters most about them: whether the user can see what happened.

- **`DEMON_LIST_BULK_REPLACE`** — the spreadsheet import replaced the demon list. The
  order the user sees really did change, so this is an ordinary user-facing
  event and belongs in a feed. It is **one** event for the whole import, not one
  per level: the user performed a single action, and spelling it out level by
  level would bury every other event they have. The per-level detail is in the
  impact rows, for a reader that wants to expand it into "42 levels reordered".
  Levels the replace dropped off the demon list get a row carrying their last
  held index and a null `positionAfter`.

- **`DEMON_LIST_REBALANCE`** — the inline renormalization. Indices move, order does
  not; the user saw nothing and did nothing. It exists purely so logged index
  values stay in one coordinate system. It is excluded from the Events feed in the query
  itself, and is the **only** hidden event type.

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

Deleting an entry emits no new ranking event for the `classic_demon_list` row it
cascades away. Such an event would be scoped to the deleted level and removed in
the same breath, and the surviving levels' indices are untouched by a delete, so
the rank-history walk is unaffected either way.

---

## Rank History

`GET /v1/me/levels/{levelId}/rank-history` is the reader these events exist for: one level's position in the user's demon list over time, shown on that level's page.

Only direct moves are stored, so the positions a level passed through because _other_ levels were placed around it are reconstructed. `services/activityLog/rankHistory.ts` replays the user's demon list events in `(createdAt, sequence)` order, keeping a map of every level's current `orderIndex` and applying each impact row; after each event the level's position is one more than the number of indices above it. `sequence` matters because one request can write two events (a placement that tripped a renormalization).

The walk consumes `DEMON_LIST_REBALANCE` and `DEMON_LIST_BULK_REPLACE` to re-anchor the map, since both rewrite every index. It is also why each user's history starts with a baseline `DEMON_LIST_REBALANCE` carrying every placed level's index (migration `20260825120000_rank_history_baseline`): without it the map would hold only the levels touched since event logging shipped.
