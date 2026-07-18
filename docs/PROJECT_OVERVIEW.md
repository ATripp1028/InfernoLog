# InfernoLog — Project Overview

## What Is InfernoLog?

InfernoLog is a web application for Geometry Dash players to log, rank, and analyze their demon progress. It replaces the community practice of maintaining personal spreadsheets, adding features like multi-list integration, GDDL record submission, a Time Machine visualization of personal history, an AI-guided level picker, public profiles, a community API, and eventually a Geode mod for in-game integration.

The name combines "Inferno" (evoking the demon theme) with "Log" (communicating its record-keeping purpose).

---

## Repository Structure

InfernoLog uses a **monorepo** managed with **pnpm workspaces** and **Turborepo**. Both the frontend and backend are open source and live in the same repository. Deployments are independent — changing the frontend never triggers a backend redeploy and vice versa, enforced via path-based CI/CD triggers in GitHub Actions.

```
infernolog/
 ├── apps/
 │    ├── web/           React + Vite frontend
 │    └── api/           SST Lambda backend
 ├── packages/
 │    ├── core/          Shared types, Zod schemas, constants
 │    └── tsconfig/      Shared TypeScript configuration
 ├── docs/               Architecture and design documentation
 ├── package.json        pnpm workspace root
 └── turbo.json          Turborepo pipeline configuration
```

### Unauthenticated Landing Page

`apps/web` serves an unauthenticated marketing landing page and a small set of public pages, all outside the authenticated app shell:

- `/` — landing page (hero, feature sections, scroll-linked ember background). Authenticated users are redirected to their List.
- `/terms`, `/privacy`, `/dmca` — legal documents, rendered from `/legal/*.md` through a shared `LegalDocPage`.
- `/about` — acknowledgments / credits page (structure from `ACKNOWLEDGMENTS_TEMPLATE.md`), also linked from Settings.

These routes are unauthenticated by design. The ember background system is landing-page-only — see `DESIGN_LANGUAGE.md`.

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
- **TanStack Query** — data fetching and caching
- **TanStack Table** — sortable, filterable demon lists
- **Tailwind CSS + shadcn/ui** — styling and UI components
- **dnd-kit** — drag-and-drop for ranking placement modal
- **Recharts** — stats charts and general data visualization
- **Visx** — Time Machine multi-line graph (complex custom interactions)
- **react-chrono** — per-level progress history timeline view
- **React Hook Form + Zod** — form handling and validation
- **date-fns** — date parsing, formatting, and timezone handling
- **SheetJS (xlsx)** — client-side spreadsheet export and import parsing

### Backend (apps/api)

- **AWS Lambda + API Gateway** — serverless compute
- **SST (Serverless Stack)** — Lambda/API Gateway orchestration with TypeScript
- **PostgreSQL (Neon)** — serverless Postgres database
- **Prisma** — ORM with TypeScript-native schema
- **AWS Cognito** — authentication (Google OAuth)
- **AWS EventBridge Scheduler** — RobTop level-cache sync jobs (weekly + monthly)
- **AWS CloudWatch** — logging and observability
- **Sentry** — error tracking

### Shared (packages/core)

- **Zod schemas** — runtime validation, source of truth for all types
- **TypeScript types** — derived from Zod schemas, shared across apps
- **OpenAPI spec** — generated from Zod schemas, published for community developers

### Hosting

- **Frontend** — AWS S3 + CloudFront
- **DNS** — AWS Route 53 (infernolog.gg or similar)
- **SSL** — AWS Certificate Manager (free)
- **URL structure:** `infernolog.gg` → frontend, `api.infernolog.gg` → API Gateway

---

## External APIs

| Service                                      | Purpose                                           | Called From        |
| -------------------------------------------- | ------------------------------------------------- | ------------------ |
| GD servers (RobTop / `boomlings.com`)        | Primary level metadata autofill (rated + unrated) | Lambda             |
| GDDL API                                     | Tier suggestion + optional record submission      | Lambda             |
| `levelthumbs.prevter.me/thumbnail/{levelId}` | Level thumbnails (Apache 2.0)                     | Frontend (img src) |
| AREDL API                                    | Rank autofill, extreme demons only                | Lambda             |
| Song File Hub                                | NONG song metadata (v2, manual entry fallback)    | Lambda             |

---

## Core Concept: Level Progress

The fundamental unit of InfernoLog is not a "completion" but a **level progress entry**. Every interaction a player has with a level — from their first 8% to their eventual completion — is part of one continuous progress record. A completion is simply a progress update marked `kind = completion`; a drop is one marked `kind = drop`.

```
LevelProgress (one per user per level)
 └── ProgressUpdate[]
      ├── Any percentage from 0-100%
      ├── All logging fields available at any percentage
      └── kind = completion  →  appears in ranking + stats
```

This models how GD players actually experience levels, and mirrors the GDDL's approach of allowing progress logging and ratings for uncompleted levels.

---

## Document Map

| Document               | Contents                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `DATA_MODEL.md`        | Full schema, entity relationships, fractional indexing          |
| `AUTH.md`              | Cognito, OAuth, API keys, username rules                        |
| `PRIVACY.md`           | Per-entry privacy, profile visibility, API behavior             |
| `RANKING_SYSTEM.md`    | Personal ranking, manual placement                              |
| `LIST_INTEGRATIONS.md` | GDDL, AREDL, NLW list references                                |
| `LOGGING_FLOW.md`      | FAB-triggered logging modal: completion / progress / drop paths |
| `LEVEL_LOGGING.md`     | Progress entry model, completion flow, drop flow                |

> **Log page status:** The dedicated Log page (a browsable feed of logged events) is shelved pending user feedback. The logging flow, data model, and FAB menu are all active; only the Log nav destination is inactive.
> | `RATING_SYSTEM.md` | Simple vs weighted rating, configurable criteria |
> | `TIME_MACHINE.md` | Historical ranking visualization, retroactive placement |
> | `LEVEL_PICKER.md` | Akinator-style guided level selection |
> | `IMPORT_EXPORT.md` | Spreadsheet import template, export format, date handling |
> | `API_DESIGN.md` | Public API shape, versioning, scopes, pagination |
> | `EXTERNAL_APIS.md` | GD servers (RobTop), GDDL, levelthumbs, EventBridge sync |
> | `MODERATION.md` | Internal mod team policy, reports, appeals |
> | `COMMUNITY_POLICY.md` | Public-facing content rules |
> | `ROADMAP.md` | v1 / v2 / v3 / v4 feature breakdown |
