# InfernoLog — Terminology

This document defines the canonical terms used throughout InfernoLog's codebase, documentation, and UI. AI tools and developers should use these terms consistently and never use them interchangeably.

---

## Core Concepts

**Level Progress**
The parent record grouping all progress entries for a single level for a single user. Has a status: `IN_PROGRESS`, `DROPPED`, or `COMPLETED`. Created when the user logs their first progress entry for a level. One per user per level.

**Progress Entry**
A single logged data point for a level at a specific point in time. Contains percentage, attempts, date, notes, ratings, and any other fields the user chooses to log. Multiple progress entries exist per Level Progress. The fundamental unit of logging in InfernoLog.

**Completion**
A progress entry marked `kind = completion`. The canonical beat of a level. Only completion entries appear in the Log and on the demon list by default. At most one per Level Progress in v1.

**In Progress**
A level the user is actively attempting. A Level Progress with status `IN_PROGRESS` and no completion entry. Appears in the In Progress section of the app.

**Dropped**
A level the user has stopped playing without beating. A Level Progress with status `DROPPED`. The full progress history is preserved.

**Unranked**
A completion carrying no rating of the user's own, so it holds no position on the Ranking. Counted and shown as a total on that page, never ordered last.

**Unplaced**
A completion the user has not placed on their demon list. Lives in the Unplaced panel until they place it — reached only by choosing "Place later", never forced.

**Unrated**
Reserved for the **in-game** sense: a level RobTop has not given stars to (`Level.isRated`). Never use it for a level the user has not rated or placed — say "unranked" or "unplaced" instead. An in-game-unrated level can be ranked and placed like any other, which is exactly why the senses must not be mixed; the demon list's "Show unrated" toggle is the in-game sense.

**Record**
A completion submitted to and accepted by a ranking authority (GDDL, Pointercrate, AREDL, etc.). Distinct from a completion — a player can have a completion without an accepted record.

**NONG**
Not On NewGrounds. A level that uses a song the player must source and install manually, rather than the game downloading it automatically from Newgrounds. The level still has a Newgrounds song ID in-game, but the intended song is different.

---

## Views

**The Log**
The user's primary view of their demon history. A collection of their Level Progress entries, showing completions by default, sortable by any metric. Default sort is by quality (rating). Route `/log`. Not called "My Demons" — that implies levels the user created.

**The Events feed**
A chronological feed of all changes made in the app. Purely time-ordered — not sortable by other metrics. Records actions such as logging a progress entry, updating a rating, reordering the demon list, etc. Route `/events`. Backed by the `activity_log` table, which keeps its name — "event log" is the data, "Events" is the page.

**My Demon List**
The user's personal difficulty ordering of their completed levels, arranged manually via drag-and-drop. Independent of any official list tier or rating. Only completion entries appear here by default. Route `/demon-list`.

**Always possessive in UI copy** — "my demon list", "your demon list", "Alex's demon list". Never "the Demon List": with the definite article it reads as Pointercrate's list rather than the user's own. The possessive also carries over unchanged to public profiles, where another user's page shows "Alex's demon list".

**The Ranking**
The user's completed levels ordered by rating, highest first, every entry numbered. Derived from the rating in SIMPLE and WEIGHTED modes and stored directly in MANUAL mode. Route `/ranking`. Distinct from the demon list, which orders by difficulty rather than quality.

**The Level Page**
The full page for a single level in the context of the user's data (`/log/{levelId}`). Shows the complete progress history for that level — all progress entries in timeline form. Distinct from the Global Level Page.

**The Global Level Page**
A community-facing page for a level independent of any user (`/levels/{levelId}`). Shows cached level metadata and in v4 community aggregate data. Added in v2.

**Time Machine**
The historical visualization of a user's demon list over time. A multi-line graph showing how the user's top N hardest demons have evolved. Uses the mirror portal as its icon — a reference to the base game level "Time Machine" which introduces the mirror portal mechanic, and a visual metaphor for looking back in time.

**Level Picker**
The Akinator-style guided tool for choosing a next level to attempt. Asks sequential yes/no questions that filter a pool of levels until 5 or fewer remain, then presents the candidates. Operates in Personal Mode (from the user's Want to Beat collection, v2) or Discovery Mode (from the broader cached database, v4).

---

## Difficulty References

**Tier**
A difficulty value from a list that uses bucketed difficulty ranges. Examples: GDDL Tier 28, NLW Hard. Use "tier" specifically for these lists — not interchangeably with "rank."

**Rank**
A difficulty value from a list that uses sequential numeric positions. Examples: Pointercrate #47, AREDL #203. Use "rank" specifically for these lists — not interchangeably with "tier."

**List Reference**
A stored tier or rank value from any community list, attached to a progress entry. Always a snapshot at time of logging — never automatically updated after the fact.

---

## Lists

**Collection**
A user-owned grouping of levels: the built-ins (Want to Beat, Favorites, Least Favorites) plus custom named collections. Entries are ordered by a fractional index (drag to reorder). Not to be confused with _list references_, which point at external community difficulty lists (GDDL/AREDL/NLW).

**Want to Beat**
The built-in collection designated as the pool for the Level Picker's Personal Mode. Only holds levels the user has not completed; a level is auto-removed when its completion is logged.

**Favorites / Least Favorites**
Special built-in user lists. Can optionally sync with GDDL favorites.

**Custom List**
Any user-created named list beyond the built-in types. Examples: "Recommended to Friends," "Nostalgia Levels."

---

## UI Elements

**Shell**
The persistent UI chrome surrounding all pages: sidebar on desktop, bottom navigation bar on mobile, header, and FAB. Present on every authenticated page.

**FAB**
Floating Action Button. The primary logging trigger accessible from every page in the shell. Opens the progress entry logging flow.

**Placement Modal**
The drag-and-drop interface that appears during the logging flow when a user wants to set their ranking position at the time of logging a completion.

**Non-Completion Toggle**
A UI toggle present on the Log, demon list, and Level Page that reveals progress entries where `kind != completion`. Off by default.

**In-Game Face**
A level's difficulty icon as it appears in Geometry Dash: the combination of its **Difficulty Face** and its **Background Glow**. Rendered by the `DifficultyFace` React component (`apps/web/src/components/DifficultyFace.tsx`). Use "in-game face" when referring to the composite icon (face + glow together).

**Difficulty Face**
The face portion of the In-Game Face only — the difficulty icon itself (e.g. the Extreme Demon face), without any glow. Sourced from the `demon-*` / `difficulty-*` assets in `public/assets/gd`.

**Background Glow**
The showcase "fire"/ring behind the Difficulty Face that denotes a level's rating status: the feature circle (featured), or epic / legendary / mythic fire. Absent on rated-but-unfeatured and unrated levels. Sourced from the `bg-*` assets.

---

## Infrastructure

**Level Cache**
The `levels` table in the database, which stores level metadata autofilled from the GD servers, shared across all users. Populated on first autofill of a given level ID and kept current by the RobTop sync jobs.

**Sync Jobs**
Two AWS EventBridge Scheduler Lambdas that re-check cached level metadata against the GD servers and overwrite the cache directly on change. The **volatile** job runs weekly (never-rated + recently-rated levels); the **standard** job runs on the first of each month (everything else that's rated and not delisted). Both share one fetch/compare/write core. See `EXTERNAL_APIS.md`.

**Delisted**
A level the sync jobs can no longer find on RobTop's servers. Its cached metadata is frozen at last-known values and the row is excluded from further syncs. (A cache-only state; per-user progress and completions are untouched.)

---

## Terms to Avoid

| Avoid                                | Use Instead                      | Reason                                                                     |
| ------------------------------------ | -------------------------------- | -------------------------------------------------------------------------- |
| "The Demon List"                     | "my/your demon list"             | The definite article means Pointercrate; the possessive is the whole point |
| "Unrated" for a level the user has not rated | "Unranked"                | "Unrated" is the in-game sense — no stars from RobTop                    |
| "Unrated" for a level not on the demon list | "Unplaced"                 | Same reason; "unplaced" is the demon list's own word                     |
| "Ranking" for the difficulty order   | "my demon list"                  | Ranking is now the rating-ordered page                                     |
| "The List"                           | The Log                          | Renamed; no view is called the List any more                               |
| "The Log" for the event feed         | The Events feed                  | The Log is now the level view                                              |
| "Completion log" or "demon log"      | The Log                          | Too vague, and collides with the Events feed                               |
| "My demons"                          | The Log                          | Implies created levels                                                     |
| "Entry" alone                        | "Progress entry" or "completion" | Too ambiguous                                                              |
| "Rank" for GDDL                      | "Tier"                           | GDDL uses tiers, not ranks                                                 |
| "Tier" for Pointercrate              | "Rank"                           | Pointercrate uses ranks, not tiers                                         |
| "Difficulty face" for the whole icon | "In-game face"                   | The difficulty face is only the face; the in-game face includes the glow   |
