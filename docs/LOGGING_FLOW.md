# InfernoLog — Logging Flow

This document specifies the FAB-triggered logging flow: the multi-step modal a user
moves through to log a completion, log progress, or drop a level, plus the two
lightweight list-management workflows that share the same entry point.

It supersedes the "Logging Flow" section of `LEVEL_LOGGING.md` and intersects with
`RANKING_SYSTEM.md` (placement) and `DESIGN_LANGUAGE.md` (the FAB, modal, thumbnail
treatment). Where this document and those disagree, this document is the newer decision —
see `LOGGING_FLOW_RECONCILIATION.md` for the specific contradictions to resolve.

---

## Entry Point: Path Selection at the FAB

The path is chosen **before** the modal opens, as a FAB menu item — not as a "step zero"
inside the modal. The user has already formed their intent by the time they tap the FAB
(they just beat a level, got a new best, or rage-quit), so making them re-declare it inside
the flow is redundant friction.

The FAB menu contains five items, the three logging actions grouped above a divider from
the two list actions:

```
[ ✓  Log a completion ]   ← primary
[ ⚑  Log progress      ]
[ ✕  Drop a level      ]
───────────────────────
[ ☆  Add to Want to Beat ]
[ ≣  Add to a list        ]
```

Because the path is known before the modal opens, each path's modal is purpose-built
rather than a generic form with irrelevant fields greyed out, and the progress bar is a
clean linear representation of that path's specific steps from the start.

---

## Modal Shape

- **Desktop:** centered modal, ~760px wide, ~84% viewport height (≈786px), over a dimmed
  page scrim.
- **Mobile:** full-screen sheet. (Mobile layout is a separate design task; not yet built.)

The modal is a multi-step wizard with a fixed header (path eyebrow + step title + progress
bar + sticky level identity strip), a scrollable body for the active step's fields, and a
footer (Back / Continue).

### Progress Bar

Modeled on Indeed's job-application progress bar: each step advances the bar on engagement,
with **unequal step weighting** and **recalculation per path** (completion is the longest
path, drop the shortest — Option A: the bar means "how far through *this* path"). The bar
advances when the user engages a section, not on individual keystrokes, and not on filling
every optional field. Exact per-step weights are deferred until the flow is instrumented;
they are a runtime-tuned value, not a design-time constant.

### Sticky Level Identity Header

Once a level is resolved, a sticky strip pins the level's identity (name, creator, song,
difficulty face, a "Change" link) across every subsequent step. The header has two states:

- **Pre-resolution** (entry/search steps): path eyebrow + step title only — no level exists
  yet, so there is nothing to pin.
- **Post-resolution** (all later steps): path eyebrow + step title + the level identity strip.

### Full-Modal Thumbnail Background

Once a level is resolved, the level's **thumbnail fills the entire modal background**,
behind a flat `#0d0d0d` scrim at ~88% opacity. Form chrome (header, body, footer) is
transparent so the backdrop reads through; input boxes use a frosted translucent fill
(white ~8%, border white ~18%) for legibility.

- The scrim is **fixed, not adaptive.** Brightness is not measured at runtime (the thumbnail
  is loaded via a constructed-URL `<img>` tag per `EXTERNAL_APIS.md`, which yields only the
  image — and measuring luminance client-side would require canvas pixel access and permissive
  CORS from levelthumbs, which conflicts with the hotlinking decision). A fixed heavy scrim
  dominates rather than adapts: it flattens the brightest worst-case thumbnail and the darkest
  one to roughly the same readable tint.
- 88% was validated readable across Bloodbath (mid), Clubstep (bright), Boobawamba (dark),
  and Audio Extraction (very bright). It is the one knob to revisit if real thumbnails read
  too heavy or too light in the running app.
- Because the modal background now carries the thumbnail, the old small thumbnail placeholder
  in the level strip is removed; the strip is identity + difficulty face + Change link only.

### Discard Guard

Closing the modal at any point **after the level is confirmed** prompts a "Discard this log?"
confirmation. The Level ID is the first effort the user must invest, so the guard arms at the
moment the level is confirmed, not at first field entry.

---

## Level Entry: One Field, ID or Name

A single text field accepts **either** a level ID **or** a level name, disambiguated by
content:

- Input is **all digits, no whitespace/letters/symbols** (`^\d+$`) → treated as an **ID lookup**.
- Input contains **anything else** → treated as a **name search**.

This is safe because GD level names cannot be purely numeric (the game requires at least one
non-digit), so e.g. "2 1 1" by SrGuillester is correctly treated as a name search, not an ID —
avoiding the in-game search's annoyance of trying to ID-match numeric names.

### Name Search Resolves Against InfernoLog's Own Cache

Name search queries **InfernoLog's `levels` cache**, not GD's / GDBrowser's live search.

- **Why:** controls the result set and its semantics (no thousands of "Bloodbath" startpos
  copies), costs nothing externally (no rate limits, no dependency on GDBrowser uptime), is
  trivially fast (local Postgres query — can afford live-as-you-type), and compounds with
  adoption (every ID anyone logs enriches the shared cache for everyone).
- **Cold-start cost (accepted):** a level is only name-searchable after its first log by any
  user. The graceful fallback: name search hits the cache, and if the level isn't found, the
  field still accepts a raw ID → routes through GDBrowser autofill → **populates the cache**,
  making it name-findable next time. ID entry is the seeding mechanism for the search index,
  not a worse parallel path.
- **Implementation notes:** prefer a `pg_trgm` GIN index on `name` over plain `ILIKE` for
  fuzzy/typo tolerance (GD names are full of stylized spellings); Neon supports the extension.
  Always show creator + difficulty + ID in results to disambiguate same-name / reupload cases.
  Cache the levels users *select*, not query responses.

### Autofill

On a resolved level ID: GDBrowser (name, creator, song, length) → if rated, GDDL (suggested
tier, confirmed/overridden by user) → levelthumbs thumbnail (best-effort, silent fallback).
GDBrowser unavailability never blocks the flow; the user proceeds with manual entry.

Progress does not begin until metadata is entered; data captured after that point can be
back-filled against the resolved level.

**Manual metadata entry (auto-fallback only).** When GDBrowser fails or returns nothing
(down/timed out, or an unrated/brand-new level), the flow falls back to a manual entry view.
This is **auto-fallback only** — there is no "enter manually" escape hatch in the happy path,
and the view never appears when autofill succeeds. It reuses the entry-step shell (no level
strip yet, since the level isn't confirmed) with a non-blocking notice ("Couldn't reach
GDBrowser — enter the details, we'll verify and backfill automatically later") above the fields
GDBrowser would normally provide, now manual: level ID (read-only, carried from the user's
entry), level name, creator, in-game difficulty, song name, song author, length.

The difficulty picker here is the one exception to "in-game difficulty is always cached and
read-only": with no cached value to defer to, **the difficulty the user picks becomes the
in-game difficulty**, stored as manual-sourced/unverified so a later GDBrowser sync can
backfill/verify it. It uses the full objective-rating selector ("Not a demon" + Easy / Medium /
Hard / Insane / Extreme) — the level's rating, distinct from the difficulty-*opinion* selector
on the completion Core step.

---

## Scope Stance: Demon-Focused, Not Demon-Locked

InfernoLog is built for demon completions and remains so. But logging a non-demon is **not
hard-blocked** — a hard validation wall buys little (reliable demon detection, reupload/rating
edge cases, "why won't it let me log this?" support burden) over a soft treatment.

- On autofill, a non-demon level (GDBrowser returns difficulty) surfaces a **soft-gate notice**:
  an inline warning banner ("This isn't a demon — InfernoLog is built for demon tracking, but
  you can still log it. It won't appear in your difficulty ranking by default."). It informs;
  it does not block.
- Non-demons are logged and kept in history but treated as second-class for demon-specific
  apparatus (excluded from the difficulty ranking by default). This reuses the existing
  unrated-level treatment and costs almost nothing.
- The previously-default behavior — silent acceptance with full equal treatment — is the one
  genuinely wrong option, because it lets the difficulty ranking fill with levels it wasn't
  designed for, with no signal to the user.

---

## The Three Logging Paths

Field steps are presented in order with a shared **"Session Details"** catch-all near the end,
then a **Review** step. (Renamed from "miscellaneous": every field in that step describes the
*session/run*, not the level, so "Session Details" is more accurate. Used on both completion
and progress paths.) Fields in Session Details are grouped by input type (stats / flags / media
/ notes). Fields where the implication isn't obvious carry a hover **info button** (date,
attempts, run range, FPS) — not every field, to avoid noise.

### Completion Path

`Level entry → Core (The basics) → Rating & enjoyment → List references → Session Details → Review → [post-submit] Place in ranking?`

- **Core ("The basics") is Date + Attempts + the difficulty-opinion selector.** A completion is,
  by definition, a 0→100 run, so **percentage is omitted (100% implied)** and **run range is
  omitted entirely** (there is nothing to log — the range is always 0→100). The uncertain-date
  toggle sits directly under the date input and appears only when a date is present.
- **Difficulty opinion** (see "Two Difficulty Concepts" below) is the user's own read of how hard
  the level was, picked from a pill selector: **Not demon-worthy** (placed *first*, left of the
  demon tiers — that's where the eye goes when someone wants to dispute an overrated easy demon),
  then **Easy / Medium / Hard / Insane / Extreme**. "Demon" is implied on the five tiers. The
  cached in-game difficulty is shown read-only beside the selector for contrast.
- **Rating** forks on the user's mode: simple (single 0–10) or weighted (per-category sliders
  with a computed weighted average). Enjoyment is a standalone slider; it needs no "how much fun?"
  caption — users understand enjoyment.
- **List references** are GDDL tier, AREDL rank, NLW tier. They are **genuine data the user may
  want on record**, which *additionally* serve as a convenience for initial ranking placement —
  not merely a placement convenience. Optional. **AREDL rank only appears for extreme demons**
  (AREDL = All Rated Extreme Demons List — it lists extreme demons only), keyed off the level's
  cached rated difficulty. GDDL record submission + accepted-flag toggles appear here only when a
  GDDL key is configured. (Pointercrate is cut from v1 — see `LOGGING_FLOW_RECONCILIATION.md`.)
- **One completion per level per user in v1**, and it is **edit, not replace.** If a completion
  already exists for the level, "Log a completion" routes the user to **edit the existing
  completion** rather than create or overwrite a second one. (A small inline note — "You've already
  completed this — editing your existing completion" — smooths the redirect.) No second-completion
  warning/replace gate. Rebeat handling remains a v3 feature.

### Two Difficulty Concepts (in-game vs. opinion)

These are **two separate fields**, never conflated:

- **In-game difficulty** is the level's actual rating, **cached from GDBrowser** (e.g. "Insane
  Demon"). It is objective and **read-only** — displayed, never picked. It appears as a small
  chip beside the difficulty-opinion selector and as an "In-game difficulty" row on the Review
  step.
- **Difficulty opinion** is the user's **own subjective read**, stored independently and fully
  editable. It is the pill selector on the Core step, with values **Not demon-worthy / Easy /
  Medium / Hard / Insane / Extreme**. "Not demon-worthy" handles the common case of beating an
  easy demon the user thinks shouldn't be rated a demon at all; it sits first (left of Easy)
  because that's where attention lands when someone wants to dispute an overrated easy demon.

Showing the two side by side is the entire point: the user is stating where they *disagree* with
the in-game rating. A "Not demon-worthy" opinion is a disagreement only — the level is still a
rated demon and stays in the difficulty ranking unless the user removes it; this is distinct from
the non-demon **soft gate** above (which fires when GDBrowser reports the level isn't a demon at
all).



`Level entry → Core (Where are you at?) → Session Details → Review`

- No rating, no list references, no ranking placement — those are completion-time concerns.
  (Enjoyment may live in Session Details for players who rate mid-attempt.)
- Core includes a **"From 0%" / "From a run" segmented multiselect** (segmented control, not a
  toggle — a toggle implies presence/absence, which is semantically wrong here; the two are equal
  modes). "From 0%" shows a single **Best progress** field (a run from the start of the level is
  **0%**, not 1%). "From a run" shows two fields for a segment (e.g. 30% → 63%). Playing from 0 is
  categorically different from running a segment, which justifies the mild redundancy.

### Drop Path (single screen)

`Level entry → Drop screen → Review`

- No Session Details step (it would hold only notes + privacy — too thin to justify a step).
- The single screen holds: date dropped, **attempts (optional)**, reason (optional),
  keep-private toggle. Attempts on a drop is optional but encouraged — it puts the eventual
  completion's attempt count in perspective if the level is later beaten.
- Styled with the danger color; CTA "Drop level". The level's progress history stays intact —
  drop is a `status` transition, not a deletion.

---

## Ranking Placement (post-submit, completion only)

After a completion is submitted, a compact confirm modal asks **"Place in ranking now?"**

- **There is no auto-placement.** (This is the key change from `RANKING_SYSTEM.md`.) Every
  completion starts **unplaced**; the user places all of them manually. A list reference is purely
  a convenience that sets the **starting scroll position** in the placement view — it does not place
  the level.
- **Place now:** opens the ranking. With a list reference, the view is pre-scrolled to the matching
  tier spot (highest match, or just above the closest under). Without a reference, the view opens at
  the top and the user scrolls to place. Either way, placement is manual; **no list reference is
  required to place.**
- **Place later:** the completion goes to the **Unplaced** side panel until the user places it.
  The Unplaced panel is only ever reached by the user *choosing* to skip — no completion is ever
  *forced* unplaced.
- Because placement is fully manual and reference-only-for-convenience, **cross-list conflict
  handling is eliminated.** Difficulty consistency is left to the user, who rates their own
  completions.

---

## List-Management Workflows (shared FAB entry, not logging)

These are lightweight add-a-level actions — single-purpose modals, not multi-step forms. They
share the same cache-backed ID/name search as the logging flow's entry step. They use a plain
dark surface (no thumbnail background — at the point of *adding*, the user is still searching and
may not have a level selected yet).

### Add to Want to Beat

Search → pick a level → one CTA to add. **No `level_progress` entry is created** (Want to Beat is
list membership, not progress). Want to Beat feeds the Level Picker's Personal Mode (v2).

### Add to a List

Search → confirm the level (shown as a chip with a Change link) → **multi-select** across built-in
lists (Want to Beat, Favorites, Least Favorites) and custom lists, with a "Create a new list"
affordance. Favorites notes the optional GDDL sync. A level can land in several lists at once
(the distinguishing feature vs. the single-purpose Want to Beat flow). CTA counts the selection
("Add to 2 lists").

---

## Field Reference (by path)

| Field | Completion | Progress | Drop |
|---|---|---|---|
| Level ID / name (entry) | ✓ required | ✓ required | ✓ required |
| Percentage | — (100% implied) | — (use Best progress) | — |
| Best progress | — | ✓ ("From 0%" mode) | — |
| Run segment (from → to) | — (always 0→100) | ✓ ("From a run" mode) | — |
| Date (+ uncertain toggle) | ✓ | ✓ | ✓ (date dropped) |
| Attempts | ✓ | ✓ | ✓ (optional) |
| In-game difficulty (cached, read-only) | ✓ shown | — | — |
| Difficulty opinion (Not demon-worthy / Easy…Extreme) | ✓ | — | — |
| Rating (simple/weighted) | ✓ | Session Details | — |
| Enjoyment | ✓ | Session Details | — |
| List references (GDDL, AREDL, NLW) | ✓ | — | — |
| AREDL rank | ✓ (extreme demons only) | — | — |
| GDDL record submit/accepted | ✓ (if key) | — | — |
| FPS | Session Details | Session Details | — |
| On stream | Session Details | Session Details | — |
| Completion video URL | Session Details | — | — |
| Highlight URL | Session Details | Session Details | — |
| Notes | Session Details | Session Details | ✓ (reason) |
| Per-entry privacy | Session Details | Session Details | ✓ |

Attempt count remains cumulative-across-all-copies (honor system, tooltip). A user-level
**default FPS** setting lives alongside the existing user preferences (date format, rating mode)
and pre-fills the FPS field.

---

## Open / Deferred

- Progress-bar per-step weights — tuned at runtime after instrumenting the flow.
- Mobile (full-screen sheet) layout for the entire flow — separate design task.
- Whether the list-management workflows should adopt the thumbnail background once a level is
  selected (currently plain dark surface throughout).
- Difficulty faces and thumbnails in the mockups are placeholders; real GD assets drop in at
  implementation.