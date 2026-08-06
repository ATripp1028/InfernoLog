/// <reference path="../../.sst/platform/config.d.ts" />

import {
  api,
  authedRoute,
  jwtAuth,
  sharedEnvironment,
  sharedLinks,
} from '../api'
import { sharedNodeOptions } from '../defaults'
import { importWorker } from '../workers'

// ─────────────────────────────────────────────
// SPREADSHEET IMPORT / EXPORT
//
// POST /v1/me/import/start persists the dataset and returns immediately —
// no SQS access needed here, the level-seed enqueue happens inside the
// worker (infra/workers.ts). /check and /export are plain synchronous
// reads/pre-flight.
// ─────────────────────────────────────────────
api.route(
  'POST /v1/me/import/check',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: sharedEnvironment,
    // checkImportConflicts does several DB-heavy sub-checks (ratings,
    // collections merge, ranking merge, progress/dropped dedup scans)
    // plus a name-resolution fallback to RobTop for collections entries
    // — bumped to match /me/export's timeout rather than relying on the
    // default, which fit the route's original single-query shape but not
    // this one.
    timeout: '28 seconds',
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

authedRoute('PATCH /v1/me/import/rows/{rowId}/resolve')
authedRoute('POST /v1/me/import/resolve-all')
authedRoute('GET /v1/me/import/status')

api.route(
  'GET /v1/me/export',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: sharedEnvironment,
    timeout: '28 seconds',
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)

// POST /v1/me/import/start — creates the job + rows, invokes the worker
// async, returns 202 + jobId.
api.route(
  'POST /v1/me/import/start',
  {
    handler: 'src/index.handler',
    link: sharedLinks,
    environment: {
      ...sharedEnvironment,
      IMPORT_WORKER_ARN: importWorker.arn,
    },
    permissions: [
      {
        actions: ['lambda:InvokeFunction'],
        resources: [importWorker.arn],
      },
    ],
    ...sharedNodeOptions,
  },
  { auth: jwtAuth }
)
