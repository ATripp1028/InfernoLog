/// <reference path="../../.sst/platform/config.d.ts" />

import {
  api,
  authedRoute,
  jwtAuth,
  sharedEnvironment,
  sharedLinks,
} from '../api'
import { userPool } from '../auth'
import { sharedNodeOptions } from '../defaults'

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
