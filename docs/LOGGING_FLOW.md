# InfernoLog — Logging Flow

This document describes the FAB-triggered logging flow: the multi-step modal a user
moves through to log a completion, log progress, or drop a level. The code is
`apps/web/src/features/logging/`.

It intersects with `DEMON_LIST.md` (placement) and `DESIGN_LANGUAGE.md` (the FAB, modal,
thumbnail treatment). The rules for what a logged event does to a level's status, and for
progress on a beaten level, are in `LEVEL_LOGGING.md`.

---

## Entry Point: Path Selection at the FAB

The path is chosen **before** the modal opens, as a FAB menu item — not as a "step zero"
inside the modal. The user has already formed their intent by the time they tap the FAB
(they just beat a level, got a new best, or rage-quit), so making them re-declare it inside
the flow is redundant friction.

The FAB menu contains five items (`loggingActions.ts`). The first is the primary action:

```
[ ✓  Log a completion ]   ← primary
[ ⚑  Log progress      ]
[ ✕  Drop a level      ]
[ ☆  Add to Want to Beat ]
[ ≣  Add to a Collection ]
```

**Only the three logging actions do anything.** The two collection items are present in the
menu but have no workflow behind them; choosing one is a no-op. Levels are added to
collections from the Collections pages instead.

Because the path is known before the modal opens, each path's modal is purpose-built
rather than a generic form with irrelevant fields greyed out, and the progress bar is a
clean linear representation of that path's specific steps from the start.

Pages can replace the default action set. A level's own page, for example, drops "Log
progress" once the level is beaten (see `LEVEL_LOGGING.md` → "Progress on a beaten level").

---

## Modal Shape

- **Desktop:** centered panel, 760px wide and 640px tall, over a dimmed and blurred scrim.
- **Mobile:** full-screen, sliding up from the bottom.
- **After a completion saves**, the follow-up cards ("Submit to GDDL?", "Place it now?") are a
  small 420px card on desktop and a bottom sheet on mobile.

The modal is a multi-step wizard with a fixed header (path eyebrow + step title + progress
bar), the level identity strip at the top of each step's body, a scrollable body for the
active step's fields, and a footer (Back / Continue).

### Progress Bar

The bar means "how far through _this_ path". Steps are weighted equally within a path: the
completion path's four steps fill it a quarter at a time, the progress path's two steps a half
at a time, and the drop screen fills it outright. The level-entry step shows a small starting
sliver. The eyebrow above the title carries the same position in words ("Step 2 of 4").

### Level Identity Strip

Once a level is resolved, a strip at the top of each step shows the level's identity (name,
creator, song, difficulty face) with a "Change" link back to level entry. Before a level is
resolved — the entry, loading, and manual-entry steps — the header is just the path eyebrow and
step title.

### Full-Modal Thumbnail Background

Once a level is resolved, the level's **thumbnail fills the entire modal background**,
behind a flat scrim of the base background colour at 85% opacity. Inputs use a translucent
fill so the backdrop reads through without costing legibility. If the thumbnail fails to load
it is hidden and the plain surface shows.

The scrim is **fixed, not adaptive.** Brightness is not measured at runtime: the thumbnail
is loaded via a constructed-URL `<img>` tag per `EXTERNAL_APIS.md`, which yields only the
image, and measuring luminance client-side would require canvas pixel access and permissive
CORS from levelthumbs. A fixed heavy scrim dominates rather than adapts: it flattens the
brightest thumbnail and the darkest one to roughly the same readable tint. The opacity is the
one knob to revisit if thumbnails read too heavy or too light.

### Discard Guard

Closing the modal at any point **after level entry** prompts a "Discard this log?"
confirmation, and a click outside the modal does nothing. Finding the level is the first
effort the user invests, so the guard arms once they are past it. While a save is in flight
the modal cannot be closed at all. The post-save cards are not guarded — the completion is
already written.

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

Name search queries **InfernoLog's `levels` cache**, not GD's live search.

- **Why:** controls the result set and its semantics (no thousands of "Bloodbath" startpos
  copies), costs nothing externally (no rate limits, no dependency on the GD servers' uptime), is
  trivially fast (local Postgres query — can afford live-as-you-type), and compounds with
  adoption (every ID anyone logs enriches the shared cache for everyone).
- **Cold-start cost (mitigated):** a level enters the cache the first time anyone logs it, IDs
  it, or reaches it via the **GD-server search escalation** (see below). Before then, name search
  simply won't surface it — but two graceful fallbacks close the gap: the field still accepts a
  raw ID → routes through GD-servers autofill → **populates the cache**; and when a name search
  under-delivers, the user can opt in to a one-request GD-server name search that seeds the rated
  matches automatically (and an unrated one if they pick it). **ID entry is also the only way in
  for an unrated level whose voted face isn't a demon one**, since the escalation asks GD for
  demons only.
- **GD-server search escalation (opt-in):** offered under a cache name search (here, the toolbar,
  and collections add) when the cache comes up short — on zero results and on partial hits alike.
  It fires only on **explicit confirmation**, never on keystroke, and each subsequent search
  needs its own confirm. One `getGJLevels21` name query, always scoped to GD's Demon difficulty
  bucket (`diff=-2`) so a rated non-demon never comes back to be refused; levels already cached
  are omitted; rated results are grouped first and seeded automatically, unrated are dimmed and
  seeded only if selected. A level outside that bucket has to be added by its ID. A
  dedupe-emptied result set is a distinct "nothing new" state, separate from a retryable request
  failure. Backend: `services/levels/gdSearch.ts` + `GET /v1/levels/gd-search`.
- **How it matches:** a `pg_trgm` index on `name`, combining substring and similarity matching
  for typo tolerance (GD names are full of stylized spellings). Results always show creator,
  difficulty and ID to disambiguate same-name and reupload cases.

### Autofill

On a resolved level ID: the cache answers if it holds the level; otherwise the GD servers supply
name, creator, song, length and difficulty, and the level is cached. The level's community GDDL
tier, when it has one, is carried forward to pre-fill the user's own tier later in the flow.
The thumbnail comes from levelthumbs (best-effort, silent fallback). GD-server unavailability
never blocks the flow; the user proceeds with manual entry.

A level being **edited** skips entry: the flow opens on a brief loading step that resolves the
level and pre-fills the form from the existing completion.

**Manual metadata entry (auto-fallback only).** When the GD-servers fetch fails or GD has no such
level, the flow falls back to a manual entry view. This is **auto-fallback only** — there is no
"enter manually" escape hatch in the happy path, and the view never appears when autofill
succeeds. It reuses the entry-step shell (no level strip yet, since the level isn't confirmed)
and asks for the fields the servers would normally provide: level ID (carried from the user's
entry), level name, creator, in-game difficulty, song name, song author, length.

The difficulty picker here is the one exception to "in-game difficulty is always cached and
read-only": with no cached value to defer to, **the difficulty the user picks becomes the
in-game difficulty**, stored as manual-sourced and unverified; the level-cache sync replaces it
the first time GD returns the level. It offers the five demon tiers plus an "unrated" checkbox —
nothing else is a level this cache admits — and the API derives `isDemon`/`isRated` from the
choice rather than taking them from the client. This is the level's rating, distinct from the
difficulty-_opinion_ selector on the completion path.

---

## Scope Stance: Demons and Unrated Levels Only

InfernoLog tracks demons. A **rated non-demon is refused**, and the refusal happens in one place:
the shared `levels` cache never admits one (`services/levels/admission.ts`). Progress, collection
entries and demon list placements all reference `levels` by foreign key, so a level that cannot be
cached cannot be logged, collected or ranked — no write path needs a check of its own.

- **Unrated levels are fully supported.** GD has not decided what they are, and the hardest levels
  in the game spend time unrated before they are rated. An unrated level is admitted whatever face
  its player votes gave it.
- **Where the refusal surfaces.** Resolving one in the logging flow (or opening its Global Level
  Page) answers `422 { reason: 'not_a_demon' }` and caches nothing; the client names the level and
  what GD rates it. GD search asks only for demons, so one rarely comes back at all. A spreadsheet
  row naming one fails that row. Manual entry cannot express one: the form offers the five demon
  tiers and "Unrated".
- **Two cases still exist in the cache, and nothing accommodates them.** A demon GD later
  **demotes** stays, and keeps working for whoever logged it — removing it would take their data.
  An unrated level GD later rates as a non-demon is **purged unless something references it**. No
  filter, sort or copy is built for either.
- **Why it is strict.** Allowing non-demons would mean carrying two difficulty scales side by
  side — see "Two Difficulty Concepts" below — which costs more to maintain and to use than the
  capability is worth.

---

## The Three Logging Paths

Each path ends its field steps with a **"Session details"** step — every field in it describes
the _session/run_, not the level. Its fields are grouped by kind (stats / flags / media / notes).
Fields whose implication isn't obvious carry a short hint.

### Completion Path

`Level entry → The basics → How was it? → Session details → List references → Review → [Submit to GDDL?] → Place it now?`

- **"The basics" is date, attempts, worst fail, and the difficulty-opinion selector**, plus coins
  and 2-player details for levels that have them, and which game version's percentage system the
  worst fail is in. A completion is, by definition, a 0→100 run, so **percentage is omitted (100%
  implied)** and **run range is omitted entirely**. The uncertain-date toggle sits with the date.
  A new entry is seeded with the current date and time; the time can be cleared to log a bare date.
- **Worst fail** has an "already logged" option that keeps the stored value, for a level the user
  logged progress or a drop on earlier.
- **Difficulty opinion** (see "Two Difficulty Concepts" below) is the user's own read of how hard
  the level was, picked from a pill selector: **Not demon-worthy** (placed _first_, left of the
  demon tiers — that's where the eye goes when someone wants to dispute an overrated easy demon),
  then **Easy / Medium / Hard / Insane / Extreme**. "Demon" is implied on the five tiers.
- **"How was it?"** is one 0–10 slider per rating category, with the computed weighted average
  shown above them. A new account has a single category, "Overall", so this is one slider until
  the user splits it up. Enjoyment is a standalone slider.
- **"Session details"** holds FPS and device, the on-stream and keep-private flags, the completion
  video URL, a highlight URL (hidden when the user has turned that field off in Settings), and
  notes.
- **"List references" is one field: the user's own GDDL tier.** It is pre-filled from the level's
  community tier, which is also shown as a hint beside it. The level's AREDL rank and sheet tier
  are not entered — they are properties of the level (see `LIST_INTEGRATIONS.md`).
- **Review** summarises the entry, including the read-only in-game difficulty, and saves it.
- **"Submit to GDDL?"** appears after the save, only for a user with a GDDL key connected. It is
  skippable, and the same action stays available from the level's page.
- **One completion per level per user**, and it is **edit, not replace.** If a completion already
  exists for the level, "Log a completion" opens it for editing rather than creating or
  overwriting a second one.

### Two Difficulty Concepts (in-game vs. opinion)

These are **two separate fields**, never conflated:

- **In-game difficulty** is the level's actual rating, **cached from the GD servers** (e.g. "Insane
  Demon"). It is objective and **read-only** — displayed, never picked. It appears as a small
  chip beside the difficulty-opinion selector and as an "In-game difficulty" row on the Review
  step.

  Every rated level the cache holds is a demon, and GD awards every demon 10 stars, so the label
  is the whole of it: there is no star count to reconcile it against. `Level.stars` and
  `Level.starsRequested` were dropped on 2026-09-16, along with the rule that made the count
  canonical for a non-demon and the official-level exemption to it. Read `inGameDifficulty`
  directly.

  An **unrated** level can still carry a non-demon face: RobTop derives one from player votes. So
  "Harder" is a difficulty the cache can hold — on an unrated level, and on a demoted demon. It is
  not a difficulty anything offers as a choice.

- **Difficulty opinion** is the user's **own subjective read**, stored independently and fully
  editable. It is the pill selector on the Core step, with values **Not demon-worthy / Easy /
  Medium / Hard / Insane / Extreme**. It handles the common case of beating an easy demon the user
  thinks shouldn't be rated a demon at all; "Not demon-worthy" sits first (left of Easy) because
  that's where attention lands when someone wants to dispute an overrated easy demon.

  Until 2026-09-16 that answer carried a star count of its own (`AUTO`…`NINE_STAR`) saying which
  non-demon difficulty the user would have awarded. The values were collapsed into a single
  `NOT_DEMON_WORTHY` — see the `collapse_not_demon_worthy` migration, which is deliberately lossy.

Showing the two side by side is the entire point: the user is stating where they _disagree_ with
the in-game rating. A "Not demon-worthy" opinion is a disagreement only — the level is still a
rated demon unless GD says otherwise. It does not affect demon list eligibility; nothing does, beyond
being a completed classic level.

### Progress Path

`Level entry → Where are you at? → Session details`

- No rating, no GDDL tier, no placement — those are completion-time concerns. There is no review
  step; the second step saves.
- "Where are you at?" has a **"From 0%" / "From a run" segmented control** (not a toggle — a
  toggle implies presence/absence, and the two are equal modes). "From 0%" shows a single **best
  progress** field. "From a run" shows two fields for a segment (e.g. 30% → 63%); a run from the
  start of the level is **0%**, not 1%. Playing from 0 is categorically different from running a
  segment, which justifies the mild redundancy. The step also holds date, attempts, and the
  percentage version.
- "Session details" holds FPS, device, enjoyment (for players who rate mid-attempt), the
  on-stream and keep-private flags, and notes.

### Drop Path (single screen)

`Level entry → Dropping this one`

- One screen, no session step and no review: date dropped, **attempts (optional)**, worst fail,
  reason (optional), keep-private toggle. Attempts on a drop is optional but encouraged — it puts
  the eventual completion's attempt count in perspective if the level is later beaten.
- The level's progress history stays intact — a drop is its own progress update (same as a
  completion or session log — see the `ProgressUpdate` model in `schema.prisma`), not a deletion,
  and a level can be dropped more than once without losing earlier drops' dates/reasons.

---

## Ranking Placement (post-submit, completion only)

The last card of the completion path asks whether to place the level on the demon list now.

- **There is no auto-placement.** Every completion starts **unplaced**; the user places all of
  them manually. The level's community GDDL tier is purely a convenience that sets the
  **starting scroll position** on the demon list — it does not place the level.
- **Place now:** opens the demon list with the new completion highlighted in the Unplaced panel
  and the placed list scrolled to where the tier suggests. Without a tier it opens at the top.
  Either way the user drags it into place; **no tier is required to place.**
- **Place later:** closes the flow. The completion stays in the **Unplaced** panel until the user
  places it.
- Because placement is fully manual and the tier is only a scroll hint, there is **no cross-list
  conflict handling.** Difficulty consistency is left to the user.

See `DEMON_LIST.md` → "Placing a Fresh Completion".

---

## Field Reference (by path)

| Field                                                | Completion                   | Progress              | Drop             |
| ---------------------------------------------------- | ---------------------------- | --------------------- | ---------------- |
| Level ID / name (entry)                              | ✓ required                   | ✓ required            | ✓ required       |
| Best progress                                        | — (100% implied)             | ✓ ("From 0%" mode)    | —                |
| Run segment (from → to)                              | — (always 0→100)             | ✓ ("From a run" mode) | —                |
| Percentage version                                   | ✓                            | ✓                     | —                |
| Date (+ time, uncertain toggle)                      | ✓                            | ✓                     | ✓ (date dropped) |
| Attempts                                             | ✓                            | ✓                     | ✓ (optional)     |
| Worst fail                                           | ✓                            | —                     | ✓                |
| Coins / 2-player                                     | ✓ (when the level has them)  | —                     | —                |
| In-game difficulty (cached, read-only)               | ✓ shown                      | —                     | —                |
| Difficulty opinion (Not demon-worthy / Easy…Extreme) | ✓                            | —                     | —                |
| Rating (per category)                                | ✓                            | —                     | —                |
| Enjoyment                                            | ✓                            | Session details       | —                |
| GDDL tier (your opinion)                             | ✓                            | —                     | —                |
| FPS / device                                         | Session details              | Session details       | —                |
| On stream                                            | Session details              | Session details       | —                |
| Completion video URL                                 | Session details              | —                     | —                |
| Highlight URL                                        | Session details (if enabled) | —                     | —                |
| Notes                                                | Session details              | Session details       | ✓ (reason)       |
| Per-entry privacy                                    | Session details              | Session details       | ✓                |
| GDDL record submission                               | After saving (if key)        | —                     | —                |

Attempt count is cumulative across all copies (honor system, stated in a hint). User-level
defaults for **FPS**, **device** and **percentage version** live with the other preferences in
Settings and pre-fill those fields.
