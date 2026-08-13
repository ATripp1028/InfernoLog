# End-to-End Testing — Playwright Against Staging

**Status: designed, deferred.** Nothing in this document is implemented. No
Playwright dependency, config, or spec exists in the repo. This is the agreed
approach for when the work is picked up, recorded now so the decision does not
have to be re-litigated — and so the infra prerequisites are visible to anyone
touching `apps/api/infra/auth.ts` in the meantime.

Frontend unit tests are covered by `CODE_QUALITY.md` Frontend §7. Component
tests are a separate, nearer-term workstream and do not depend on anything here.

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
  ranking, add a level to a collection, run a spreadsheet import.
- **Out of scope** — rendering detail, empty states, disabled-button logic,
  validation copy, responsive layout. Those belong in component tests, which
  run in seconds instead of minutes and fail with a usable stack trace.

A suite that drifts into the second category is the standard way E2E becomes a
maintenance tax nobody wants to pay. Keep it small on purpose.

---

## Why a real backend, not mocked network

The alternative considered was intercepting every API call with Playwright's
`page.route()` and seeding fixtures. It is faster, fully deterministic, and
needs no AWS — but it verifies the UI against *our fixtures*, which is what the
component suite already does, with a browser tax on top. It cannot catch
contract drift, and contract drift is the entire justification for the suite.

So: real staging API, real Cognito, real Neon Postgres.

The cost of that choice is accepted deliberately — a shared mutable
environment, slower runs, and a class of failure ("staging is down") that is
not a code defect. The mitigations are in *Where it runs* below.

---

## The auth problem

Every route except `/`, `/about`, `/age-gate`, `/privacy`, `/terms`, `/dmca`,
and `/no-account-found` sits behind `_authenticated.tsx`, which requires both a
live Cognito session and a successful `GET /v1/me`.

**Sign-in is Google federation only.** Driving that in a browser is not an
option — Google actively blocks automated sign-in, and scripting a real Google
account into CI is both fragile and a credential-handling problem we do not
want. The suite must therefore acquire a session *without* the browser ever
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
so the *public* web client never has a password flow enabled. The admin flow
requires AWS credentials, which only CI and developers have.

### Two things that will bite

**The API Gateway authorizer pins a single audience.** `infra/api.ts` declares:

```ts
const jwtAuthorizer = api.addAuthorizer({
  name: 'CognitoJwt',
  jwt: {
    issuer: ...,
    audiences: [userPoolClient.id],   // ← exactly one client
  },
})
```

A token minted by a *different* app client fails at the gateway with a 401
before Hono ever runs. Note that `src/middleware/auth.ts` reads claims the
gateway already verified rather than verifying them itself, so this authorizer
is the only audience gate — but it is an absolute one.

The fix is not to add `ALLOW_ADMIN_USER_PASSWORD_AUTH` to
`InfernoLogWebClient`; that would put a password flow on the client the real
frontend ships with. Instead add a second client, and widen the audience list
on non-production stages only:

```ts
// infra/auth.ts — non-production only.
export const e2eClient = isProd ? undefined : new aws.cognito.UserPoolClient(...)

// infra/api.ts
audiences: isProd
  ? [userPoolClient.id]
  : [userPoolClient.id, e2eClient!.id],
```

Production keeps an audience list of exactly one. Guard on stage, not on an
env var — a misread env var silently widens prod's trust boundary.

**The Amplify storage key format is version-coupled.** Amplify v6 (`^6.16.4`)
writes localStorage keys shaped like:

```
CognitoIdentityServiceProvider.<clientId>.LastAuthUser
CognitoIdentityServiceProvider.<clientId>.<username>.idToken
CognitoIdentityServiceProvider.<clientId>.<username>.accessToken
CognitoIdentityServiceProvider.<clientId>.<username>.refreshToken
```

This is an internal detail, not a public API. **Verify it against the installed
`aws-amplify` version when implementing rather than trusting this snippet**, and
treat an Amplify major upgrade as something that breaks the E2E suite. If the
format churns, the fallback is to have `globalSetup` drive a real
`signIn({ username, password })` call in a page context and snapshot whatever
storage Amplify produces — slower, but self-correcting across versions.

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
- `globalSetup` resets that user to a known state before the run — delete their
  `LevelProgress` / `CollectionEntry` / `ClassicRanking` rows and re-seed, via a
  script in `apps/api` reusing the existing Prisma client. Reset **before** the
  run, not after: a crashed run should leave evidence, and the next run cleans
  up regardless.
- Levels are global, not user-owned. Seed against level IDs already in the
  cache so the suite does not depend on RobTop's servers being reachable.
- Specs that mutate must be independent of execution order, since a reset
  happens once per run and not once per spec.

**Never point this suite at production.** The stage should be an explicit,
required input with no default.

---

## Where it runs

Not on every PR. A shared-environment suite gating every merge produces exactly
the flaky-check culture that gets tests disabled.

- **On deploy to staging** — the full suite, as a post-deploy gate.
- **Manually** — `workflow_dispatch`, for debugging.
- **Not** in `pnpm turbo run test`. That is the negated-filter step in `ci.yml`
  and must stay fast and hermetic. E2E gets its own script (`test:e2e`) and its
  own job.

Job requirements: `npx playwright install --with-deps chromium`, a browser cache
keyed on the Playwright version, AWS credentials for `AdminInitiateAuth`,
`retries: 2` with `trace: 'on-first-retry'`, and trace/screenshot artifact
upload on failure. Traces are the difference between diagnosing a CI-only
failure in five minutes and not diagnosing it at all.

---

## Layout

E2E specs live in `apps/web/e2e/`, **outside `src/`**. This is load-bearing:
`vitest.config.ts` globs `src/**/tests/*.spec.{ts,tsx}`, so keeping Playwright
files out of `src` means the two runners cannot pick up each other's files. A
Playwright spec run by vitest fails in a confusing way.

```
apps/web/
 ├── e2e/
 │    ├── playwright.config.ts
 │    ├── globalSetup.ts        AdminInitiateAuth → storageState; data reset
 │    ├── fixtures/
 │    └── *.e2e.ts
 └── src/                        vitest only
```

---

## Prerequisites checklist

- [ ] `e2eClient` app client in `infra/auth.ts`, non-production stages only
- [ ] Authorizer `audiences` widened to include it, guarded on stage
- [ ] E2E user seeded in the staging pool; password in GitHub Secrets
- [ ] Corresponding `users` row in the staging database
- [ ] Reset/seed script in `apps/api`
- [ ] `playwright` devDependency, config, `test:e2e` script
- [ ] Post-deploy CI job with browser caching and trace upload
- [ ] `CODE_QUALITY.md` "Not covered yet" updated to point here
