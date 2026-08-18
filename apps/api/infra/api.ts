/// <reference path="../.sst/platform/config.d.ts" />

import { e2eClient, userPool, userPoolClient } from './auth'
import { sharedNodeOptions } from './defaults'
import { DATABASE_URL, DATABASE_URL_DIRECT, SENTRY_DSN } from './secrets'

// ─────────────────────────────────────────────
// API — API Gateway + Lambda
//
// Every route points at the same src/index.handler; Hono dispatches
// internally. A new endpoint needs BOTH a Hono route in src/routes/*.ts AND an
// api.route(...) entry in one of the infra/routes/* modules — otherwise API
// Gateway 404s before Hono ever sees it.
// ─────────────────────────────────────────────
export const api = new sst.aws.ApiGatewayV2('InfernoLogApi', {
  cors: {
    allowOrigins:
      $app.stage === 'production'
        ? ['https://infernolog.com']
        : ['http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowCredentials: true,
  },
  domain:
    $app.stage === 'production'
      ? {
          name: 'api.infernolog.com',
          dns: sst.aws.dns(),
        }
      : undefined,
  // Per-route request throttling. Without it the stage inherits the account's
  // default (10,000 rps / 5,000 burst), which is orders of magnitude above what
  // this API can actually serve: every route is backed by the same Lambda, and
  // this account's total concurrent-execution limit is 10 (see infra/queue.ts,
  // where that ceiling already forced maximumConcurrency instead of reserved
  // concurrency). One client looping any endpoint can therefore saturate
  // concurrency for the whole API — including the RobTop-bound routes, which
  // additionally hold slots for up to ~25s each.
  //
  // These are per-route, per-stage ceilings across ALL callers, not per-user
  // quotas — API Gateway HTTP APIs have no built-in per-principal limiting, so
  // this bounds the blast radius rather than attributing it. A genuine
  // per-user quota needs application-level accounting (see the shared RobTop
  // token bucket in utils/robtopRateLimit.ts for the pattern).
  transform: {
    stage: {
      defaultRouteSettings: {
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
    },
  },
})

// ─────────────────────────────────────────────
// API Gateway JWT authorizer — validates Cognito-issued tokens
// before invoking the Lambda. Routes that opt in via `auth: { jwt: ... }`
// get verified claims at event.requestContext.authorizer.jwt.claims.
//
// This audience list is the ONLY audience gate: src/middleware/auth.ts reads
// claims the gateway already verified rather than verifying them itself. A
// token minted by a client that is not listed here 401s before Hono runs.
//
// On non-production stages the list also carries the E2E app client, which is
// itself `undefined` on production (infra/auth.ts guards it on stage), so
// production's list stays exactly one entry.
// ─────────────────────────────────────────────
const jwtAuthorizer = api.addAuthorizer({
  name: 'CognitoJwt',
  jwt: {
    issuer: $interpolate`https://cognito-idp.us-east-1.amazonaws.com/${userPool.id}`,
    audiences: e2eClient
      ? [userPoolClient.id, e2eClient.id]
      : [userPoolClient.id],
  },
})

export const jwtAuth = { jwt: { authorizer: jwtAuthorizer.id } }

// Shared environment for all API Lambda functions
export const sharedEnvironment = {
  DATABASE_URL: DATABASE_URL.value,
  DATABASE_URL_DIRECT: DATABASE_URL_DIRECT.value,
  COGNITO_USER_POOL_ID: userPool.id,
  COGNITO_CLIENT_ID: userPoolClient.id,
  SENTRY_DSN: SENTRY_DSN.value,
  NODE_OPTIONS: '--import @sentry/aws-serverless/awslambda-auto',
}

// Shared links for all API Lambda functions
export const sharedLinks = [
  DATABASE_URL,
  DATABASE_URL_DIRECT,
  SENTRY_DSN,
  userPool,
  userPoolClient,
]

// The default shape for an authenticated route: shared links + env, no extra
// IAM permissions, default timeout. Routes needing more (KMS, AdminDeleteUser,
// a longer timeout) call api.route directly.
export const authedRoute = (route: string) =>
  api.route(
    route,
    {
      handler: 'src/index.handler',
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions,
    },
    { auth: jwtAuth }
  )

api.route('GET /health', {
  handler: 'src/index.handler',
  link: sharedLinks,
  environment: sharedEnvironment,
  ...sharedNodeOptions,
})
