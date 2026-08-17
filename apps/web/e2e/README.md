# End-to-end tests

Playwright against a **real deployed stage** — real API, real Cognito, real
Postgres. This file is the whole story: what the suite is for, what a spec has
to do to belong in it, and how to run and provision it. The constraints the
harness itself depends on stay documented at the code that depends on each —
the Cognito app client in `apps/api/infra/auth.ts`, the Amplify localStorage
key format in `amplifyStorage.ts`, the localhost-only CORS allowlist in
`playwright.config.ts`.

Everything else about how this repo's frontend code is written, tests included,
is `docs/CODE_QUALITY.md`.

## What this suite is for

**It exists to catch drift between the deployed API and the deployed frontend,
and justifies itself on nothing else.** Every component and hook spec under
`src/` (`docs/CODE_QUALITY.md` §7) stubs `lib/api/` at the module boundary, so
a response shape that changed on the server is invisible to all of them — they
would each still pass. That gap is the whole mandate, and it sets the scope
hard. A flow is in scope when it crosses the wire and would break _silently_ on
a contract change: an opaque value the client only threads back (the browse
cursor), a field the type system never relates to either side (an import
conflict's `field` names), a column pair where losing half still returns
something valid (`date` + `dateTimezone`). Rendering detail, empty states,
disabled-button logic, validation copy and responsive layout are out of scope
and belong in the component suite, which runs in seconds instead of minutes and
fails with a usable stack trace. A suite that drifts into the second category
is the standard way E2E becomes a maintenance tax nobody wants to pay.

The same argument rules out mocking the network. Intercepting every call with
`page.route()` and seeding fixtures would be faster, fully deterministic and
need no AWS — but it verifies the UI against _our own fixtures_, which is what
the component suite already does, with a browser tax on top. Hence a real API,
real Cognito and a real database, and the shared mutable environment that comes
with them.

## Writing a spec

**Specs live here, outside `src/`.** `vitest.config.ts` globs
`src/**/tests/*.spec.{ts,tsx}`, so keeping the trees apart is what stops each
runner picking up the other's files; a Playwright spec run by vitest fails in a
confusing way. Specs are named `*.e2e.ts`, which is what
`playwright.config.ts` matches — a helper module that picks up that suffix
fails as "no tests found".

**Import `test` from `./testBase`, never from `@playwright/test`.** It adds a
data reset before any retry. `globalSetup` resets once per run, which is enough
for a first attempt, but a retry repeats an attempt that already mutated and
half-succeeded — and re-running it against the wreckage is not re-testing the
same thing. The failure that motivated it: a completion spec that died after
its write left the level logged, and on retry the find step sinks already-logged
levels below actionable ones and trims to a cap, so the row the spec clicks was
no longer rendered and the retry timed out on a locator instead of failing where
the first attempt did.

**Never assert on a count of the user's own rows.** The reset is once per run,
not once per spec, and the suite runs `workers: 1` against one shared user, so a
count is a claim about what every earlier spec happened to leave behind. It also
fails in the most confusing way available: the first attempt fails and the retry
passes, because only the retry reset the data first. Match what is invariant
instead — a named row, a panel closing, a level at a specific rank. Both
original specs had this bug; one matched a button as `/1 unplaced level/` that
an earlier spec had already turned into two, the other asserted zero custom
collections, true only until something created one.

**A reload is not automatically a server read.** The query client persists to
localStorage (`main.tsx`'s `PersistQueryClientProvider`) with a two-minute
`staleTime`, and mutations that use `setQueryData` rather than invalidating
never went to the server at all — so a `page.reload()` inside that window
re-reads what the spec itself just wrote, and would pass against a server that
persisted nothing. Either wait on the response carrying the value
(`collections.e2e.ts`) or drop the persisted cache first (`listPresets.e2e.ts`'s
`coldReload`, which removes the one `infernolog:query-cache` key — Amplify's
session lives under its own keys and survives).

**A flaky spec gets fixed or deleted, not retried harder.** `deploy-staging.yml`
is `pull_request`-triggered and the suite runs as its post-deploy gate, so every
spec here is a spec every PR pays for in wall-clock time and in failure surface,
and a flaky one blocks unrelated PRs. `retries: 2` is there for genuine
environment noise — a cold Lambda, a stage that is down — not as cover for a
spec that races its own data.

## Running it

```sh
cd apps/web
cp .env.e2e.example .env.e2e   # once; the template documents the four inputs
pnpm test:e2e
```

`.env.e2e` is gitignored — it holds a staging database credential. It carries
`E2E_STAGE`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` and `E2E_DATABASE_URL`, and
`run.ts` loads it through Node's `process.loadEnvFile`, which leaves
already-set variables alone: `E2E_STAGE=dev pnpm test:e2e` still wins for a
single run, and CI — which sets everything from secrets and never has the file
— is unaffected. Passing the four inline instead works, but quote the database
URL: a Neon URL contains `&`, and unquoted, `zsh` splits the assignment there
and the variable silently arrives empty.

Everything else — API URL, user pool, E2E app client, Cognito domain —
resolves from `/infernolog/<stage>/…` in SSM at run time. AWS credentials come
from the ambient environment either way (`AWS_PROFILE` can live in `.env.e2e`
too); they are needed for the SSM reads and for `AdminInitiateAuth`.

Extra arguments forward to `playwright test`, so `pnpm test:e2e --headed --grep
ranking` behaves as you would expect.

**`E2E_STAGE` is required, has no default, and rejects `production`** — in the
CI job, in the Playwright entry point, and in both `apps/api` scripts, which
additionally refuse any `E2E_USER_EMAIL` outside the `e2e+` namespace. Pointing
the suite at a stage resets that stage's E2E user data.

**Stop `pnpm dev` first.** The suite needs port 5173 and will not reuse a
server it finds there. Its own build is configured with the E2E Cognito app
client, and the injected session's localStorage keys are derived from that
client's id — a dev server on the same port is built with the _web_ client, so
Amplify would find no session and every spec would fail on the landing page
with nothing hinting at why. Refusing to reuse turns that into an immediate
"port in use" error instead.

## Provisioning a stage

A stage that has never run the suite needs three one-time steps, in this order:

1. **Deploy the api stack**, so `e2eClient` and its `/infernolog/<stage>/e2e-client-id`
   SSM parameter exist. That client is declared on non-production stages only
   (`apps/api/infra/auth.ts`), and its absence is what "you pointed the suite at
   production" looks like from the runner.
2. **`pnpm e2e:provision`** from `apps/api` — the native Cognito identity and
   its `users` row, created through the same `createUserForSignup` the real
   signup route calls, so the E2E user gets the real default collections and
   rating categories. Idempotent.
3. **`pnpm db:seed:official`** from `apps/api` — the fixture levels
   (`src/scripts/e2eFixtures.ts`, mirrored in `e2e/fixtures/levels.ts`). Their
   in-game IDs are synthetic and fixed, so nothing in the suite depends on
   RobTop's servers being reachable.

`e2e:provision` needs `E2E_STAGE`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`,
`DATABASE_URL` and `COGNITO_USER_POOL_ID`:

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

Both `apps/api` scripts print the database they are about to connect to
(`user@host/database`, never the password) before their first query, so a
connection failure names the target instead of leaving you to guess which Neon
branch was tried.

## In CI

`.github/workflows/e2e.yml` is a reusable workflow taking `stage` and
`environment`, plus a `workflow_dispatch` trigger for debugging.
`deploy-staging.yml` calls it as `e2e-staging`, gated on `verify-staging` — and
since that workflow is `pull_request`-triggered, the suite is in practice a
required check on any PR touching `apps/**` or `packages/**`. It is deliberately
**not** part of `pnpm turbo run test`, which must stay fast and hermetic.

Secrets it needs on the `staging` environment: `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`.

The HTML report and traces upload as an artifact on every run; traces are the
difference between diagnosing a CI-only failure in five minutes and not
diagnosing it at all.

## Layout

```
apps/web/e2e/
 ├── run.ts               test:e2e entry — SSM → env → playwright
 ├── env.ts               required inputs, validated loudly
 ├── playwright.config.ts
 ├── globalSetup.ts       data reset; AdminInitiateAuth → storageState
 ├── testBase.ts          the `test` specs import — resets on retry
 ├── flows.ts             flows + locator helpers more than one spec uses
 ├── resetUserData.ts     shells out to apps/api's e2e:reset
 ├── amplifyStorage.ts    tokens → Amplify's localStorage shape
 ├── fixtures/
 ├── .auth/               gitignored — holds live staging tokens
 └── *.e2e.ts
```

`run.ts` exists because `playwright.config.ts` is loaded synchronously while
the stage config has to be fetched from SSM, and because the config, the global
setup and the app build must not be able to end up pointed at different stages.
It resolves the stage once and forwards the rest.
