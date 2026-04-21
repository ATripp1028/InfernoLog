# InfernoLog — Ranking System

## Overview

Each user maintains a personal difficulty ranking of their demon completions, independent of any official list tier or star rating. Classic and platformer rankings are completely separate. This document covers the classic ranking.

Only progress updates with `is_completion = true` appear in the ranking by default. A v2 toggle allows non-completion entries to appear alongside completions.

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

## Auto-Placement on New Completion

When a completion is logged, it is automatically placed in the ranking before the user manually fine-tunes it.

### Priority Chain

List references are evaluated in this order to determine a difficulty band:

```
1. GDDL tier
2. AREDL rank
3. Pointercrate rank
4. NLW tier
5. Other list references
6. No reference → bottom of ranking, flagged for manual sorting
```

User can reorder this priority chain in settings.

### Within-Band Placement

New completions are placed at the **bottom of their difficulty band** by default. This is intentional — a new hardest demon is a significant accomplishment and should not automatically displace existing completions without deliberate user action.

### Cross-List Conflicts (v1)

When a new completion's primary list source differs from surrounding levels, auto-placement is limited to same-source levels. Cross-list comparisons are flagged for manual resolution.

```
v1: Same-source placement only, cross-list flagged
v2: Community conversion table normalizes across list scales
```

---

## Placement Modal

Users can set their ranking position during the logging flow.

```
Logging form
     │
     │ User assigns list tier/rank
     │
     ▼
┌─────────────────────────────────┐
│  [ ] Place in ranking now       │
└─────────────────────────────────┘
     │ checked
     ▼
┌─────────────────────────────────────────────┐
│              Placement Modal                │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  ... [Level A] Tier 28              │   │
│  │  ... [Level B] Tier 27              │   │
│  │  ┄┄┄┄[NEW LEVEL]┄Tier 26┄┄┄┄ 👻    │◄──┼── ghost card, draggable
│  │  ... [Level C] Tier 26              │   │
│  │  ... [Level D] Tier 25              │   │
│  └─────────────────────────────────────┘   │
│  ↑ autoscrolled to user's tier band        │
│                                             │
│  [ Confirm placement ]  [ Skip ]            │
└─────────────────────────────────────────────┘
```

- Ghost card shows level name and assigned tier for visual comparison
- Autoscrolls to the difficulty band on open
- If no levels exist at a similar tier, autoscrolls to nearest tier boundary
- Logging form state fully preserved if modal is opened and closed
- Skipping uses auto-placement

### Unconfirmed Placement Indicator

Auto-placed completions display a subtle indicator (small icon or faint highlight) in the ranking view nudging the user to manually confirm or adjust. Dismissible.

---

## Ranking Page

Route: `/[username]/ranking/classic`

```
┌─────────────────────────────────────────────────┐
│  Personal Ranking          [ Show unrated: OFF ]│
│                            [ Show non-completions: OFF ] (v2)
│                                                 │
│  #1  ████ Tartarus          GDDL 35  ⚡         │
│  #2  ████ Slaughterhouse    GDDL 33             │
│  #3  ████ Avernus           GDDL 31  ⚠ needs placement
│  #4  ████ Bloodbath         GDDL 27             │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

Features:
- Drag-and-drop reordering directly on page (dnd-kit)
- Toggle to show/hide unrated levels (ranking numbers update for that view)
- "Needs placement" indicator on auto-placed entries
- Visual indicator on entries with pending level data updates
- Sortable by any logged metric independent of ranking order

---

## Top 5 Tracking

When logging a completion that falls in the user's personal top 5 at that moment, `top_5_at_time = true` and `top_5_position` are set on the progress update. This snapshot is never retroactively updated as the ranking evolves — it reflects the state at time of logging.
