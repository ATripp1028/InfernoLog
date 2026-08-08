/// <reference path="../../.sst/platform/config.d.ts" />

import { api, jwtAuth, sharedEnvironment, sharedLinks } from '../api'
import { userPool } from '../auth'
import { sharedNodeOptions } from '../defaults'
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from '../secrets'

api.route('GET /v1/users/check-username', {
  handler: 'src/index.handler',
  link: sharedLinks,
  environment: sharedEnvironment,
  ...sharedNodeOptions,
})

// Claims-only routes: need a verified Cognito identity but not an
// existing User row (createUserForSignup hasn't run yet, or never will
// for a rejected sign-in). Both still require the JWT authorizer — only
// the Prisma "does a user row exist" check is skipped.
api.route(
  'POST /v1/auth/signup/start',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: sharedEnvironment,
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

api.route(
  'POST /v1/auth/signin/reject',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: sharedEnvironment,
    permissions: [
      {
        actions: ['cognito-idp:AdminDeleteUser'],
        resources: [userPool.arn],
      },
    ],
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

// Env vars used by the connect-Discord initiator + public callback.
// The signed `state` parameter ties the two together — no Cognito JWT
// is needed on the public callback because the userId is encoded in
// (and verified from) the state.
const discordEnvironment = {
  ...sharedEnvironment,
  DISCORD_CLIENT_ID: DISCORD_CLIENT_ID.value,
  DISCORD_CLIENT_SECRET: DISCORD_CLIENT_SECRET.value,
  DISCORD_REDIRECT_URI:
    $app.stage === 'production'
      ? 'https://api.infernolog.com/auth/discord/callback'
      : 'https://6jeoegiga7.execute-api.us-east-1.amazonaws.com/auth/discord/callback',
  FRONTEND_URL:
    $app.stage === 'production'
      ? 'https://infernolog.com'
      : 'http://localhost:5173',
}

api.route(
  'POST /v1/me/connect-discord',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: discordEnvironment,
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

api.route(
  'DELETE /v1/me/connect-discord',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: sharedEnvironment,
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

api.route('GET /auth/discord/callback', {
  handler: 'src/index.handler',
  link: sharedLinks,
  environment: discordEnvironment,
  ...sharedNodeOptions,
})
