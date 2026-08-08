/// <reference path="../.sst/platform/config.d.ts" />

import { userPool, userPoolClient } from './auth'
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
})

// ─────────────────────────────────────────────
// API Gateway JWT authorizer — validates Cognito-issued tokens
// before invoking the Lambda. Routes that opt in via `auth: { jwt: ... }`
// get verified claims at event.requestContext.authorizer.jwt.claims.
// ─────────────────────────────────────────────
const jwtAuthorizer = api.addAuthorizer({
  name: 'CognitoJwt',
  jwt: {
    issuer: $interpolate`https://cognito-idp.us-east-1.amazonaws.com/${userPool.id}`,
    audiences: [userPoolClient.id],
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
