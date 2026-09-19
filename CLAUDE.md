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

`pnpm test` (root) fans out via turbo to both app suites and `packages/core`'s, which is plain vitest over `src/tests/*.spec.ts`.

## Architecture Notes Not Obvious From The Code

### API → SST routing

`apps/api/sst.config.ts` defines an ApiGatewayV2 with each public route declared individually (`api.route("GET /v1/me", ...)`). Every route points at the same `src/index.handler`, where Hono dispatches internally. **Adding a new endpoint requires both a Hono route in `src/routes/*.ts` AND a matching `api.route(...)` entry in `sst.config.ts`** — otherwise API Gateway will 404 before Hono ever sees it.

All Lambdas share `sharedEnvironment`, `sharedLinks`, and `sharedNodeOptions`. `sharedNodeOptions.copyFiles` ships the Prisma query engine binaries (rhel + arm64) and `schema.prisma` into the Lambda bundle — Prisma will not work without these.

### Cross-stack outputs via SSM

`apps/api` writes its outputs (API URL, Cognito pool/client IDs, Cognito domain) to SSM parameters under `/infernolog/<stage>/...`. `apps/web/sst.config.ts` reads those parameters at deploy time and bakes them into the static site as `VITE_*` env vars. **The api stack must be deployed before the web stack for any new stage.**

### Auth flow

- **Two ways to sign in: an email and password, or Google.** Sign-in by email and password is Cognito SRP from the browser (`AuthContext.signInWithPassword`), so the password never crosses the wire. Google is Cognito's hosted-UI federation, with `AuthCallback` branching on the recorded intent. Both entry points are separate pages, `/signin` and `/signup`, and `/signup` sits behind `/age-gate`. Discord cannot sign in and is not offered on either page.
- **A `users` row is reached through `AuthIdentity`, not a column on `users`**: each identity is one external account connected to the user, and an account can hold several. Every lookup from a token's sub goes through that table.
- An `AuthIdentity` has up to two keys, and a CHECK constraint (in the migration, not expressible in `schema.prisma`) requires one: `cognitoSub`, present exactly when the identity can be signed in with, and `providerAccountId`, the provider's own id (unique per provider). A linked Discord account is a `DISCORD` identity with only `providerAccountId`: it is linked with Discord's OAuth directly (`routes/account/discord.ts`), cannot sign in, and an account holds at most one. The `/v1/me` payload exposes `identities` with the sub reduced to `canSignIn`.
- **Row creation is explicit, not lazy.** `POST /v1/auth/signup/start` (`apps/api/src/routes/auth/onboarding.ts`) calls `createUserForSignup` (`apps/api/src/services/user/index.ts`), which creates the row with the default rating category and built-in collections. It is reachable only after the frontend's age gate. This route is claims-only — mounted BEFORE `app.use('/v1/*', authMiddleware)`, since it must work when no `users` row exists yet. It refuses a token whose `email_verified` isn't true, reads the provider from the token (`utils/identityClaims.ts`), and returns 409 `ACCOUNT_EXISTS` (discarding the new Cognito user) when a different identity arrives with an email another account already has. A repeat call for the same identity returns the existing row.
- **Email-and-password signup verifies the address before any Cognito user exists.** `POST /v1/auth/password-signup/start` emails a code, or a "you already have an account" notice, and answers identically either way. `…/verify` checks the code and creates the native Cognito user already confirmed (`services/cognito/passwordUser.ts`). The browser then signs in and calls `signup/start` like a Google signup. Both routes are public, sit ahead of `authMiddleware`, and receive credentials, so they carry leak tests (see Credential handling). A password sign-in that finds no account (a signup whose tab closed before `signup/start`) finishes the signup rather than being rejected (`features/auth/destinationAfterSignIn.ts`). Password reset is Cognito's own ForgotPassword flow from the browser, and the API is not involved.
- **Settings adds and removes sign-in methods under the account's own session, never by email.** Connecting Google and adding a password both need a fresh **Google proof**: the browser runs its own PKCE code flow against the hosted UI outside Amplify (`apps/web/src/lib/googleProof.ts`, returning to `/auth/google-proof`), so the account's Amplify session is untouched and the proof reaches the API on a request carrying that session's JWT. The API verifies it with `aws-jwt-verify` (`utils/googleProof.ts`: signature, audience, Google provider, `auth_time` within 5 minutes). Adding a password and changing the email go through `requireOwnGoogleProof` and additionally check the proof names one of the caller's own Google identities; connecting Google checks the opposite — that the identity belongs to no account yet — and the session's JWT is what says who is acting. Changing a password checks the current one through `InfernoLogServerClient` (`ADMIN_USER_PASSWORD_AUTH`, IAM-only); Cognito's per-user lockout is its rate limit. A password added from Settings may use a new address, proven with a code, which then becomes the account email.
- **Changing the account email** (`routes/account/email.ts`) takes the current password, or a Google proof when the account has no password, then a code at the new address. It moves the PASSWORD identity's Cognito user first (`changeNativeUserEmail`, which deletes an orphaned native user holding the address), updates `User.email` and that identity together, and moves Cognito back if the database write fails. A connected Google account's email is a record only and never changes. The old address is always notified.
- **Nothing attaches an identity to an account by matching email, and the user pool has no Lambda triggers.** A post-authentication trigger used to backfill the sub onto whichever `users` row shared the signing-in email; with more than one provider that is an account takeover (register the victim's address with a provider that doesn't verify it, sign in, inherit the account), so it was removed. An identity is attached only by a flow that already knows which account it acts for — signup, or linking under that account's own session. Don't reintroduce a trigger, or any other path, that creates rows or identities from an unrecognized sign-in: Sign In rejecting an unknown identity (`POST /v1/auth/signin/reject`) depends on nothing having been created for it.
- `apps/api/src/middleware/auth.ts` reads the claims API Gateway's JWT authorizer already verified (it does no token verification itself), resolves the sub through `AuthIdentity` to the user, and sets `userId` (the internal UUID) and `userEmail` (always the account's email, never the token's) on the Hono context. **All authenticated routes must use `c.get('userId')`, never the Cognito sub directly.**
- The frontend uses `aws-amplify/auth` (configured in `apps/web/src/lib/auth.ts`, imported first in `main.tsx`). `AuthContext` calls `GET /v1/me` on mount to hydrate the app user from the API.
- Routing gate: `App.tsx` redirects to `/onboarding` when `user.onboardingCompleted` is false; `AuthenticatedRoutes` is only mounted post-onboarding.

### Credential handling

**Passwords and verification codes are credentials, and they never reach a log line, a Sentry event, an error message, a response body, or storage.** Since password sign-in, the API handles both in plaintext: it creates Cognito users with `AdminSetUserPassword`, checks a current password with `AdminInitiateAuth`, and issues and checks emailed codes itself (`services/verification`). This repo is public. The rules, and what enforces each:

- **Name them so tooling can see them.** A variable or field holding a credential is named with `password` or `verificationCode`, never a bare `code`, which already means error codes and level codes here. `eslint.credentials.mjs`, shared by both apps, fails lint when a `logger.*`, `console.*`, or `Sentry.*` call, or a `new …Error(…)`, contains anything with such a name or a `.reveal()` call. `src/test/credentialLint.test.ts` proves the rule still fires. Never `eslint-disable` it: rename the harmless `hasPassword` flag instead.
- **In the API, wrap on arrival.** Turn a credential into a `Sensitive` (`utils/sensitive.ts`) as soon as its body is parsed. It prints `[REDACTED]` through `String`, `JSON.stringify`, `inspect`, and Pino. `.reveal()` is only for the call that genuinely needs the plaintext: the Cognito SDK or the HMAC.
- **Never persist.** Codes are stored only as an HMAC keyed by `VERIFICATION_CODE_SECRET` (`EmailVerification.codeHash`), and requesters' IPs only as an HMAC too. In the browser, a credential lives in flow state and is never written to localStorage, sessionStorage, or the persisted query cache. The one token that does touch storage is a Google proof, which sits in sessionStorage for under 5 minutes between its callback and the password form, and is removed once used (`lib/googleProof.ts`).
- **Every route that receives a credential gets a leak test.** Use `src/test/captureLeaks.ts`: send `leakSentinel()` values down the success path, every expected failure, and a forced 500, then call `leakCapture.expectNoLeak(...)`, which checks every Pino line and the raw arguments of every Sentry call. `middleware/errors.leak.test.ts` is the model.
- **Safety nets, not permission.** Pino's `redact` (built from core's `SENSITIVE_FIELD_NAMES`) and Sentry's `beforeSend`/`beforeBreadcrumb` (core's `scrubErrorEvent`, wired in both apps) strip credential fields that slip through. The web Sentry spec also pins `sendDefaultPii: false` and no Session Replay. Workers under `handlers/` initialize Sentry through the Lambda auto-import and get neither scrubber, so a worker that ever touches a credential must be given one first.
- **Committed secrets fail CI.** The `secrets` job in `ci.yml` runs gitleaks over full history with `.gitleaks.toml`: the default rules plus custom rules for hardcoded credential-named assignments, which the defaults miss. GitHub secret scanning and push protection are on as well. Test fixtures use `leakSentinel()` or the `Leak-Canary-` prefix, the one allowlisted pattern. Never allowlist a real value: remove it, rotate it, and purge it from history.

### Email

- **SES is set up by hand, not in SST.** The `infernolog.com` domain identity (DKIM, MAIL FROM `mail.infernolog.com`, DMARC, production access) was created in the AWS console. It belongs to the one AWS account every stage shares, so it must never become an SST resource. `infra/email.ts` only references it by ARN. Cognito sends forgot-password emails through it on every stage (`emailConfiguration` plus a per-stage sending-authorization policy in `infra/auth.ts`). The API sends through it with `services/email`, and a route that sends needs `sesSendPermission` and `emailEnvironment`.
- **Every stored email is lowercase.** CHECK constraints on `users.email` and `auth_identities.email` (migration `lowercase_emails`) refuse anything else, so normalize with core's `EmailSchema` before writing.
- **No user is visible to anyone else until onboarding is complete.** Until then the account carries a placeholder username built from its email's local part. Every public read of other users merges `publicUsers()`/`publicUserWhere` (`services/user/publicUser.ts`) into its `where`. None exist yet; the first one is where this gets forgotten.

### Data model conventions

See `apps/api/prisma/schema.prisma` — its inline comments are the source of truth (the old `docs/DATA_MODEL.md` was removed). Things that surprise:

- `Level.inGameId` (the GD level ID, a string) is the primary key — not a UUID. Reuploads share the same in-game ID.
- The atomic unit is `LevelProgress` (one row per user/level), with many `ProgressUpdate` rows. A "completion" is just `ProgressUpdate.kind = COMPLETION`. Adding a level to the Want to Beat collection does NOT create a `LevelProgress`.
- `ClassicDemonList.listIndex` and `CollectionEntry.rankingIndex` use fractional indexing (`Decimal(20,10)`) — insert between two entries by averaging their indices; renormalize to integers when gaps shrink past 0.0001 (`apps/api/src/utils/fractionalIndex.ts`).
- Two unrelated "list" concepts: **collections** (`Collection`/`CollectionEntry` — user-owned groupings: Want to Beat, Favorites, Least Favorites, custom) vs **list references** (`ListReference`/`ListSource` — GDDL/AREDL/NLW community difficulty-list tiers on a completion). Don't conflate them. Want to Beat only holds unbeaten levels; every completion write path calls `removeFromWantToBeat` in its transaction.
- **The level cache holds demons and unrated levels only.** A RATED NON-DEMON is refused when a level would enter the cache (`isAdmissible` in `apps/api/src/services/levels/admission.ts`), and because progress, collection entries and demon list placements all reference `levels` by foreign key, that one refusal is the whole enforcement — no write path checks again. Every path that creates a row from a RobTop snapshot checks it: `/resolve`, the level page, GD search, the GDDL syncs, and the import's own screen of uncached ids (`screenUncachedIds`). GD search asks GD for demons only (`diff=-2`), so an unrated level whose voted face isn't a demon one is added by its level ID. Two rated non-demons can still exist in the cache and nothing accommodates them: a demon GD **demoted** after it was logged, which stays; and an unrated level GD later rated as a non-demon, which the sync purges unless something references it (`purgeIfUnused`). Non-demon support was removed on 2026-09-16 — with it went `Level.stars`/`starsRequested`, the rule that a star count outranked the difficulty label, and the per-star difficulty opinions (now one `NOT_DEMON_WORTHY`).
- **There is one rating system.** A level's rating is the weighted average of its `RatingScore` rows against the user's `RatingCategory` list, computed at query time and never stored (`computeOverallRating` in `packages/core/src/rating.ts`, shared by both apps). There is no rating mode — SIMPLE, WEIGHTED and MANUAL, along with `LevelProgress.simpleRating` and the `rating_ranking` table, were removed. A new account gets one category, `Overall`, at weight 1.00, which is how it rates on a single number.
- Rating figures are stored as integers 0–100 and category weights as a `Decimal(5,2)` fraction of 1.00. Both convert at the display layer, and `apps/web/src/lib/ratingScale.ts` is the only place that arithmetic lives — scores read 0–10, enjoyment 0–100, weights as whole percents.
- Five invariants are enforced at the application layer, not the DB: **at most one `kind = COMPLETION` `ProgressUpdate` per `LevelProgress`** (every completion path edits the existing row rather than adding a second), **Want to Beat holds only unbeaten levels**, and **an account always has at least one rating category whose active weights total 1.00** (`PUT /v1/me/rating-config` rejects anything else; the settings editor lets you clear the list locally but blocks the save), **an account always keeps at least one identity it can sign in with** (`DELETE /v1/me/identities/:id` refuses the last one under a row lock), and **a PASSWORD identity's email is the account's email** (signup and adding a password in Settings write both together). The first two and the last two are covered by `apps/api/src/services/invariants.integration.test.ts`, which sweeps the whole database after exercising each write path — add a case there when you add a write path, or the sweep will catch you.
- `schema.prisma` documents two further invariants on `Report` and `BanAppeal` (one appeal per ban; `Report.assignedModeratorId != reportedUserId`). **Nothing enforces them yet** — no code writes either table, so they are design intent for when moderation lands, not live rules.

### Frontend security constraints

Three things in `apps/web` fail in ways that are easy to misdiagnose.

- **The CSP is an allowlist, and it lives in `apps/web/sst.config.ts`.** CloudFront serves the SPA under a `ResponseHeadersPolicy` whose `connect-src`/`img-src`/`frame-src` name every external host the app is allowed to reach. Adding a new image host, embed provider, or third-party API means adding it there too, or the request is blocked in the browser with nothing in the network tab but a console error. It does not apply to `pnpm dev` — a page that works locally and breaks on staging is the first thing to check here. The one host not written out by hand is Sentry's ingest origin, derived from the DSN literal in the same file so the two cannot drift; note that a CSP that blocks Sentry also blocks the report of that fact.
- **`xlsx` is pinned to a URL, not a registry version.** The npm `xlsx` package is abandoned at 0.18.5 with two unpatched high CVEs, one of them prototype pollution reachable from `XLSX.read` — which is exactly what the import wizard does to a file the user chose. SheetJS ships fixes only from `cdn.sheetjs.com`, so `package.json` points at the tarball there. `pnpm-lock.yaml` records its integrity hash, so installs stay reproducible, but **installs need network access to cdn.sheetjs.com**, and `pnpm update` will not move this dependency. Bump it by editing the URL.
- **The persisted query cache is scoped to an account, not a browser.** `lib/persister.ts` writes to one fixed localStorage key holding `MeData` (email, username, connected identities) and the whole progress list. It is tagged with `CACHE_BUSTER`, and a restored cache with a different tag is thrown away — **change it whenever a persisted query's wire shape changes in a way current code can't read**, or users load straight into a crash from their own stale cache. `lib/cacheOwner.ts` records which Cognito `sub` owns it and discards it when anyone else signs in; `AuthContext` claims it inside `refreshAuthStatus`, before `isAuthInitializing` flips. Any new auth entry point has to run through that same call, or the next account on a shared browser renders the previous one's data.

Frontend route guards (`lib/useRouteGuard.ts`) are UX only — every authorization decision belongs to the API. Don't add a check to the frontend and treat the endpoint as covered.

### Shared validation

`packages/core` is the source of truth for shared types/Zod schemas across web and api. When adding a new request/response shape that crosses the wire, define it here rather than duplicating zod schemas in each app. **Mind the zod split:** `packages/core` is on `zod@3` (`^3.22.0`) while `apps/api` is on `zod@4`. `apps/web` declares no zod dependency of its own — it uses core's. So the version boundary is api↔core, not web↔api.

Importing a core schema into the API and calling `.safeParse` is fine, and is what the route handlers do. What breaks is **composing** a core schema into a locally-declared zod 4 schema (`z.object({ ...CoreSchema.shape })`, `.extend()`, `.and()`): mixing instances across major versions defeats type inference. Parse with them, don't build on them. Note also that `ZodError.message` is a JSON dump of every issue, not a sentence — use `error.issues[0].message` when surfacing a validation failure to a user.

### Logging & errors

- `apps/api/src/utils/logger.ts` exports a Pino logger. Use it instead of `console.log` in handlers.
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
