# InfernoLog — Rating System

## Overview

InfernoLog offers two rating modes. Users select their preferred mode in account settings and can switch at any time without losing data.

```
┌─────────────────────────────────────────────────┐
│                 Rating Modes                    │
│                                                 │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │   Simple Mode    │  │   Weighted Mode     │  │
│  │   (default)      │  │                     │  │
│  │                  │  │  Gameplay   ████ 8  │  │
│  │  Overall: 7/10   │  │  Decoration ██░░ 5  │  │
│  │                  │  │  Song       ███░ 7  │  │
│  │  Single score,   │  │             ─────── │  │
│  │  no fuss         │  │  Weighted avg: 6.8  │  │
│  └──────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────┘
```

All ratings apply to any progress update, not just completions — mirroring the GDDL's approach. Non-completion ratings are hidden unless the "show non-completions" toggle is active.

---

## Simple Mode

A single **0–10 score** per progress update. Stored in `progress_updates.simple_rating`. No configuration required.

Display: shown as a single number or star-equivalent wherever ratings appear.

---

## Weighted Mode

User-configurable categories, each scored 0–10, combined into a weighted average.

### Default Categories

- Gameplay
- Decoration
- Song

Users can add, rename, and remove categories freely. Weights don't need to sum to any particular value — the formula normalizes automatically.

### Weighted Average Formula

```
weighted_avg = Σ(score_i × weight_i) / Σ(weight_i)

Example:
  Gameplay:   8 × 3 = 24
  Decoration: 5 × 2 = 10
  Song:       7 × 1 =  7
              ─────────────
  Sum scores:        41
  Sum weights:        6
  Weighted avg:    6.83
```

### Enjoyment as a Rating Component

Enjoyment (`progress_updates.enjoyment`) is a standalone field by default and is **not included** in the weighted average unless the user explicitly opts in via `rating_categories.include_enjoyment`. When opted in, it factors in with its configured weight.

---

## Mode Switching

Switching modes preserves all data:

```
Simple → Weighted:
  simple_rating scores preserved
  Per-category scores start blank for new entries
  Old simple scores displayed as-is for historical entries

Weighted → Simple:
  Per-category scores preserved
  Weighted averages still computable for historical entries
  New entries use single score field
```

---

## Data Storage

Raw per-category scores are always stored. The weighted average is **computed at query time** — never pre-computed and stored. This means:

- Adjusting weights instantly recalculates all historical averages
- No stale cached values to invalidate
- Schema change (add/remove category) doesn't require data migration

If a user deletes a rating category, associated `rating_scores` rows are soft-deleted rather than hard-deleted. If the category is recreated, historical scores can be restored.

---

## Display Rules

| Context | Simple Mode | Weighted Mode |
|---|---|---|
| Completion entry card | Single score badge | Weighted average + breakdown on hover |
| Log list view | Score column | Weighted average column |
| Sorting | By simple_rating | By computed weighted avg |
| No rating entered | Blank (not 0) | Blank (not 0) |
| Non-completion entry | Hidden unless toggle on | Hidden unless toggle on |

---

## v2/v3 Ideas (Do Not Implement in v1)

- **Rating reference notes:** User-defined descriptions for each whole-number score per category (e.g. "A 7 in Decoration means polished but not innovative"). Gives ratings personal consistency over time
- **Public rating breakdowns:** Show per-category scores on public profiles (v3+)
- **Community rating aggregates:** Average enjoyment and ratings across all users for a level (v4, non-completion entries excluded from community averages)
