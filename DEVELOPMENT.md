# Development Guide

This file is a guide for developers on how to set up, run, test, and deploy the packages in this repo.

## Prerequisites

- Node >= 18
- pnpm >= 9
- Docker

## Setup

```bash
pnpm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local   # then fill in the VITE_* values
```

## Important Commands

| Command | What it does
| :------- | :------------
| `pnpm dev` | Vite on :5173 + sst dev (live Lambda)
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Fan out via Turbo
| `pnpm test` | All three workspace suites
| `pnpm format` / `format:check` | Prettier on branch-changed files (bypasses Turbo)
| `pnpm deploy:staging` / `deploy:prod` | deploys api then web, in that order
| `pnpm remove:staging` | Tear down the staging stack

## Stages & Deployment

Three stages:
| Stage | Trigger
| :---- | :------
| `development` | push to `develop`
| `staging` | PR → `main`
| `production` | push to `main`

## Note on `.env`

`sst dev` reads SST secrets, not `.env`. They are set per-stage by me, using either `npx sst secret set NAME value --stage X` for one stage or [export-sst-env.sh](./apps/api/export-sst-env.sh) for multiple.

## PR Checks

All PR checks must pass before a branch can be merged. These include:
- CI
- Analyze (AKA CodeQL via. default GitHub config)
- A successful deployment to stage for relevant apps (including e2e tests if applicable)
- All relevant tests

## Note on Deployment

API always deploys before Web because Web's SST config reads the API's SSM outputs at deploy time, so a new stage breaks if you invert it.

## Testing

Three different test suites:
- Unit (DB mocked on backend, Frontend only tests logic and component rendering): `pnpm test:unit`
- Integration (Spins up test DB, Backend): `test:integration`
- [E2E](./apps/web/e2e/README.md) (Uses and resets test user, tests entire workflows): `test:e2e`

CI enforces coverage on branches (statements 94 / branches 88 / functions 95 / lines 95). To see your branch's coverage, run `test:coverage`. Note that `--project unit --coverage` alone will trip this, since that assumes both projects ran.

## Can I run this without AWS access?

Mostly, yes. AWS permissions are currently held by me only.

**No AWS needed:** linting, typechecking, building, and every test suite —
including the API's integration tests, which run against a local Docker
Postgres rather than any cloud database.

**Frontend development: no AWS needed.** Ask for the `VITE_*` values for a
deployed stage (they are public — they ship in the browser bundle) and put
them in `apps/web/.env.local`. Then run the web app alone:

    pnpm --filter @infernolog/web dev

Don't use bare `pnpm dev`; it also starts `sst dev`, which will fail.

**Requires AWS:** `sst dev` (live backend development — it provisions a real
per-developer stack, not a local emulator), all deploys, `sst secret set`,
and the E2E suite.

Backend logic can still be developed and verified through the integration
tests without ever running `sst dev`; what you lose is exercising the
deployed API by hand and testing infrastructure changes.
