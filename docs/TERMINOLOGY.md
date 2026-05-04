# InfernoLog — Terminology

This document defines the canonical terms used throughout InfernoLog's codebase, documentation, and UI. AI tools and developers should use these terms consistently and never use them interchangeably.

---

## Core Concepts

**Level Progress**
The parent record grouping all progress entries for a single level for a single user. Has a status: `IN_PROGRESS`, `DROPPED`, or `COMPLETED`. Created when the user logs their first progress entry for a level. One per user per level.

**Progress Entry**
A single logged data point for a level at a specific point in time. Contains percentage, attempts, date, notes, ratings, and any other fields the user chooses to log. Multiple progress entries exist per Level Progress. The fundamental unit of logging in InfernoLog.

**Completion**
A progress entry explicitly marked as `is_completion = true`. The canonical beat of a level. Only completion entries appear in the List and Ranking by default. At most one per Level Progress in v1.

**In Progress**
A level the user is actively attempting. A Level Progress with status `IN_PROGRESS` and no completion entry. Appears in the In Progress section of the app.

**Dropped**
A level the user has stopped playing without beating. A Level Progress with status `DROPPED`. The full progress history is preserved.

**Record**
A completion submitted to and accepted by a ranking authority (GDDL, Pointercrate, AREDL, etc.). Distinct from a completion — a player can have a completion without an accepted record.

**NONG**
Not On NewGrounds. A level that uses a song the player must source and install manually, rather than the game downloading it automatically from Newgrounds. The level still has a Newgrounds song ID in-game, but the intended song is different.

---

## Views

**The List**
The user's primary view of their demon history. A collection of their Level Progress entries, showing completions by default, sortable by any metric. Default sort is by quality (rating). Not called "My Demons" or "Demon List" to avoid confusion with community lists or the implication that these are levels the user created.

**The Log**
A chronological feed of all changes made in the app. Purely time-ordered — not sortable by other metrics. Records actions such as logging a progress entry, updating a rating, reordering the ranking, etc.

**The Ranking**
The user's personal difficulty ordering of their completed levels, arranged manually via drag-and-drop. Independent of any official list tier or rating. Only completion entries appear here by default.

**The Level Page**
The full page for a single level in the context of the user's data (`/list/{levelId}`). Shows the complete progress history for that level — all progress entries in timeline form. Distinct from the Global Level Page.

**The Global Level Page**
A community-facing page for a level independent of any user (`/levels/{levelId}`). Shows cached level metadata and in v4 community aggregate data. Added in v2.

**Time Machine**
The historical visualization of a user's personal ranking over time. A multi-line graph showing how the user's top N hardest demons have evolved. Uses the mirror portal as its icon — a reference to the base game level "Time Machine" which introduces the mirror portal mechanic, and a visual metaphor for looking back in time.

**Level Picker**
The Akinator-style guided tool for choosing a next level to attempt. Asks sequential yes/no questions that filter a pool of levels until 5 or fewer remain, then presents the candidates. Operates in Personal Mode (from the user's Want to Beat list, v2) or Discovery Mode (from the broader cached database, v4).

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

**Want to Beat**
A user list specifically designated as the pool for the Level Picker's Personal Mode. A type of UserList distinct from favorites, least favorites, and custom lists.

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
A UI toggle present on the List, Ranking, and Level Page that reveals progress entries where `is_completion = false`. Off by default.

---

## Infrastructure

**Level Cache**
The `levels` table in the database, which stores GDBrowser-autofilled level metadata shared across all users. Populated on first autofill of a given level ID and updated monthly by the sync job.

**Sync Job**
The AWS EventBridge Scheduler Lambda that runs on the first of each month, checking cached level metadata against GDBrowser for nudge-worthy changes (name, creator, song name, song author).

**Nudge**
A notification informing the user that cached level metadata has changed (name, creator, song name, song author). Delivered as a persistent notification and visual indicator on the affected entry. Sometimes called a **level update nudge** to distinguish it from other notification types.

---

## Terms to Avoid

| Avoid | Use Instead | Reason |
|---|---|---|
| "Completion log" or "demon log" | The List | Confuses List with Log |
| "Activity log" | The Log | Too generic |
| "My demons" | The List | Implies created levels |
| "Demon list" | The List | Confuses with community lists |
| "Entry" alone | "Progress entry" or "completion" | Too ambiguous |
| "Rank" for GDDL | "Tier" | GDDL uses tiers, not ranks |
| "Tier" for Pointercrate | "Rank" | Pointercrate uses ranks, not tiers |
| "Log" for List | The List | These are distinct views |
| "List" for Log | The Log | These are distinct views |
