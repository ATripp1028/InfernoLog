# InfernoLog — Roadmap

AI tools assisting with development should treat v1 items as the current build target, v2 items as future work to stub but not implement, and v3/v4 items as long-horizon features to ignore during current development unless schema accommodation is explicitly noted.

---

## v1 — Personal Tool (Current Build Target)

Goal: A complete, shippable replacement for a personal demon tracking spreadsheet. Single-user focus. No public profiles.

### Core Logging

> **Note:** The Log page (a dedicated feed/history view) has been shelved pending user feedback. The underlying data model and logging flow are unchanged — only the page that surfaces logged events as a browsable feed is deferred. The nav link is inactive in the current build.

- [x] Level progress model — every interaction with a level is a progress update. Completion = `kind = completion`, drop = `kind = drop`
- [x] All progress update fields: percentage, run range, date (with uncertainty flag), attempts, on stream, FPS, enjoyment, simple or weighted rating, in-game difficulty snapshot, notes, completion video URL, highlight video URL
- [x] Non-completion entries hidden by default, revealed by toggle
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
- [x] Ranking page with unrated toggle

### List Integrations (v1)

- [x] GDDL (autofill + optional record submission)

### Rating System

- [x] Simple mode (single 0-10 score) — default
- [x] Weighted mode (configurable categories, computed at query time)
- [x] Default weighted categories: Gameplay, Decoration, Song
- [x] Enjoyment as standalone field, opt-in to weighted average
- [x] Mode switching preserves all data

### Unrated Levels

- [x] Full support with same fields as rated
- [x] GDDL autofill skipped
- [x] Appear in ranking with blank official tier
- [x] Toggle to hide unrated from ranking view

### Auth & Accounts

- [x] Google OAuth via AWS Cognito
- [x] Account linking (connect both to one account)
- [x] Username with 30-day cooldown, old username held
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
- [x] AWS EventBridge Scheduler (RobTop level-cache sync: weekly + monthly)
- [x] AWS CloudWatch + Sentry
- [x] GitHub Actions CI/CD (path-based independent deploys)
- [x] Manual database migrations

### React Libraries (v1)

- [x] TanStack Query, TanStack Table
- [x] Tailwind CSS + shadcn/ui
- [x] dnd-kit
- [x] Recharts (basic stats)
- [x] React Hook Form + Zod
- [x] date-fns
- [x] SheetJS (import + export)


---

## v2 — Depth

Goal: Deepen the core logging experience. No new platform features.

### Platformer Support

- [ ] Separate platformer log and ranking
- [ ] Completion time field (replaces percentage for platformer)
- [ ] Platformer-specific list integrations (Pemonlist, others TBD)
- [ ] Platformer attempt count convention TBD
- [ ] Schema accommodated from v1 via `level_type` enum

### Expanded List Integrations

- [ ] AREDL API integration
- [ ] Record acceptance tracking for AREDL (not just GDDL)
- [ ] GDDL favorites sync (push InfernoLog favorites to GDDL)

### Additional Logging Fields

- [ ] Peak heart rate BPM (integer, nullable)
- [ ] NONG fields on levels: `is_nong`, `nong_song_title`, `nong_artist`, `nong_source_url`

### Features

- [ ] Custom named lists beyond favorites/least favorites
- [ ] Level Picker — Personal Mode (Want to Beat collection, dynamic question ordering, 5-level threshold)
- [ ] Non-completion entries in ranking (toggle, off by default)
- [ ] Visx added for Time Machine groundwork

### Infrastructure

- [ ] Public API (`/v1/` routes, OpenAPI spec generated from Zod schemas)
- [ ] Geode mod groundwork (API surface sufficient for mod integration)

---

## v3 — Intelligence

Goal: Make the app actively useful rather than a passive record.

### Features

- [ ] Time Machine — multi-line graph (Visx), draggable range slider, retroactive placement, top N configurable, mirror portal icon
- [ ] Skill tags — sourced from GDDL/AREDL APIs, per-level (global), displayed on completion entries and filterable
- [ ] Stats page — comprehensive personal statistics (completion rate over time, attempts per tier, list progress percentages, skill type breakdown, etc.)
- [ ] Rating reference notes (user-defined descriptions per whole-number score per category)
- [ ] Level Picker — Discovery Mode delayed until after v4 initial release

### Infrastructure

- [ ] `/v2/` API routes if breaking changes accumulated
- [ ] API keys — up to 5 named scoped keys per user, key management UI, settings page integration
- [ ] Geode mod (C++ via Geode framework, uses public API)

---

## v4 — Platform

Goal: Open InfernoLog to the public as a community platform.

### Features

- [ ] Public profiles (`/[username]`)
- [ ] View other users' completions, rankings, lists
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
- [ ] One appeal per ban
- [ ] account_status, role fields on users table from day one

### Infrastructure

- [ ] `/v3/` API routes
- [ ] Community data aggregates (average enjoyment, ratings per level — completion entries only)

---

## Deferred / No Decision Yet

- Exact Pemonlist integration details
- NLW scrape feasibility
- Platformer attempt count convention
- Specific public API rate limits (determined from beta data)
- Verification badge exact criteria and thresholds
- Level Picker Discovery Mode question set (designed after v4 launch)
- Mobile app (if platform grows to justify it)
- Rebeat handling (v3 placeholder, full design TBD)
