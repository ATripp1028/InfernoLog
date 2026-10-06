# API

This is the backend for the In InfernoLog application. In here, you can find all the endpoints, services, cron jobs, infrastructure, and database schema that keep the project running.

## Tech Stack

### AWS

The backend is build around AWS. **Postgres database is handled by Neon, not AWS!**

- **Lambda**: Serverless Functions
- **API Gateway v2**: API Surface and JWT Authorizer
- **Cognito**: User pool, hosted-UI domain, Google identity provider, app clients
- **SQS**: LevelSeedQueue and dead-letter queue
- **EventBridge Scheduler**: CronV2 schedules.
- **KMS**: Storing encrypted GDDL API Keys
- **SSM Parameter Store**: Stores `sst.Secret` values and writes parameters the web reads at deploy time.
- **IAM**: Per-Lambda roles
- **SES v2**: Outbound emails
  - **Hand managed, must NEVER become an SST resource**

### Hono

Hono is the web framework the backend uses. It serves a variety of purposes:

- **The Route Tree**: Defines routes at all 3 tree levels.
- **Middleware Ordering**: Any route mounted after `app.use('/v1/*', authMiddleware)` requires authentication.
- **Typed Context**: Attaches userId as context for every authenticated endpoint.
- **Error Handling**: Catches errors from lambdas and handles them.
- **Bridge to Raw Lambda Event**: Hono attaches claims to `c.env.requestContext.authorizer.jwt.claims`.
- **Catch-all 404 for unknown routes**

### Pino

Pino is used for error logging because it emits structured JSON and `redact` paths are built from core's `SENSITIVE_FIELD_NAMES`

### Neon

Neon handles the PostgreSQL database.

### SST + Pulumi

Infrastructure uses SST 4.7.9, built on Pulumi with Terraform providers. **SST v3 onwards is not built on AWS CDK or CloudFormation, so don't follow advice or tutorials before 2024.**

### Prisma

Prisma is used for building and maintaining the database schema.

### Zod 4

The API uses Zod 4, `@infernolog/core` uses Zod 3. You can `.safeParse()` a core schema from the API, but composing one into a locally-declared zod 4 schema (.extend(), z.object({...Schema.shape})) breaks type inference.

### Sentry

Handles error reporting. If a user faces a non-standard error or RobTop's servers become unavailable, the repo owner gets notified of the issue with a stack trace.

### Vitest 4 + @vitest/coverage-v8

Unit tests, integration tests, and coverage.

### aws-jwt-verify

Verifies Google proof ID tokens in `utils/googleProof.ts`, separately from the gateway authorizer.

## Infrastructure

- `sst.config.ts`: The entry point to the infrastructure. Every file in the `/infra` directory is imported here either directly or transitively through other files as demonstrated by the table below. It returns a the app's stack outputs, so it is visible in the terminal.
- `/infra`: contains all the resources the API uses.
  - `api.ts`: ApiGatewayV2 + JWT authorizer + GET /health.
  - `auth.ts`: Cognito user pool, pool domain, Google identity provider, 3 pool clients, SES identity policy.
  - `secrets.ts`: sst secrets.
  - `queue.ts`: LevelSeedQueue + LevelSeedDlq.
  - `workers.ts`: Sync and GDDL import workers + 1 IAM role policy.
  - `cron.ts`: CronV2 schedules.
  - `kms.ts`: KMS key + alias.
  - `outputs.ts`: SSM parameters.
  - `email.ts`: email configuration.
  - `defaults.ts`: shared node options for Lambdas.
  - `routes/`: HTTP routes via api.route/authedRoute.

| Tier | Files |
| :--- | :---- |
Tier 0 | secrets.ts, defaults.ts, kms.ts, email.ts (no infra imports)
Tier 1 | auth.ts ← secrets
Tier 2 | api.ts ← auth, defaults, secrets
Tier 3 | queue.ts, cron.ts, outputs.ts ← api, defaults, auth
Tier 4 | workers.ts ← api, defaults, kms, queue
Tier 5 | routes/* ← api, auth, defaults, email, secrets, kms, workers

### Cognito Clients

There are three Cognito clients that do different jobs:

- `userPoolClient`: Browser and API.
- `serverClient`: IAM only.
- `e2eClient`: E2E only, non-prod.

## Endpoints

All 47 endpoints point to `src/index.handler`. Each endpoint corresponds to a route backed by its own lambda. All of them run the same bundle, with Hono dispatching internally.

