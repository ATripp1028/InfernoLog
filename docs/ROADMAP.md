# InfernoLog — Roadmap

AI tools assisting with development should treat v1 items as the current build target, v2 items as future work to stub but not implement, and v3/v4 items as long-horizon features to ignore during current development unless schema accommodation is explicitly noted.

---

## v1 — Personal Tool (Current Build Target)

Goal: A complete, shippable replacement for a personal demon tracking spreadsheet. Single-user focus. No public profiles.

### Core Logging
- Level progress model — every interaction with a level is a progress update. Completion = `is_completion = true`
- All progress update fields: percentage, run range, date (with uncertainty flag), attempts, on stream, FPS, enjoyment, simple or weighted rating, in-game difficulty snapshot, notes, completion video URL, highlight video URL
- Non-completion entries hidden by default, revealed by toggle
- One completion per user per level (rebeat handling v3)
- In-progress levels (currently attempting) — up to 10 simultaneous, per-entry privacy
- Dropped level logging — status flag on level_progress, drop reason, date, full progress history preserved
- Beating a dropped level archives the drop entry naturally (completion logged on same level_progress)

### Attempt Count Convention
Attempts represent cumulative attempts across all uploads and copies of the level. Honor system. Documented in UI tooltip.

### Autofill
- GDBrowser autofill on level ID entry (rated + unrated)
- GDDL tier suggestion for rated levels
- Manual entry fallback when any API unavailable
- Level thumbnails via levelthumbs (best-effort, silent fallback)

### Ranking
- Personal classic difficulty ranking (fractional indexing)
- Auto-placement (bottom of difficulty band, same-source list levels)
- Placement modal during logging (drag-and-drop ghost card, autoscroll)
- Unconfirmed placement indicator
- Ranking page with unrated toggle
- Top 5 tracking snapshot

### List Integrations (v1)
- GDDL (autofill + optional record submission)
- Pointercrate (autofill)
- AREDL (autofill if API confirmed)
- NLW (manual entry only)
- Multi-list references per progress update
- GDDL record acceptance indicator (manual, v1 only)

### Rating System
- Simple mode (single 0-10 score) — default
- Weighted mode (configurable categories, computed at query time)
- Default weighted categories: Gameplay, Decoration, Song
- Enjoyment as standalone field, opt-in to weighted average
- Mode switching preserves all data

### Unrated Levels
- Full support with same fields as rated
- GDDL autofill skipped
- Appear in ranking with blank official tier
- Toggle to hide unrated from ranking view

### Auth & Accounts
- Google OAuth + Discord OAuth via AWS Cognito
- Account linking (connect both to one account)
- Username with 30-day cooldown, old username held
- Public/private profile toggle
- Discord visibility toggle
- Per-entry visibility (public/private per level_progress)

### Import & Export
- Spreadsheet import (separate tabs for completions and dropped)
- Template = blank export file (round-trip safe)
- Date format selector + validation report before commit
- Export: full log or filtered view, all list references always included

### Moderation (Basic)
- In-app report submission with rate limiting
- Moderation dashboard (reports queue, appeals queue)
- Report auto-exclusion for reported moderator
- Warn, suspend, ban with audit log
- One appeal per ban
- account_status, role fields on users table from day one

### Infrastructure
- Monorepo: pnpm workspaces + Turborepo
- apps/web (React + Vite), apps/api (SST Lambda), packages/core (shared Zod schemas + types)
- PostgreSQL via Neon
- AWS S3 + CloudFront (frontend)
- AWS Route 53 + ACM
- AWS Cognito
- AWS EventBridge Scheduler (monthly level data sync)
- AWS CloudWatch + Sentry
- GitHub Actions CI/CD (path-based independent deploys)
- Manual database migrations

### React Libraries (v1)
- TanStack Query, TanStack Table
- Tailwind CSS + shadcn/ui
- dnd-kit
- Recharts (basic stats)
- React Hook Form + Zod
- date-fns
- SheetJS (import + export)

---

## v2 — Depth

Goal: Deepen the core logging experience. No new platform features.

### Platformer Support
- Separate platformer log and ranking
- Completion time field (replaces percentage for platformer)
- Platformer-specific list integrations (Pemonlist, others TBD)
- Platformer attempt count convention TBD
- Schema accommodated from v1 via `level_type` enum

### Expanded List Integrations
- Pointercrate record submission
- AREDL API integration (if feasible)
- NLW read-only scrape (if feasible)
- Record acceptance tracking for Pointercrate, AREDL (not just GDDL)
- Cross-list conversion table for auto-placement across list scales
- GDDL favorites sync (push InfernoLog favorites to GDDL)

### Additional Logging Fields
- Peak heart rate BPM (integer, nullable)
- NONG fields on levels: `is_nong`, `nong_song_title`, `nong_artist`, `nong_source_url`

### Features
- Custom named lists beyond favorites/least favorites
- Level Picker — Personal Mode (want-to-beat list, dynamic question ordering, 5-level threshold)
- Non-completion entries in ranking (toggle, off by default)
- Visx added for Time Machine groundwork

### Infrastructure
- Public API (`/v1/` routes, OpenAPI spec generated from Zod schemas)
- Geode mod groundwork (API surface sufficient for mod integration)

---

## v3 — Intelligence

Goal: Make the app actively useful rather than a passive record.

### Features
- Time Machine — multi-line graph (Visx), draggable range slider, retroactive placement, top N configurable, mirror portal icon
- Skill tags — sourced from GDDL/AREDL APIs, per-level (global), displayed on completion entries and filterable
- Stats page — comprehensive personal statistics (completion rate over time, attempts per tier, list progress percentages, skill type breakdown, etc.)
- Rating reference notes (user-defined descriptions per whole-number score per category)
- Level Picker — Discovery Mode delayed until after v4 initial release

### Infrastructure
- `/v2/` API routes if breaking changes accumulated
- API keys — up to 5 named scoped keys per user, key management UI, settings page integration
- Geode mod (C++ via Geode framework, uses public API)

---

## v4 — Platform

Goal: Open InfernoLog to the public as a community platform.

### Features
- Public profiles (`/[username]`)
- View other users' completions, rankings, lists
- Independent skill tag voting system (community votes on level skillsets)
- Level Picker Discovery Mode (post-launch, after database population)
- Verification system (Pointercrate stats viewer profile or similar criteria)
- Admin verification management UI
- Full moderation infrastructure (already partially built in v1)

### Infrastructure
- `/v3/` API routes
- Community data aggregates (average enjoyment, ratings per level — completion entries only)

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
