/// <reference path="../../.sst/platform/config.d.ts" />

import {
  api,
  authedRoute,
  jwtAuth,
  sharedEnvironment,
  sharedLinks,
} from '../api'
import { serverClient, userPool } from '../auth'
import { sharedNodeOptions } from '../defaults'
import { emailEnvironment, sesSendPermission } from '../email'
import { VERIFICATION_CODE_SECRET } from '../secrets'

// ─────────────────────────────────────────────
// ACCOUNT — the current user, plus settings (PATCH preferences + rating
// categories CRUD).
// ─────────────────────────────────────────────
authedRoute('GET /v1/me')
authedRoute('PATCH /v1/me')
authedRoute('PATCH /v1/me/username')
authedRoute('PUT /v1/me/rating-config')
authedRoute('GET /v1/me/rating-categories')

// Needs cognito-idp:AdminDeleteUser (like signin/reject) to remove the Cognito
// identity alongside the InfernoLog account, so authedRoute's permission-less
// shape doesn't fit here.
api.route(
  'DELETE /v1/me',
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

// ─────────────────────────────────────────────
// SIGN-IN METHODS — ⚠️ CREDENTIALS (routes/account/password.ts,
// routes/account/signInMethods.ts). Each route gets only the Cognito actions
// its own step performs.
// ─────────────────────────────────────────────
const FRONTEND_URL =
  $app.stage === 'production'
    ? 'https://infernolog.com'
    : 'http://localhost:5173'

// Changing a password checks the current one through the server-only app
// client, which is why this route alone carries its id.
api.route(
  'PUT /v1/me/password',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: {
      ...sharedEnvironment,
      COGNITO_SERVER_CLIENT_ID: serverClient.id,
    },
    permissions: [
      {
        actions: [
          'cognito-idp:AdminInitiateAuth',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminUserGlobalSignOut',
        ],
        resources: [userPool.arn],
      },
    ],
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

api.route(
  'POST /v1/me/password/setup/start',
  {
    handler: 'src/index.handler',
    link: [...sharedLinks, VERIFICATION_CODE_SECRET],
    environment: {
      ...sharedEnvironment,
      ...emailEnvironment,
      VERIFICATION_CODE_SECRET: VERIFICATION_CODE_SECRET.value,
      FRONTEND_URL,
    },
    permissions: [sesSendPermission],
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

api.route(
  'POST /v1/me/password/setup',
  {
    handler: 'src/index.handler',
    link: [...sharedLinks, VERIFICATION_CODE_SECRET],
    environment: {
      ...sharedEnvironment,
      ...emailEnvironment,
      VERIFICATION_CODE_SECRET: VERIFICATION_CODE_SECRET.value,
    },
    permissions: [
      sesSendPermission,
      {
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminDeleteUser',
        ],
        resources: [userPool.arn],
      },
    ],
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

// Removes a re-confirmation's Cognito user when connecting is refused.
api.route(
  'POST /v1/me/identities/google',
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

api.route(
  'DELETE /v1/me/identities/{id}',
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
