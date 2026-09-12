# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

InfernoLog is a Geometry Dash demon tracking web app. v1 is pre-release. Extensive design documentation lives in `/docs` — `docs/PROJECT_OVERVIEW.md` is the entry point and links to all other design docs (data model, auth, demon list, ratings, list integrations, etc.). Read those before designing non-trivial features.

## Repository Layout

pnpm + Turborepo monorepo:

- `apps/web` — React 18 + Vite + Tailwind v4 frontend (`@infernolog/web`)
- `apps/api` — Hono on AWS Lambda via SST, Prisma + Neon Postgres (`@infernolog/api`)
- `packages/core` — shared Zod schemas, types, enums (`@infernolog/core`, imported as workspace dep)
- `packages/tsconfig` — shared `base.json`, `web.json`, `api.json` tsconfigs

Each app has its own `sst.config.ts` and is deployed independently. CI uses path-based triggers in `.github/workflows/` so a frontend change does not redeploy the backend.

## Commands

Run from repo root unless noted. Turbo fans out to each workspace.

- `pnpm dev` — turbo runs dev across apps. Frontend is `vite` on :5173. Backend is `sst dev` (live Lambda).
- `pnpm build` — build all packages
- `pnpm lint` — eslint across workspaces
- `pnpm typecheck` — `tsc --noEmit` across workspaces. In `apps/api` this runs `prisma generate` first, since the generated client's types are what most of the API typechecks against. `apps/api`'s `build` is an alias for it — SST bundles at deploy time, so the API build emits nothing and turbo will warn about missing outputs. That warning is expected.
- `pnpm deploy:staging` / `pnpm deploy:prod` — deploys api then web to that stage
- `pnpm remove:staging` — tears down the staging stack

Backend-specific (run from `apps/api`):
- `pnpm prisma migrate dev --name <desc>` — create + apply a migration locally
- `pnpm prisma generate` — regenerate the Prisma client (also runs on `postinstall` and as part of `build`)
- `pnpm prisma studio` — DB browser
- `pnpm test` — vitest, both projects (see below)
- `pnpm test:unit` — fast, mocks Prisma; files matching `*.test.ts` (excluding `*.integration.test.ts`)
- `pnpm test:integration` — real Postgres round-trips; files matching `*.integration.test.ts`, run single-fork to avoid cross-file races on the shared DB. Requires the test DB (`pnpm test:db:up` first, `pnpm test:db:down` after) — a docker-compose Postgres on port 5433, migrated automatically via `globalSetup`.
- `pnpm test:coverage` — both projects under v8 coverage, enforcing the thresholds in `vitest.config.ts`. This is what CI runs for `apps/api`, so a drop below them fails the PR. The thresholds assume both projects ran; `--project unit --coverage` alone will trip them.

Frontend-specific (run from `apps/web`):
- `pnpm preview` — preview the production build locally
- `pnpm test` — vitest under jsdom. Unit and component tests only. Specs live in a `tests/` subdirectory beside the file they cover and are named `<subject>.spec.ts` — see `docs/CODE_QUALITY.md` §7 (Frontend) for the conventions, and `src/utils/testUtils.tsx` for the shared helpers (`renderWithProviders`, `setViewport`, the query wrapper, stubs and fixtures). **Specs must never import `routeTree.gen.ts`** — it is gitignored and not generated in CI's test job, so such a spec passes locally and fails in CI.
- `pnpm test:e2e` — Playwright against a deployed stage. **Not part of `pnpm test`**: it drives real staging Cognito/API/Postgres and resets a shared user's data, so it only runs after a deploy, as a post-deploy gate (`.github/workflows/e2e.yml`). Since `deploy-staging.yml` is `pull_request`-triggered, that gate does fail PRs touching `apps/**` or `packages/**` — deliberately, which is why the suite must stay small and non-flaky. Specs live in `apps/web/e2e/` (outside `src/`, so the two runners cannot pick up each other's files) and are named `*.e2e.ts`. `E2E_STAGE` is required with no default and rejects `production`. **`apps/web/e2e/README.md` is the whole documentation for this suite** — what it is for, what a spec has to do to belong in it, the local setup (`.env.e2e`, and stop `pnpm dev` first — the suite will not reuse a server on :5173), and the one-time provisioning a new stage needs. Read it before adding a spec or running it for the first time.

`pnpm test` (root) fans out to both suites via turbo. `packages/core` has no tests.

## Architecture Notes Not Obvious From The Code

### API → SST routing

`apps/api/sst.config.ts` defines an ApiGatewayV2 with each public route declared individually (`api.route("GET /v1/me", ...)`). Every route points at the same `src/index.handler`, where Hono dispatches internally. **Adding a new endpoint requires both a Hono route in `src/routes/*.ts` AND a matching `api.route(...)` entry in `sst.config.ts`** — otherwise API Gateway will 404 before Hono ever sees it.

All Lambdas share `sharedEnvironment`, `sharedLinks`, and `sharedNodeOptions`. `sharedNodeOptions.copyFiles` ships the Prisma query engine binaries (rhel + arm64) and `schema.prisma` into the Lambda bundle — Prisma will not work without these.

### Cross-stack outputs via SSM

`apps/api` writes its outputs (API URL, Cognito pool/client IDs, Cognito domain) to SSM parameters under `/infernolog/<stage>/...`. `apps/web/sst.config.ts` reads those parameters at deploy time and bakes them into the static site as `VITE_*` env vars. **The api stack must be deployed before the web stack for any new stage.**

### Auth flow

- Cognito User Pool federates with Google. The `users` row is keyed to the Cognito identity by `User.cognitoSub`.
- **`AuthIdentity` is replacing `User.cognitoSub`** so an account can have more than one sign-in method. For now it is a mirror: every write of `User.cognitoSub` (`createUserForSignup`, the postAuthentication backfill, `provisionE2eUser.ts`) must write the matching identity too, but nothing reads the table yet. The request path moves over next, and then the column is dropped.
- **Row creation is explicit, not lazy.** `POST /v1/auth/signup/start` (`apps/api/src/routes/auth/onboarding.ts`) calls `createUserForSignup` (`apps/api/src/services/user/index.ts`), which creates the row with the default rating category and built-in collections. It is reachable only after the frontend's age gate. This route is claims-only — mounted BEFORE `app.use('/v1/*', authMiddleware)`, since it must work when no `users` row exists yet.
- `apps/api/src/triggers/postAuthentication.ts` is the Cognito post-auth Lambda, and it **must never create a row** — a Sign-In attempt by an unrecognized identity depends on it being a no-op. All it does is backfill `cognitoSub` onto a pre-existing user matched by email (legacy accounts predating the column). It swallows its own errors so a failure here can never fail the login.
- `apps/api/src/middleware/auth.ts` verifies the Cognito ID token using `aws-jwt-verify`, looks up the user by `cognitoSub`, and sets `userId` (the internal UUID) and `userEmail` on the Hono context. **All authenticated routes must use `c.get('userId')`, never the Cognito sub directly.**
- The frontend uses `aws-amplify/auth` (configured in `apps/web/src/lib/auth.ts`, imported first in `main.tsx`). `AuthContext` calls `GET /v1/me` on mount to hydrate the app user from the API.
- Routing gate: `App.tsx` redirects to `/onboarding` when `user.onboardingCompleted` is false; `AuthenticatedRoutes` is only mounted post-onboarding.

### Data model conventions

See `apps/api/prisma/schema.prisma` — its inline comments are the source of truth (the old `docs/DATA_MODEL.md` was removed). Things that surprise:

- `Level.inGameId` (the GD level ID, a string) is the primary key — not a UUID. Reuploads share the same in-game ID.
- The atomic unit is `LevelProgress` (one row per user/level), with many `ProgressUpdate` rows. A "completion" is just `ProgressUpdate.kind = COMPLETION`. Adding a level to the Want to Beat collection does NOT create a `LevelProgress`.
- `ClassicDemonList.listIndex` and `CollectionEntry.rankingIndex` use fractional indexing (`Decimal(20,10)`) — insert between two entries by averaging their indices; renormalize to integers when gaps shrink past 0.0001 (`apps/api/src/utils/fractionalIndex.ts`).
- Two unrelated "list" concepts: **collections** (`Collection`/`CollectionEntry` — user-owned groupings: Want to Beat, Favorites, Least Favorites, custom) vs **list references** (`ListReference`/`ListSource` — GDDL/AREDL/NLW community difficulty-list tiers on a completion). Don't conflate them. Want to Beat only holds unbeaten levels; every completion write path calls `removeFromWantToBeat` in its transaction.
- **There is one rating system.** A level's rating is the weighted average of its `RatingScore` rows against the user's `RatingCategory` list, computed at query time and never stored (`computeOverallRating` in `packages/core/src/rating.ts`, shared by both apps). There is no rating mode — SIMPLE, WEIGHTED and MANUAL, along with `LevelProgress.simpleRating` and the `rating_ranking` table, were removed. A new account gets one category, `Overall`, at weight 1.00, which is how it rates on a single number.
- Rating figures are stored as integers 0–100 and category weights as a `Decimal(5,2)` fraction of 1.00. Both convert at the display layer, and `apps/web/src/lib/ratingScale.ts` is the only place that arithmetic lives — scores read 0–10, enjoyment 0–100, weights as whole percents.
- Three invariants are enforced at the application layer, not the DB: **at most one `kind = COMPLETION` `ProgressUpdate` per `LevelProgress`** (every completion path edits the existing row rather than adding a second), **Want to Beat holds only unbeaten levels**, and **an account always has at least one rating category whose active weights total 1.00** (`PUT /v1/me/rating-config` rejects anything else; the settings editor lets you clear the list locally but blocks the save). The first two are covered by `apps/api/src/services/invariants.integration.test.ts`, which sweeps the whole database after exercising each write path — add a case there when you add a write path, or the sweep will catch you.
- `schema.prisma` documents two further invariants on `Report` and `BanAppeal` (one appeal per ban; `Report.assignedModeratorId != reportedUserId`). **Nothing enforces them yet** — no code writes either table, so they are design intent for when moderation lands, not live rules.

### Frontend security constraints

Three things in `apps/web` fail in ways that are easy to misdiagnose.

- **The CSP is an allowlist, and it lives in `apps/web/sst.config.ts`.** CloudFront serves the SPA under a `ResponseHeadersPolicy` whose `connect-src`/`img-src`/`frame-src` name every external host the app is allowed to reach. Adding a new image host, embed provider, or third-party API means adding it there too, or the request is blocked in the browser with nothing in the network tab but a console error. It does not apply to `pnpm dev` — a page that works locally and breaks on staging is the first thing to check here. The one host not written out by hand is Sentry's ingest origin, derived from the DSN literal in the same file so the two cannot drift; note that a CSP that blocks Sentry also blocks the report of that fact.
- **`xlsx` is pinned to a URL, not a registry version.** The npm `xlsx` package is abandoned at 0.18.5 with two unpatched high CVEs, one of them prototype pollution reachable from `XLSX.read` — which is exactly what the import wizard does to a file the user chose. SheetJS ships fixes only from `cdn.sheetjs.com`, so `package.json` points at the tarball there. `pnpm-lock.yaml` records its integrity hash, so installs stay reproducible, but **installs need network access to cdn.sheetjs.com**, and `pnpm update` will not move this dependency. Bump it by editing the URL.
- **The persisted query cache is scoped to an account, not a browser.** `lib/persister.ts` writes to one fixed localStorage key holding `MeData` (email, username, Discord id) and the whole progress list. `lib/cacheOwner.ts` records which Cognito `sub` owns it and discards it when anyone else signs in; `AuthContext` claims it inside `refreshAuthStatus`, before `isAuthInitializing` flips. Any new auth entry point has to run through that same call, or the next account on a shared browser renders the previous one's data.

Frontend route guards (`lib/useRouteGuard.ts`) are UX only — every authorization decision belongs to the API. Don't add a check to the frontend and treat the endpoint as covered.

### Shared validation

`packages/core` is the source of truth for shared types/Zod schemas across web and api. When adding a new request/response shape that crosses the wire, define it here rather than duplicating zod schemas in each app. **Mind the zod split:** `packages/core` is on `zod@3` (`^3.22.0`) while `apps/api` is on `zod@4`. `apps/web` declares no zod dependency of its own — it uses core's. So the version boundary is api↔core, not web↔api.

Importing a core schema into the API and calling `.safeParse` is fine, and is what the route handlers do. What breaks is **composing** a core schema into a locally-declared zod 4 schema (`z.object({ ...CoreSchema.shape })`, `.extend()`, `.and()`): mixing instances across major versions defeats type inference. Parse with them, don't build on them. Note also that `ZodError.message` is a JSON dump of every issue, not a sentence — use `error.issues[0].message` when surfacing a validation failure to a user.

### Logging & errors

- `apps/api/src/utils/logger.ts` exports a Pino logger. Use it instead of `console.log` in handlers (the postAuthentication trigger is the one exception — it uses a bare `console.error` on its catch path).
- Sentry is wired on both sides. The API initializes Sentry via `import './sentry'` at the top of `src/index.ts` and via the `--import @sentry/aws-serverless/awslambda-auto` NODE_OPTIONS set in `sharedEnvironment`. The frontend mirrors it: `apps/web/src/lib/sentry.ts`, imported first in `main.tsx` so it is in place before Amplify is configured.
- **The frontend has two error boundaries, and they report differently.** `Sentry.ErrorBoundary` in `main.tsx` wraps the providers above the router (a throw in `AuthProvider` is the white screen it exists for) and reports on its own. TanStack Router catches route errors in its own boundary, which that one never sees — so `defaultErrorComponent` is set to `RouteErrorFallback`, which calls `Sentry.captureException` itself. Both render `components/shell/ErrorFallback.tsx`. **A new boundary added anywhere else has to report explicitly**; only the Sentry one does it for free.
- The frontend browser DSN is public and lives as a literal in `apps/web/sst.config.ts` (the API's is an `sst.Secret`). Every stage reports to the same Sentry project, told apart by `VITE_SENTRY_ENVIRONMENT`, which is set from `$app.stage`. **Don't use `import.meta.env.MODE` for this** — it is the Vite build mode, which is `production` for every `vite build` regardless of stage. Leaving it empty disables the frontend SDK entirely, which is the local/test default. Frontend source maps are uploaded only when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` are all set (CI does this); otherwise `vite.config.ts` emits no maps at all. That is a weight/reliability call, not a secrecy one (the repo is public), and it degrades rather than fails on fork PRs, which get no secrets.
- **Route handlers do not catch unexpected errors and do not call `Sentry.captureException` themselves.** Each route module registers one `app.onError(createErrorHandler(...))` in its `index.ts` (`apps/api/src/middleware/errors.ts`), which maps that module's error classes to statuses and logs + reports + 500s everything else. A `try/catch` inside a handler is only for translating one specific expected failure, and must rethrow anything it doesn't recognize.

## Code conventions

`docs/CODE_QUALITY.md` is the source of truth for how code is written, split by surface. Read the relevant section before writing new code or reviewing a change.

- **Backend** — JSDoc on every export (`//` comments don't render on IDE hover), the route error-handling pattern above, logging, duplication, and layering rules.
- **Frontend** — every component keeps its logic in a sibling file (`use<Component>.ts`, or a content-named module for pure logic); multi-step flows are one component per step plus a flow context provider; components used by two features live in `src/components/`. Comment style, styling, and data-fetching conventions are explicitly not settled there yet.

## Local environment

Copy `.env.example` to `.env`. SST live-dev (`sst dev`) reads SST secrets, not `.env` — set those with `npx sst secret set DATABASE_URL ...` per stage. The `.env` file is used by Prisma CLI and local scripts.
