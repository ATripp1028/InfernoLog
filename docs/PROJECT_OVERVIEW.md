# InfernoLog — Project Overview

## What Is InfernoLog?

InfernoLog is a web application for Geometry Dash players to log, rank, and review their demon progress. It replaces the community practice of maintaining personal spreadsheets. A player logs completions, progress and drops; orders their completions by difficulty on a personal demon list; rates levels in their own categories; groups levels into collections; and can bring an existing spreadsheet in or take their data back out. Community list placements (GDDL, AREDL, the NLW sheets) are shown alongside each level, and a connected GDDL account can be synced in both directions.

Every account sees only its own data. What is planned beyond that is in `ROADMAP.md`.

The name combines "Inferno" (evoking the demon theme) with "Log" (communicating its record-keeping purpose).

---

## Repository Structure

InfernoLog uses a **monorepo** managed with **pnpm workspaces** and **Turborepo**. Both the frontend and backend are open source and live in the same repository. Deployments are independent — changing the frontend never triggers a backend redeploy and vice versa, enforced via path filters in the GitHub Actions deploy workflows.

```
infernolog/
 ├── apps/
 │    ├── web/           React + Vite frontend
 │    └── api/           SST Lambda backend
 ├── packages/
 │    ├── core/          Shared types, Zod schemas, constants
 │    └── tsconfig/      Shared TypeScript configuration
 ├── docs/               Architecture and design documentation
 ├── legal/              Terms, privacy policy and DMCA, as Markdown
 ├── scripts/            Repo-level scripts (formatting)
 ├── DEVELOPMENT.md      Setting up, running, testing and deploying
 ├── SECURITY.md         Security decisions and practices
 ├── package.json        pnpm workspace root
 └── turbo.json          Turborepo pipeline configuration
```

### Public Pages

`apps/web` serves an unauthenticated marketing landing page and a small set of public pages, all outside the authenticated app shell:

- `/` — landing page (hero, feature sections, scroll-linked ember background). Authenticated users are redirected to their Log.
- `/signin`, `/age-gate`, `/signup`, `/forgot-password` — the way in: an email and password, or Google. Sign up runs behind the age gate. See `AUTH.md`.
- `/terms`, `/privacy`, `/dmca` — legal documents, rendered from `/legal/*.md` through a shared `LegalDocPage`.
- `/about` — acknowledgments / credits page, also linked from Settings.

These routes are unauthenticated by design. The ember background system is landing-page-only — see `DESIGN_LANGUAGE.md`.

### The App

Behind sign-in, the navigation has six destinations:

| Page        | Route          | What it is                                                                 |
| ----------- | -------------- | -------------------------------------------------------------------------- |
| Search      | `/search`      | Browse and filter the shared level cache                                   |
| Log         | `/log`         | Every level the user has logged, with filters, sorts and saved presets     |
| Ranking     | `/ranking`     | The user's completions ordered by their own rating                         |
| Demon List  | `/demon-list`  | The user's completions ordered by difficulty, placed by hand               |
| Collections | `/collections` | Want to Beat, Favorites, Least Favorites and custom collections            |
| Events      | `/events`      | A feed of what the user did: logs, demon list moves, edits, config changes |

Each logged level has its own page (`/log/{levelId}`), each cached level a shared page (`/levels/{levelId}`), and account settings are at `/settings`. Logging happens through the floating action button on any page — see `LOGGING_FLOW.md`.

The navigation also shows four disabled placeholders with nothing behind them: Time Machine, Stats, Level Picker and Moderation.

### Deployment Independence

```
Change in apps/web/  →  deploy frontend only  →  S3 + CloudFront
Change in apps/api/  →  deploy backend only   →  Lambda + API Gateway
Change in packages/core/ → rebuild both, deploy both
```

---

## Tech Stack

### Frontend (apps/web)

- **React + TypeScript + Vite** — component framework
- **TanStack Router** — file-based routing
- **TanStack Query** — data fetching and caching, persisted between visits
- **TanStack Table** and **TanStack Virtual** — the Log's sortable, filterable, virtualized table
- **TanStack Form + Zod** — form handling and validation
- **Tailwind CSS + Radix UI** — styling, with shadcn-style components over Radix primitives
- **dnd-kit** — drag-and-drop for the demon list and ordered collections
- **Framer Motion** — animation
- **AWS Amplify** — the Cognito client (sign-in, session)
- **date-fns** — date parsing and formatting
- **SheetJS (xlsx)** — client-side spreadsheet export and import parsing
- **Vitest** and **Playwright** — unit tests and the end-to-end suite

### Backend (apps/api)

- **AWS Lambda + API Gateway** — serverless compute
- **Hono** — the HTTP router inside the Lambda
- **SST** — infrastructure as TypeScript
- **PostgreSQL (Neon)** — serverless Postgres database
- **Prisma** — ORM with TypeScript-native schema
- **AWS Cognito** — authentication (email and password, and Google OAuth)
- **AWS SES** — verification codes and account emails
- **AWS KMS** — encrypts stored GDDL API keys
- **AWS SQS** — the queue that enriches stub levels in the background
- **AWS EventBridge Scheduler** — the level-cache sync (every 6 hours) and other crons
- **AWS CloudWatch** — logging and observability
- **Sentry** — error tracking, on both the API and the frontend

### Shared (packages/core)

- **Zod schemas** — runtime validation, and the contract between the frontend and the API
- **TypeScript types** — derived from those schemas, shared across apps

### Hosting

- **Frontend** — AWS S3 + CloudFront
- **DNS** — AWS Route 53
- **SSL** — AWS Certificate Manager
- **URL structure:** `infernolog.com` → frontend, `api.infernolog.com` → API Gateway

---

## External APIs

| Service                                      | Purpose                                                            | Called From        |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------ |
| GD servers (RobTop / `boomlings.com`)        | Level metadata (rated + unrated), and name search                  | Lambda             |
| GDDL API                                     | Community tier and enjoyment; record import, submission, list sync | Lambda             |
| AREDL API                                    | List rank, enjoyment for extreme demons, sheet tier names          | Lambda             |
| Global Stats Viewer                          | Fallback for list placements; object counts                        | Lambda             |
| Song File Hub                                | NONG song metadata                                                 | Lambda             |
| `levelthumbs.prevter.me/thumbnail/{levelId}` | Level thumbnails (Apache 2.0)                                      | Frontend (img src) |

See `EXTERNAL_APIS.md`.

---

## Core Concept: Level Progress

The fundamental unit of InfernoLog is not a "completion" but a **level progress entry**. Every interaction a player has with a level — from their first 8% to their eventual completion — is part of one continuous progress record. A completion is simply a progress update marked `kind = completion`; a drop is one marked `kind = drop`.

```
LevelProgress (one per user per level)
 └── ProgressUpdate[]
      ├── Any percentage up to 100%
      ├── Session fields available at any percentage
      └── kind = completion  →  can be placed on the demon list; counts on the Ranking
```

This models how GD players actually experience levels, and mirrors the GDDL's approach of allowing progress logging and ratings for uncompleted levels. See `LEVEL_LOGGING.md`.

---

## Document Map

Describing what exists:

| Document                        | Contents                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/prisma/schema.prisma` | Full schema, entity relationships, fractional indexing — inline comments are the source of truth for the data model                                                                                                                                    |
| `API_DESIGN.md`                 | The implemented API: auth, rate limits, response shape, pagination, every endpoint                                                                                                                                                                     |
| `AUTH.md`                       | Cognito, sign-in methods, verification codes, username rules, account status                                                                                                                                                                           |
| `LEVEL_LOGGING.md`              | The progress entry model, its fields, and the rules for completions, drops and status                                                                                                                                                                  |
| `LOGGING_FLOW.md`               | The FAB-triggered logging modal: completion / progress / drop paths                                                                                                                                                                                    |
| `DEMON_LIST.md`                 | The user's own demon list: manual placement, demon list events, rank history                                                                                                                                                                           |
| `RATING_SYSTEM.md`              | Weighted-average rating, configurable categories                                                                                                                                                                                                       |
| `LIST_INTEGRATIONS.md`          | The two GDDL tiers, community list placements, and the GDDL account integration                                                                                                                                                                        |
| `EXTERNAL_APIS.md`              | Every outside service: GD servers, GDDL, AREDL, Global Stats Viewer, Song File Hub, levelthumbs, and the level-cache sync                                                                                                                              |
| `EVENT_LOG.md`                  | Event taxonomy: demon list moves, log edits, rating-config changes — what is tracked, what is deliberately not                                                                                                                                         |
| `IMPORT_EXPORT.md`              | Spreadsheet import and export: tabs, columns, conflict resolution, date handling                                                                                                                                                                       |
| `PRIVACY.md`                    | Per-entry privacy and profile visibility                                                                                                                                                                                                               |
| `DESIGN_LANGUAGE.md`            | Visual identity, iconography, colour system and typography                                                                                                                                                                                             |
| `TERMINOLOGY.md`                | The canonical terms used in code, docs and UI                                                                                                                                                                                                          |
| `IMAGE_SOURCES.md`              | Where the bundled Geometry Dash sprites come from                                                                                                                                                                                                      |
| `COMMUNITY_POLICY.md`           | Public-facing content rules                                                                                                                                                                                                                            |
| `CODE_QUALITY.md`               | How code is written (not what it does): JSDoc and duplication rules that apply everywhere, then backend (route errors, logging, layering) and frontend (component/logic split, flows, styling tokens, and the end-to-end suite's scope rules) sections |
| `../DEVELOPMENT.md`             | Setting up, running, testing and deploying                                                                                                                                                                                                             |
| `../SECURITY.md`                | Security decisions and practices, including credential handling                                                                                                                                                                                        |

Describing what is planned:

| Document          | Contents                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `ROADMAP.md`      | Everything not yet built, by version                                  |
| `TIME_MACHINE.md` | Design for a historical view of the demon list. Not built             |
| `LEVEL_PICKER.md` | Design for an Akinator-style guided level selection. Not built        |
| `MODERATION.md`   | Internal moderation policy: reports, appeals. No moderation UI exists |
