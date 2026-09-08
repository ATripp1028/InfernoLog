# InfernoLog — Rating System

## Overview

A level's rating is the **weighted average of the scores you give it in your own
rating categories**. There is one rating system — no modes to pick between, and
nothing to configure before you can rate something.

```
┌─────────────────────────────────────────────────┐
│              Weighted Average                   │
│                                                 │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  One category    │  │  Several categories │  │
│  │  (the default)   │  │                     │  │
│  │                  │  │  Gameplay   ████ 8  │  │
│  │  Overall  ███ 7  │  │  Decoration ██░░ 5  │  │
│  │           ────── │  │  Song       ███░ 7  │  │
│  │  Rating:     7   │  │             ─────── │  │
│  │                  │  │  Rating:       6.8  │  │
│  └──────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────┘
```

A new account is seeded with a single category, **Overall**, at the full weight.
Its average is one term, so the rating is just the number you typed — the
one-score-per-level experience, without a second system to maintain. Splitting
that into Gameplay/Decoration/Song, or anything else, is a settings change
rather than a mode switch.

Rating (`rating_scores`) is **one current set of values per level**, not per
logged event — it lives on `level_progress` and is editable from any
progress-editing surface (the completion flow, or the edit form for any entry),
not gated to completions specifically. `enjoyment` is the exception: it's logged
per-event on `progress_updates`, mirroring the GDDL's approach, since a
session's enjoyment can genuinely differ beat-to-beat in a way a level's overall
rating doesn't. Non-completion entries (and the enjoyment they carry) are hidden
unless the "show non-completions" toggle is active.

### Scales

The scale is fixed per field, matching the convention the GD community already uses. There is no user preference — one existed (`users.ratingDisplayScale`) and was removed, since a second unit for every figure only created a second way to read it wrong.

| Field                                                                          | Shown as                        |
| ------------------------------------------------------------------------------ | ------------------------------- |
| **Scores** — `rating_scores.score`, and the weighted average they combine into | **0–10 with decimals** (`7.5`)  |
| **Enjoyment** — `progress_updates.enjoyment`                                   | **0–100, whole numbers** (`85`) |
| **Category weights** — `rating_categories.weight`, `users.enjoyment_weight`    | **whole percents** (`34%`)      |

Storage is the same for the first two: always an integer on a 0–100 internal
scale. Weights are stored as a fraction of 1.00 in a `Decimal(5,2)`, so a whole
percent maps to a stored value exactly and the round trip is lossless.
`apps/web/src/lib/ratingScale.ts` is the only place any of that arithmetic
lives — `formatScore`/`toScoreDisplay`/`toScoreInternal` for scores,
`formatEnjoyment` (an identity) for enjoyment, and
`toWeightPercent`/`toWeightFraction`/`formatWeightPercent` for weights.

One consequence worth knowing: when a user opts enjoyment into the average
(`users.include_enjoyment`), the arithmetic runs on the internal scale, so an
enjoyment of 85 weighs exactly as much as a category score of 8.5.

---

## Categories

User-configurable, each scored 0–10, combined into a weighted average.
Configured wholesale by `PUT /v1/me/rating-config` — names, weights, and the
drag order that is also the tie-break priority.

### Defaults

A new account gets one category:

| Name    | Weight |
| ------- | ------ |
| Overall | 100%   |

### Rules

- **At least one category.** Every rating is an average of these, so an account
  with none could not rate anything at all. `PUT /v1/me/rating-config` rejects
  an empty list, and the settings editor blocks the save rather than blocking
  the delete — clearing the list to start over is a normal thing to do.
- **Active weights must total exactly 100%** — the categories, plus enjoyment
  when it is opted in. Validated in integer percents so floating point cannot
  drift a valid config into an invalid one.
- Categories can be added, renamed, reweighted, reordered and removed freely.
  Removing one deletes its `rating_scores` rows in the same transaction.
- The spreadsheet import is the one path that creates categories implicitly: an
  unrecognized column name is created **at weight 0**, which leaves the 100%
  total undisturbed. Set its weight in Settings afterwards.

### The formula

```
weighted_avg = Σ(score_i × weight_i) / Σ(weight_i)

Example:
  Gameplay:   8 × 0.50 = 4.00
  Decoration: 5 × 0.30 = 1.50
  Song:       7 × 0.20 = 1.40
                        ──────
  Sum:                    6.90
  Sum of weights:         1.00
  Weighted avg:           6.9
```

The division normalizes, so a category with no score on this level is omitted
rather than counted as zero — a half-rated level reads as the average of what it
actually has. When nothing contributes any weight the rating is **null**, not 0:
the level is unrated, not rated badly.

### Enjoyment as a rating component

Enjoyment (`progress_updates.enjoyment`) is a standalone field by default and is
**not included** in the weighted average unless the user opts in via
`users.include_enjoyment`. When opted in, it factors in with
`users.enjoyment_weight` and counts toward the 100% total.

---

## Data storage

Raw per-category scores are always stored. The weighted average is **computed at
query time** — never pre-computed and stored (`computeOverallRating` in
`packages/core/src/rating.ts`, shared by the API's serialization and the
frontend's pre-save previews so the two cannot drift). This means:

- Adjusting weights instantly recalculates every historical average
- No stale cached values to invalidate
- Adding or removing a category needs no data migration

A score whose category is no longer in the user's config is skipped by the
formula rather than removed — reachable via the importer's weight-0 categories
and a wholesale config replace.

---

## Display rules

| Context                             | Shown as                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Completion entry card               | Weighted average, with the per-category breakdown on hover                                  |
| Log list view                       | Weighted average column, plus an optional column per category                               |
| Sorting                             | By computed weighted average (see "The Canonical Rating Order")                             |
| No rating entered                   | Blank (not 0)                                                                               |
| Non-completion entry (progress log) | Row hidden unless "show non-completions" is on; the level's rating still shows when visible |

---

## The Canonical Rating Order

Sorting by rating is not just "highest first" — ratings tie, and three surfaces
have to agree on what happens then:

- the **Ranking** page (`/ranking`), whose row numbers _are_ the order,
- the **Log** page's `rating` sort column,
- the `rating_rank` field change the event log records on a `LOG_EDIT`, which is
  what lets the Events feed say "Up 43 in your ranking".

One comparator serves all three: `ratingOrderComparator` in
`packages/core/src/ratingOrder.ts`. The chain, best first:

1. **Overall rating**, highest first.
2. **Category scores**, highest first, each category taken in the user's own
   priority order (the drag order in the rating config editor, top =
   highest). The established convention for weighted ratings: two levels that
   average out the same are separated by the category the user cares most
   about. A score against a category the user no longer has does not count
   here, exactly as it does not count toward the average.
3. **Enjoyment**, highest first. A genuinely separate signal — it is logged per
   event and excluded from the average unless the user opts in — so it breaks a
   tie rather than restating the first key.
4. **Date**, earliest first. A long-standing rating outranks one just added.
5. **Level id**, ascending. Arbitrary, but total.

A missing value sorts last within its own link, so an unrated or undated level,
or one with no score in a given category, never displaces one that has the
value.

**The order must be total.** `rating_rank` is the one figure in the event log
that cannot be recomputed afterwards — it depends on every other level's rating
at that instant, and nothing records those. An order that left ties unresolved
would make a logged rank depend on the row order Postgres happened to return.

Two consequences worth knowing:

- Sorting the Log page by rating **descending** reproduces the Ranking page's
  order exactly. Ascending is the exact reverse, except that unrated rows stay
  pinned to the bottom in both directions, as every other column's blanks do.
- A ranked position is only comparable inside one rating-config era. Weights,
  category priority and the set of categories all feed this order, so any
  config change reshuffles it — and a reweight is deliberately not logged (see
  `EVENT_LOG.md`). A rank recorded before such a change was measured on a scale
  that no longer applies. Reordering categories is itself a
  `RATING_CONFIG_CHANGE`, since `sortOrder` is part of the logged config.

The category link used to live on the Log page alone, applied after its rating
sort rather than as part of any shared definition — which is exactly why the
three surfaces could disagree. Folding it into the canonical chain keeps the
weighted convention and makes the Ranking page and `rating_rank` observe it too.

---

## v2/v3 Ideas (Do Not Implement in v1)

- **Rating reference notes:** User-defined descriptions for each whole-number score per category (e.g. "A 7 in Decoration means polished but not innovative"). Gives ratings personal consistency over time
- **Public rating breakdowns:** Show per-category scores on public profiles (v3+)
- **Community rating aggregates:** Average enjoyment and ratings across all users for a level (v4, non-completion entries excluded from community averages)
