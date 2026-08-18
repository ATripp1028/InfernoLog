/// <reference path="../../.sst/platform/config.d.ts" />

import { api, jwtAuth, sharedEnvironment, sharedLinks } from '../api'
import { userPool } from '../auth'
import { sharedNodeOptions } from '../defaults'
import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_STATE_SECRET,
} from '../secrets'

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

// Where the browser is sent, and where Discord sends it back. Needed by the
// bouncer (to build its redirect) and by the two authenticated endpoints.
const discordUrls = {
  // Registered with Discord — changing it means updating the Discord app.
  // It still points at the public bouncer even though the bouncer no longer
  // exchanges anything, so the registration survives this refactor untouched.
  DISCORD_REDIRECT_URI:
    $app.stage === 'production'
      ? 'https://api.infernolog.com/auth/discord/callback'
      : 'https://6jeoegiga7.execute-api.us-east-1.amazonaws.com/auth/discord/callback',
  FRONTEND_URL:
    $app.stage === 'production'
      ? 'https://infernolog.com'
      : 'http://localhost:5173',
}

// The public bouncer forwards `code` and `state` to the frontend and nothing
// else, so it gets the URLs and NO credentials: not the client secret (it no
// longer exchanges the code) and not the state secret (it no longer verifies
// the state). The one unauthenticated Lambda in this flow now holds nothing
// worth stealing.
const discordBouncerEnvironment = {
  ...sharedEnvironment,
  ...discordUrls,
}

// The authenticated endpoints: minting a state needs the signing secret and
// the client id; completing a link additionally needs the client secret for
// the token exchange.
const discordEnvironment = {
  ...sharedEnvironment,
  ...discordUrls,
  DISCORD_CLIENT_ID: DISCORD_CLIENT_ID.value,
  DISCORD_CLIENT_SECRET: DISCORD_CLIENT_SECRET.value,
  DISCORD_STATE_SECRET: DISCORD_STATE_SECRET.value,
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

// The only write in the linking flow, and the only place the state's claimed
// userId is checked against an authenticated caller. See
// routes/account/discord.ts.
api.route(
  'POST /v1/me/connect-discord/complete',
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
  environment: discordBouncerEnvironment,
  ...sharedNodeOptions,
})
