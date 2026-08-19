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
Gap < 0.0001:     rebalancing job renormalizes all to integers
```

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
