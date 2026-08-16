# End-to-End Testing — Playwright Against Staging

**Status: implemented.** The harness, the infra it depends on, and the CI job
are in the repo. `apps/web/e2e/smoke.e2e.ts` exists to prove the harness
itself; `apps/web/e2e/completion.e2e.ts` covers the completion and ranking
round trips, `apps/web/e2e/collections.e2e.ts` the custom-collection
lifecycle and the Want to Beat handoff, and `apps/web/e2e/progress.e2e.ts`
the two write paths a completion does not touch — a run logged on an unbeaten
level and then edited, and a drop. The spreadsheet import is the one in-scope
flow still to be written.

Two setup steps are one-time manual ops per stage and are not automated away —
see _Provisioning a stage_.

Frontend unit tests are covered by `CODE_QUALITY.md` Frontend §7. Component
tests are a separate workstream and do not depend on anything here.

---

## What this suite is for

E2E is the most expensive test we can write, so it earns its place only by
catching what nothing else can: **drift between the deployed API and the
deployed frontend.** Component and hook tests stub `lib/api/` at the module
boundary, which means a response shape that changed on the server is invisible
to them — every existing frontend spec would still pass.

That framing sets the scope hard:

- **In scope** — a handful of flows that cross the wire end to end and would
  break silently on a contract change: log a completion, place it in the
  ranking, add a level to a collection, log and edit a run, drop a level, run
  a spreadsheet import. `ProgressUpdate`'s optional time + IANA timezone pair
  is the sharpest case for the whole suite: a server that stopped storing
  `dateTimezone` still returns a valid date and every component spec still
  passes, so `progress.e2e.ts` logs at a wall-clock time whose UTC instant
  falls on a different calendar day and reads it back through the edit
  modal's own fields.
- **Out of scope** — rendering detail, empty states, disabled-button logic,
  validation copy, responsive layout. Those belong in component tests, which
  run in seconds instead of minutes and fail with a usable stack trace.

A suite that drifts into the second category is the standard way E2E becomes a
maintenance tax nobody wants to pay. Keep it small on purpose.

---

## Why a real backend, not mocked network

The alternative considered was intercepting every API call with Playwright's
`page.route()` and seeding fixtures. It is faster, fully deterministic, and
needs no AWS — but it verifies the UI against _our fixtures_, which is what the
component suite already does, with a browser tax on top. It cannot catch
contract drift, and contract drift is the entire justification for the suite.

So: real staging API, real Cognito, real Neon Postgres.

The cost of that choice is accepted deliberately — a shared mutable
environment, slower runs, and a class of failure ("staging is down") that is
not a code defect. The mitigations are in _Where it runs_ below.

---

## The auth problem

Every route except `/`, `/about`, `/age-gate`, `/privacy`, `/terms`, `/dmca`,
and `/no-account-found` sits behind `_authenticated.tsx`, which requires both a
live Cognito session and a successful `GET /v1/me`.

**Sign-in is Google federation only.** Driving that in a browser is not an
option — Google actively blocks automated sign-in, and scripting a real Google
account into CI is both fragile and a credential-handling problem we do not
want. The suite must therefore acquire a session _without_ the browser ever
visiting the OAuth flow.

### The approach

1. A dedicated **native Cognito user** (username + password) in the staging
   pool — not a federated one. It logs in through `ADMIN_USER_PASSWORD_AUTH`,
   which never touches Google.
2. Playwright's `globalSetup` calls `AdminInitiateAuth` with the CI role's AWS
   credentials, receives the ID/access/refresh tokens, and writes them into a
   `storageState` file in the localStorage shape Amplify reads.
3. Every spec starts from that `storageState`. The app boots already
   authenticated; `AuthContext.refreshAuthStatus` finds the tokens and
   `isAuthenticated` is true on first render.

`AdminInitiateAuth` is preferred over plain `USER_PASSWORD_AUTH` specifically
so the _public_ web client never has a password flow enabled. The admin flow
requires AWS credentials, which only CI and developers have.

### Two things that bit

**The API Gateway authorizer pins its audience list.** `infra/api.ts`'s
authorizer is the _only_ audience gate — `src/middleware/auth.ts` reads claims
the gateway already verified rather than verifying them itself — and a token
minted by an unlisted app client 401s before Hono ever runs.

The fix was not to add `ALLOW_ADMIN_USER_PASSWORD_AUTH` to
`InfernoLogWebClient`; that would put a password flow on the client the real
frontend ships with. `infra/auth.ts` declares a second client, `e2eClient`,
which exists only on non-production stages, and `infra/api.ts` appends it to
the audience list when it exists:

```ts
audiences: e2eClient
  ? [userPoolClient.id, e2eClient.id]
  : [userPoolClient.id],
```

The guard lives on `$app.stage` in `auth.ts`, not on an env var — a misread env
var would silently widen production's trust boundary. On production `e2eClient`
is `undefined` and the audience list stays exactly one.

`e2eClient`'s id is published to SSM as `/infernolog/<stage>/e2e-client-id`,
alongside the other cross-stack outputs. Its absence is what "you pointed the
suite at production" looks like from the runner.

**The app has to be configured with the E2E client, not the web client.**
Amplify derives its localStorage keys from whatever `userPoolClientId` it is
configured with, and refreshes tokens through that client. So the client that
minted the session has to be the one the app is built with, or the app finds no
session at all. `playwright.config.ts` sets `VITE_COGNITO_CLIENT_ID` to the
E2E client id for the build it serves. This is the main reason the suite serves
its own build rather than hitting the deployed site — see _How the frontend is
served_.

**The Amplify storage key format is version-coupled.** Verified against the
installed `aws-amplify` 6.16.4 (`@aws-amplify/auth` 6.19.1), whose
`providers/cognito/tokenProvider/TokenStore` derives every key as:

```
CognitoIdentityServiceProvider.<clientId>.LastAuthUser
CognitoIdentityServiceProvider.<clientId>.<lastAuthUser>.idToken
CognitoIdentityServiceProvider.<clientId>.<lastAuthUser>.accessToken
CognitoIdentityServiceProvider.<clientId>.<lastAuthUser>.refreshToken
CognitoIdentityServiceProvider.<clientId>.<lastAuthUser>.clockDrift
```

`<lastAuthUser>` is Cognito's own username, which for this pool is a UUID
rather than the email — the pool uses email as a sign-in alias — so
`amplifyStorage.ts` takes it from the ID token's `cognito:username` claim.

This is an internal detail, not a public API. **Treat an Amplify major upgrade
as something that breaks this suite.** If the format churns, the fallback is to
have `globalSetup` drive a real `signIn({ username, password })` in a page
context and snapshot whatever storage Amplify produces — slower, but
self-correcting across versions.

---

## How the frontend is served

The suite builds this commit's frontend and serves it at
`http://localhost:5173`, pointed at the deployed staging API. It does **not**
drive the deployed staging site.

That is forced by CORS: the non-production API's `allowOrigins` is exactly
`['http://localhost:5173']` (`infra/api.ts`), as are the non-production Cognito
callback and logout URLs. A browser at the staging CloudFront origin cannot
call the staging API at all. Serving locally on the one allowed origin also
lets the build be configured with the E2E app client, which it has to be.

The build is a real production Vite build (`pnpm build:e2e && pnpm
preview:e2e`), so what runs in the browser is what would ship. `build:e2e`
differs from `build` in one way: it skips the `tsc` pass, which `pnpm
typecheck` already owns and which would only slow the run down. What this does
**not** cover is the deploy itself — the env vars SST bakes into the static
site, and the CloudFront distribution in front of it. Contract drift against
the API, which is the entire justification for the suite, is covered in full.

The alternative is to widen the API's CORS allowlist and the Cognito URL lists
to include the staging CloudFront origin, the way `auth.ts` already hardcodes
that domain for callbacks. That is a real infra change with a real trust
surface, and it was not worth it for what it adds.

### A semantic gap to be aware of

The test user is native; real users are Google-federated. They differ in
`cognitoSub` provenance and in which attributes Cognito populates. That is fine
for the app — `User.cognitoSub` is just a key, and the staging `users` row is
seeded against the native sub — but it means **the suite does not test the
federated login path itself.** Signup, sign-in rejection, and the
`postAuthentication` trigger's `cognitoSub` backfill stay covered by the API's
integration tests, not by this one.

---

## Test data

The staging database is shared and long-lived, so specs must not assume an
empty database.

- All fixtures belong to the dedicated E2E user. Nothing reads or writes
  another user's rows.
- `globalSetup` resets that user to a known state before the run, by shelling
  out to `apps/api`'s `e2e:reset` script — which owns the schema knowledge and
  reuses the existing Prisma client. Reset **before** the run, not after: a
  crashed run should leave evidence, and the next run cleans up regardless.
- The baseline that reset leaves behind is: no `LevelProgress`, no
  `ClassicRanking`, no `CollectionEntry`, no custom collections, the three
  built-in collections present, preferences at their defaults, onboarding
  complete. Specs create whatever else they need.
- Levels are global, not user-owned. The fixtures are **official** GD levels
  (`apps/api/src/scripts/e2eFixtures.ts`, mirrored in
  `apps/web/e2e/fixtures/levels.ts`): their in-game IDs are fixed and synthetic
  and they enter the cache through `pnpm db:seed:official` rather than a fetch,
  so nothing here depends on RobTop's servers being reachable. The reset script
  fails loudly if any of them is missing rather than logging against a level
  that is not there.
- Specs that mutate must be independent of execution order, since a reset
  happens once per run and not once per spec. The suite also runs
  `workers: 1` — one shared user on one shared database cannot safely
  interleave.
- **Never assert on a count of the user's own rows.** This is where
  order-independence actually gets violated in practice, and it fails in a
  particularly confusing way: the first attempt fails, the retry passes,
  because the retry reset the data first (below) and the first attempt did not.
  Both original specs had this bug. The ranking spec clicked a button matched
  as `/1 unplaced level/`, which the earlier completion spec had already turned
  into "2 unplaced levels"; the smoke spec asserted zero custom collections,
  which was true only because nothing yet creates one.

  Match what is invariant instead — a named row, a panel closing, a specific
  level appearing at a specific rank. Placement always inserts at #1, so rank
  assertions stay true no matter what else is already ranked.

- **The level page renders its layout twice.** `pages/LevelPage.tsx` has a
  `md:hidden` mobile column and a `hidden md:block` desktop one, both always
  in the DOM, so every locator inside it matches two elements and fails strict
  mode rather than the assertion. `progress.e2e.ts`'s `onScreen()` helper
  (`locator.filter({ visible: true })`) is the narrowing; the same shape
  applies to any page built that way. Note also that the stat grid repeats the
  primary entry's date and attempts, so text shared with the timeline needs a
  scope, not just a viewport.

- **Retries reset first.** Order-independence is not enough for a retry: the
  attempt being repeated was itself a mutating attempt that half-succeeded, so
  re-running it against the state it left is not re-testing the same thing.
  `testBase.ts` adds an auto fixture that resets when `testInfo.retry > 0`, so
  a retry fails for the same reason as the attempt it repeats instead of
  wandering into a different code path. Specs import `test` from `./testBase`,
  never from `@playwright/test`, or they miss it.

  The failure that motivated it: a completion spec that failed after its write
  left the level logged, and on retry the find step sinks already-logged levels
  below actionable ones and trims to a cap (`lib/levelSearchResults.ts`) — so
  the row the spec clicks was no longer rendered, and the retry timed out
  waiting for an element rather than failing where the first attempt did.

**Never point this suite at production.** `E2E_STAGE` is required with no
default and rejects `production`, in three independent places: the CI job, the
Playwright entry point, and both `apps/api` scripts. The scripts additionally
refuse any `E2E_USER_EMAIL` outside the `e2e+` namespace, so a misconfigured
run cannot delete a real user's rows. `E2E_DATABASE_URL` is likewise required
and passed explicitly rather than inherited — `apps/api/.env` would otherwise
silently supply a developer's local database.

---

## Where it runs

- **After a deploy to staging** — the full suite, as a post-deploy gate.
- **Manually** — `workflow_dispatch`, for debugging.
- **Not** in `pnpm turbo run test`. That is the negated-filter step in `ci.yml`
  and must stay fast and hermetic. E2E gets its own script (`test:e2e`) and its
  own job.

`.github/workflows/e2e.yml` is the job: a reusable workflow taking `stage` and
`environment`, plus a `workflow_dispatch` trigger for debugging.
`deploy-staging.yml` calls it as `e2e-staging`, gated on `verify-staging`.

**In practice this makes E2E a PR gate.** `deploy-staging.yml` is triggered by
`pull_request`, so any PR touching `apps/**` or `packages/**` deploys to
staging and then runs the suite; a failure fails that PR's checks. That is
accepted deliberately — the suite only runs against code that has already been
deployed to the shared stage, and a PR whose code breaks staging is broken
whether or not the check reports it. The tradeoff it buys is the one every
shared-environment suite carries: a flaky spec blocks unrelated PRs. Two things
hold that line, and both are load-bearing rather than incidental:

- The suite stays **small and contract-focused** (see _What this suite is for_).
  Every spec added here is a spec every PR pays for, in wall-clock time and in
  failure surface.
- A flaky spec gets **fixed or deleted, not retried harder**. `retries: 2` is
  there for genuine environment noise, not as cover for a spec that races its
  own data. The reset fixture (`e2e/testBase.ts`) exists so a retry starts from
  a known state rather than the wreckage of the previous attempt.

Because every PR to `main` deploys to the same `staging` stage and the suite
owns one shared user there, the serialization in both workflows' `concurrency`
groups is what keeps two PRs from resetting each other's data mid-run.

It caches `~/.cache/ms-playwright` keyed on the resolved Playwright version and
reinstalls system dependencies on a cache hit — the cache holds the browser but
not the OS packages it links against. The suite runs with `retries: 2` and
`trace: 'on-first-retry'`, and the HTML report plus traces upload as an
artifact on every run.

`actionTimeout` is set (30s) rather than left unbounded. Unbounded, a locator
that will never match is stopped only by the test timeout, and the failure
reads "Test timeout of 60000ms exceeded" with no mention of the element — the
single least useful message this suite can produce. It sits well above the
`expect` timeout because an action can be the first thing to touch a cold
Lambda: the FAB does not render until `GET /v1/me` resolves. Traces are the difference between diagnosing a CI-only
failure in five minutes and not diagnosing it at all.

Secrets it needs, on the `staging` environment: `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY` (SSM reads and `AdminInitiateAuth`), `DATABASE_URL`,
`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`.

---

## Layout

E2E specs live in `apps/web/e2e/`, **outside `src/`**. This is load-bearing:
`vitest.config.ts` globs `src/**/tests/*.spec.{ts,tsx}`, so keeping Playwright
files out of `src` means the two runners cannot pick up each other's files. A
Playwright spec run by vitest fails in a confusing way.

```
apps/web/
 ├── e2e/
 │    ├── run.ts                 test:e2e entry — SSM → env → playwright
 │    ├── env.ts                 required inputs, validated loudly
 │    ├── playwright.config.ts
 │    ├── globalSetup.ts         data reset; AdminInitiateAuth → storageState
 │    ├── testBase.ts            the `test` specs import — resets on retry
 │    ├── flows.ts               multi-step flows more than one spec drives
 │    ├── resetUserData.ts       shells out to apps/api's e2e:reset
 │    ├── amplifyStorage.ts      tokens → Amplify's localStorage shape
 │    ├── tsconfig.json          Node types, no DOM lib
 │    ├── fixtures/
 │    ├── .auth/                 gitignored — holds live staging tokens
 │    └── *.e2e.ts
 └── src/                         vitest only
```

`run.ts` exists because `playwright.config.ts` is loaded synchronously while
the stage config has to be fetched from SSM, and because the config, the
global setup, and the app build must not be able to end up pointed at
different stages. It resolves the stage once and forwards any extra arguments,
so `pnpm test:e2e --headed --grep ranking` behaves as a bare `playwright test`
would.

---

## Running it

Copy the template once, fill it in, and the inputs stop being something you
paste:

```sh
cd apps/web
cp .env.e2e.example .env.e2e   # gitignored; the template is committed
pnpm test:e2e
```

`.env.e2e` carries the four inputs — `E2E_STAGE`, `E2E_USER_EMAIL`,
`E2E_USER_PASSWORD`, `E2E_DATABASE_URL`. `run.ts` loads it through Node's
`process.loadEnvFile`, which **leaves already-set variables alone**, so an
explicit `E2E_STAGE=dev pnpm test:e2e` still overrides it for a single run, and
CI — which sets everything from secrets and never has the file — is unaffected.

Two things the file buys beyond convenience. No shell parses it, so the
database URL's `&` needs no quoting (unquoted on a command line, `zsh` splits
the assignment there and the variable silently arrives empty). And it is not a
file Vite reads: Vite auto-loads `.env`, `.env.local` and
`.env.<mode>[.local]`, and the E2E build runs in production mode, so the name
cannot collide with the app's own configuration.

Passing them inline still works, with AWS credentials in the environment:

```sh
E2E_STAGE=staging \
E2E_USER_EMAIL=e2e+staging@… \
E2E_USER_PASSWORD=… \
E2E_DATABASE_URL='postgresql://…'   # quote it — it contains `&`
pnpm test:e2e
```

Everything else — API URL, user pool, E2E app client, Cognito domain — is read
from `/infernolog/<stage>/…` in SSM. AWS credentials come from the ambient
environment either way; `AWS_PROFILE` can go in `.env.e2e` too.

**Stop `pnpm dev` first.** The suite needs port 5173, and it will not reuse a
server it finds there — `reuseExistingServer` is `false` even locally, which is
deliberate and not the usual Playwright idiom. The server this suite starts is
built with `VITE_COGNITO_CLIENT_ID` pointing at the E2E app client, and the
injected session's localStorage keys are derived from that id. A dev server on
the same port is built from `.env.local` with the _web_ client, so Amplify
finds no session, every spec fails on the landing page, and nothing in the
failure hints at why. Refusing to reuse turns that into an immediate "port in
use" error instead. It costs a rebuild per run, which is why `build:e2e` skips
`tsc` — typechecking is `pnpm build`'s job and CI's, not the E2E run's.

Both `apps/api` scripts print the database they are about to connect to
(`user@host/database`, never the password) before their first query, so a
connection failure names the target rather than leaving you to guess which of
several Neon branches was tried.

### Provisioning a stage

Once per stage, before the first run. `apps/api`'s `e2e:provision` creates the
native Cognito identity (suppressing the welcome email, forcing a permanent
password so `ADMIN_USER_PASSWORD_AUTH` returns tokens rather than a
`NEW_PASSWORD_REQUIRED` challenge) and the matching `users` row, going through
the same `createUserForSignup` the real signup route calls so the E2E user gets
the real default collections and rating categories. It is idempotent.

```sh
cd apps/api
E2E_STAGE=staging \
E2E_USER_EMAIL=e2e+staging@… \
E2E_USER_PASSWORD=… \
DATABASE_URL=postgresql://… \
COGNITO_USER_POOL_ID=$(aws ssm get-parameter \
  --name /infernolog/staging/user-pool-id \
  --query Parameter.Value --output text) \
pnpm e2e:provision
```

The stage also needs its official levels seeded (`pnpm db:seed:official`) —
that is where the fixture levels come from.

---

## Prerequisites checklist

- [x] `e2eClient` app client in `infra/auth.ts`, non-production stages only
- [x] Authorizer `audiences` widened to include it, guarded on stage
- [x] Reset/seed script in `apps/api` (`e2e:reset`), plus `e2e:provision`
- [x] `@playwright/test` devDependency, config, `test:e2e` script
- [x] Post-deploy CI job with browser caching and trace upload
- [x] `CODE_QUALITY.md` "Not covered yet" updated to point here

Still to do, and not automatable from here:

- [ ] Deploy the api stack to staging so `e2eClient` and its SSM parameter exist
- [ ] Run `e2e:provision` against staging (Cognito identity + `users` row)
- [ ] Add `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` to the `staging` environment's
      GitHub Secrets
- [ ] Write the last in-scope flow spec: run a spreadsheet import. (Logging a
      completion, placing it in the ranking, adding a level to a collection,
      logging and editing a run, and dropping a level are covered.)
