/// <reference path="../../.sst/platform/config.d.ts" />

import {
  api,
  authedRoute,
  jwtAuth,
  sharedEnvironment,
  sharedLinks,
} from '../api'
import { sharedNodeOptions } from '../defaults'
import { gddlKmsKey } from '../kms'
import { gddlSyncWorker } from '../workers'

// ─────────────────────────────────────────────
// GDDL — API key storage, record submission, and the background sync job.
//
// The key routes additionally get the KMS key id in their environment and IAM
// permission to Encrypt/Decrypt with it. Scoped here (not in
// sharedEnvironment) so no other route can touch the key.
// ─────────────────────────────────────────────
const gddlKeyEnvironment = {
  ...sharedEnvironment,
  GDDL_KMS_KEY_ID: gddlKmsKey.arn,
}
const gddlKeyPermissions = [
  {
    actions: ['kms:Encrypt', 'kms:Decrypt'],
    resources: [gddlKmsKey.arn],
  },
]
const gddlKeyRoute = (route: string) =>
  api.route(
    route,
    {
      handler: 'src/index.handler',
      link: sharedLinks,
      environment: gddlKeyEnvironment,
      permissions: gddlKeyPermissions,
      ...sharedNodeOptions,
    },
    { auth: jwtAuth }
  )

gddlKeyRoute('PUT /v1/me/gddl-key')
gddlKeyRoute('DELETE /v1/me/gddl-key')

// Completion writes get KMS access too: a completion may optionally submit
// a GDDL record, which requires decrypting the user's stored GDDL key.
gddlKeyRoute('POST /v1/me/completions')

// Manual GDDL record submission from the level page (retry path).
gddlKeyRoute('POST /v1/me/gddl-records/{levelId}')

// Bidirectional favorites/least-favorites list sync — needs KMS decrypt to
// read the stored GDDL API key. Synchronous (lists are small, max 4 items).
gddlKeyRoute('POST /v1/me/gddl-lists-sync')

// POST /v1/me/gddl-sync — creates the job row, invokes the worker async,
// returns 202 + jobId. No KMS access needed here: the check is whether the
// encrypted key field is non-null; decryption is done by the worker.
api.route(
  'POST /v1/me/gddl-sync',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: {
      ...sharedEnvironment,
      GDDL_SYNC_WORKER_ARN: gddlSyncWorker.arn,
    },
    permissions: [
      {
        actions: ['lambda:InvokeFunction'],
        resources: [gddlSyncWorker.arn],
      },
    ],
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

// GET /v1/me/gddl-sync — the user's current/most-recent sync job status
// (no jobId path param — mirrors GET /v1/me/import/status).
authedRoute('GET /v1/me/gddl-sync')

// POST /v1/me/gddl-sync/ack — marks a completed/failed job acknowledged
// so GET stops returning it once the client has shown the result.
authedRoute('POST /v1/me/gddl-sync/ack')
