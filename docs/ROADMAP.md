# InfernoLog — Roadmap

## v1 — Personal Tool (Current Build Target)

Goal: A complete, shippable replacement for a personal demon tracking spreadsheet. Single-user focus. No public profiles.

### Core Logging

- [x] Level progress model — every interaction with a level is a progress update. Completion = `kind = completion`, drop = `kind = drop`
- [x] All progress update fields: percentage, run range, date (with uncertainty flag), attempts, on stream, FPS, enjoyment, per-category rating scores, in-game difficulty snapshot, notes, completion video URL, highlight video URL
- [x] Non-completion entries listed in the Log, filterable by status (completed / in progress / dropped)
- [x] One completion per user per level (rebeat handling v3)
- [x] In-progress levels (currently attempting) — per-entry privacy
- [x] Dropped level logging — status flag on level_progress, drop reason, date, full progress history preserved
- [x] Beating a dropped level archives the drop entry naturally (completion logged on same level_progress)

### Attempt Count Convention

- [x] Attempts represent cumulative attempts across all uploads and copies of the level. Honor system. Documented in UI tooltip.

### Autofill

- [x] GD servers (RobTop) autofill on level ID entry (rated + unrated)
- [x] GDDL tier suggestion for rated levels
- [x] Manual entry fallback when any API unavailable
- [x] Level thumbnails via levelthumbs (best-effort, silent fallback)

### Ranking

- [x] Personal classic difficulty ranking (fractional indexing)
- [x] Manual placement only — no auto-placement (every completion starts unplaced)
- [x] Post-submit "Place in ranking now?" prompt (drag-and-drop ghost card, list reference sets starting scroll position)
- [x] Unplaced side panel for completions the user chose to place later
- [x] Demon list page with unrated toggle

### List Integrations (v1)

- [x] GDDL (autofill + optional record submission)

### Rating System

- [x] One system: a level's rating is the weighted average of its per-category scores, computed at query time
- [x] Configurable categories — names, weights (as percents, summing to 100%), and a drag order that is also the tie-break priority
- [x] Default category: a single "Overall" at 100%, which is the one-score-per-level experience
- [x] At least one category enforced; the editor allows clearing the list but blocks the save
- [x] Enjoyment as standalone field, opt-in to the weighted average

### Unrated Levels

- [x] Full support with same fields as rated
- [x] GDDL autofill skipped
- [x] Appear in ranking with blank official tier
- [x] Toggle to hide unrated from ranking view

### Auth & Accounts

- [x] Google OAuth via AWS Cognito
- [x] Account linking (connect both to one account)
- [x] Username with 30-day cooldown
- [ ] Hold the old username for the cooldown period so nobody else can claim it and impersonate a recently-renamed account (the previous name is recorded but not reserved)
- [x] Public/private profile toggle
- [x] Discord visibility toggle
- [x] Per-entry visibility (public/private per level_progress)

### Import & Export

- [x] Spreadsheet import (separate tabs for completions and dropped)
- [x] Template = blank export file (round-trip safe)
- [x] Date format selector + validation report before commit
- [x] Export: full log or filtered view

### Infrastructure

- [x] Monorepo: pnpm workspaces + Turborepo
- [x] apps/web (React + Vite), apps/api (SST Lambda), packages/core (shared Zod schemas + types)
- [x] PostgreSQL via Neon
- [x] AWS S3 + CloudFront (frontend)
- [x] AWS Route 53 + ACM
- [x] AWS Cognito
- [x] AWS EventBridge Scheduler (level-cache sync every 6 hours, rotating through the cache)
- [x] AWS CloudWatch + Sentry
- [x] GitHub Actions CI/CD (path-based independent deploys)
- [x] Manual database migrations

### React Libraries (v1)

- [x] TanStack Query, TanStack Table, TanStack Router
- [x] Tailwind CSS + shadcn/ui
- [x] dnd-kit
- [ ] Recharts (basic stats) — not installed; nothing charts with it yet
- [x] TanStack Form + Zod
- [x] date-fns
- [x] SheetJS (import + export)

---

## v2 — Depth

Goal: Deepen the core logging experience. No new platform features.

### Platformer Support

- [ ] Separate platformer log and ranking — a platformer demon list beside the classic one, with the same place / reorder / unplace surface (only `ClassicDemonList` exists in the schema)
- [ ] Completion time field (replaces percentage for platformer) — the column exists on the level entry; no form collects it
- [ ] Platformer-specific list integrations (Pemonlist, others TBD)
- [ ] Platformer attempt count convention TBD
- [ ] Schema accommodated from v1 via `level_type` enum

### Expanded List Integrations

- [x] AREDL API integration
- [ ] Record acceptance tracking for AREDL (not just GDDL)
- [x] GDDL favorites sync (Favorites and Least Favorites, both directions)

### Additional Logging Fields

- [X] NONG fields on levels: `is_nong`, `nong_song_title`, `nong_artist`, `nong_source_url`
- [ ] Peak heart rate (BPM, from a heart rate monitor) as an optional field on a logged session

### Features

- [ ] Custom named lists beyond favorites/least favorites
- [ ] FAB collection workflows — "Add to Want to Beat" (search, pick a level, add; no log entry is created) and "Add to a Collection" (pick a level, then multi-select across built-in and custom collections, with a create-new option). Both menu items are already shown and do nothing
- [ ] Level Picker — Personal Mode (Want to Beat collection, dynamic question ordering, 5-level threshold)
- [ ] Non-completion entries on the demon list (toggle, off by default) — in-progress and dropped levels placed alongside completions. The page already shows a disabled placeholder chip for it
- [ ] Visx added for Time Machine groundwork

### Infrastructure

- [ ] Public API — open the API to community developers, not just the first-party frontend. Needs general per-user rate limits and a decision on which level-cache reads can drop authentication
- [ ] OpenAPI spec as the API contract, with generated frontend types and a served `/docs` (the contract is the Zod schemas in `packages/core`)
- [ ] Geode mod groundwork (API surface sufficient for mod integration)

---

## v3 — Intelligence

Goal: Make the app actively useful rather than a passive record.

### Features

- [ ] Whole-demon-list reconstruction at a past date, from the event log. Two views, already defined so they aren't re-argued, and a screen showing either must say which:
  - **Snapshot** — "what my demon list looked like that day": each level's most recently logged index at or before the date, including levels since removed. Reads the event log only
  - **Retroactive** — "where the levels I'd beaten by then sit in the list I hold today": the current list filtered to levels completed by the date, excluding anything since removed. Reads the current list and completion dates only
- [ ] Time Machine — multi-line graph (Visx), draggable range slider, retroactive placement, top N configurable, mirror portal icon
- [ ] Skill tags — sourced from GDDL/AREDL APIs, per-level (global), displayed on completion entries and filterable
- [ ] Stats page — comprehensive personal statistics (completion rate over time, attempts per tier, list progress percentages, skill type breakdown, etc.)
- [ ] Rating reference notes (user-defined descriptions per whole-number score per category)
- [ ] Level Picker — Discovery Mode delayed until after v4 initial release

### Infrastructure

- [ ] `/v2/` API routes if breaking changes accumulated, with a deprecation period for `/v1/`
- [ ] API keys — up to 5 named scoped keys per user, key management UI, settings page integration. Third-party tools send the key in a request header and it resolves to a user plus a scope set; creating, listing, rotating, and revoking keys stays first-party (signed-in session only). Keys don't expire but can be revoked or rotated (rotation replaces the key atomically), are shown once at creation with only a hash stored, and are rate-limited per key. Scopes are read and write for each of completions, drops, and lists, plus profile read. An unused `ApiKey` model is already in the schema
- [ ] Geode mod (C++ via Geode framework, uses public API) — authenticates with a user's API key and auto-logs a completion when a level is beaten, passing the attempt count the game exposes. No mod-specific endpoints expected

---

## v4 — Platform

Goal: Open InfernoLog to the public as a community platform.

### Features

- [ ] Public profiles (`/[username]`), including a "Currently Attempting" section of in-progress levels, possibly capped (10 was the working number)
- [ ] View other users' completions, rankings, lists — read-only API endpoints addressed by username or id. Writes stay on the signed-in user's own routes. These reads enforce the profile-level and per-entry visibility settings that are already stored, answer a private profile with 403 (not 404, so "private" and "nonexistent" are distinguishable), and are paginated and filterable server-side rather than returned whole
- [ ] Independent skill tag voting system (community votes on level skillsets)
- [ ] Level Picker Discovery Mode (post-launch, after database population)
- [ ] Verification system (Pointercrate stats viewer profile or similar criteria)
- [ ] Admin verification management UI
- [ ] Full moderation infrastructure

### Moderation (Basic)

- [ ] In-app report submission with rate limiting
- [ ] Moderation dashboard (reports queue, appeals queue)
- [ ] Report auto-exclusion for reported moderator
- [ ] Warn, suspend, ban with audit log
- [ ] Moderator and admin access to private profiles through internal admin routes, not the public API
- [ ] One appeal per ban
- [x] account_status, role fields on users table from day one (banned and suspended accounts are already refused by the API)
- [ ] Role-gated routes — moderators get the moderation dashboard, reports queue, and appeals queue; admins add verification management and moderator promotion/demotion. The role is checked server-side, and the frontend's admin area is gated on it

### Infrastructure

- [ ] `/v3/` API routes
- [ ] Community data aggregates (average enjoyment, ratings per level — completion entries only)

---

## Deferred / No Decision Yet

- Exact Pemonlist integration details
- NLW scrape feasibility
- Platformer attempt count convention
- Specific public API rate limits (determined from beta data)
- Exporting another user's data — whether it should be possible at all is an open privacy question
- Verification badge exact criteria and thresholds
- Level Picker Discovery Mode question set (designed after v4 launch)
- Mobile app (if platform grows to justify it)
- Rebeat handling (v3 placeholder, full design TBD)
- A "show non-completions" toggle beyond the demon list (Ranking page, a stats page) — the earlier design hid non-completions everywhere by default; the Log shows them and filters by status instead
- The spreadsheet's two reserved columns, `nlw_tier` (Completions) and `gddl_tier_at_drop` (Dropped) — both export blank and are ignored on import; give them data or remove them
- Discord notifications for events — a mapping from event type to Discord channel. The event log needs no schema change for it; the one constraint is that the internal demon-list rebalance event is never mapped to anything
- Event history on public profiles — each event already stores a visibility (default public) that nothing reads; decide what it means before any profile shows events
- Tracking collection changes (adding or removing a level) as events — not recorded in any form
- Storing a level's overall rating and rating rank as columns instead of computing them at save time for the event log
- Discord as a sign-in method — shelved over Cognito's pricing for OIDC providers; Discord stays a linked account that cannot sign in
