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

Rating (`simple_rating` / `rating_scores`) is **one current value per level**, not per logged event — it lives on `level_progress` and is editable from any progress-editing surface (the completion flow, or the edit form for any entry), not gated to completions specifically. `enjoyment` is the exception: it's logged per-event on `progress_updates`, mirroring the GDDL's approach, since a session's enjoyment can genuinely differ beat-to-beat in a way a level's overall rating doesn't. Non-completion entries (and the enjoyment they carry) are hidden unless the "show non-completions" toggle is active.

### Display scale

`users.rating_display_scale` (`zero_to_ten` default, or `zero_to_hundred`) controls only how ratings and enjoyment are _displayed and entered_ (e.g. `4.7` vs `47`). Storage is unaffected either way — `level_progress.simple_rating`, `rating_scores`, and `progress_updates.enjoyment` are always integers on a 0–100 internal scale; the frontend converts at the display layer based on this preference. Set during onboarding, changeable anytime in Settings.

---

## Simple Mode

A single **0–10 score** per level. Stored in `level_progress.simple_rating`. No configuration required.

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

Switching modes preserves all data — a level has exactly one current rating, so there's no per-entry history to reconcile:

```
Simple → Weighted:
  simple_rating preserved, but no longer displayed/editable
  Per-category scores start blank until the user rates by category

Weighted → Simple:
  Per-category scores preserved, but no longer displayed/editable
  simple_rating starts blank until the user re-rates
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

| Context                             | Simple Mode                                                                                                          | Weighted Mode                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Completion entry card               | Single score badge                                                                                                   | Weighted average + breakdown on hover |
| Log list view                       | Score column                                                                                                         | Weighted average column               |
| Sorting                             | By simple_rating (see "The Canonical Rating Order")                                                                  | By computed weighted avg (same order) |
| No rating entered                   | Blank (not 0)                                                                                                        | Blank (not 0)                         |
| Non-completion entry (progress log) | Row hidden unless "show non-completions" toggle is on; the level's rating (if set) still shows normally when visible | Same                                  |

---

## The Canonical Rating Order

Sorting by rating is not just "highest first" — ratings tie, and three surfaces
have to agree on what happens then:

- the **Ranking** page (`/ranking`), whose row numbers _are_ the order,
- the **Log** page's `rating` sort column,
- the `rating_rank` field change the event log records on a `LOG_EDIT`, which is
  what lets the Events feed say "Up 43 in your ranking".

One comparator serves all three: `compareRatingOrder` in
`packages/core/src/ratingOrder.ts`. The chain, best first:

1. **Overall rating**, highest first.
2. **Enjoyment**, highest first. A genuinely separate signal — it is logged per
   event and excluded from the average unless the user opts in — so it breaks a
   tie rather than restating the first key.
3. **Date**, earliest first. A long-standing rating outranks one just added.
4. **Level id**, ascending. Arbitrary, but total.

A missing value sorts last within its own link, so an unrated or undated level
never displaces one that has the value.

**The order must be total.** `rating_rank` is the one figure in the event log
that cannot be recomputed afterwards — it depends on every other level's rating
at that instant, and nothing records those. An order that left ties unresolved
would make a logged rank depend on the row order Postgres happened to return.

Two consequences worth knowing:

- Sorting the Log page by rating **descending** reproduces the Ranking page's
  order exactly. Ascending is the exact reverse, except that unrated rows stay
  pinned to the bottom in both directions, as every other column's blanks do.
- A ranked position is only comparable inside one rating-config era. A weight
  change reshuffles every average and is deliberately not logged (see
  `EVENT_LOG.md`), so a rank recorded before a reweight was measured on a scale
  that no longer applies.

The Log page previously broke weighted-average ties by category score in
priority order. That was retired when the comparator was shared: it applied to
one surface only, and it is recoverable explicitly — the Log page's sort stack
accepts `cat:{categoryId}` keys, so a user who wants category ordering can add
it as a real secondary sort rather than receiving it invisibly.

---

## v2/v3 Ideas (Do Not Implement in v1)

- **Rating reference notes:** User-defined descriptions for each whole-number score per category (e.g. "A 7 in Decoration means polished but not innovative"). Gives ratings personal consistency over time
- **Public rating breakdowns:** Show per-category scores on public profiles (v3+)
- **Community rating aggregates:** Average enjoyment and ratings across all users for a level (v4, non-completion entries excluded from community averages)
