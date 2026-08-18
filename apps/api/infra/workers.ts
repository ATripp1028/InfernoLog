/// <reference path="../.sst/platform/config.d.ts" />

import { sharedEnvironment, sharedLinks } from './api'
import { sharedNodeOptions } from './defaults'
import { gddlKmsKey } from './kms'
import { levelSeedQueue } from './queue'

// ─────────────────────────────────────────────
// WORKER CONCURRENCY
//
// Both workers below run for up to 15 minutes per invocation, and both are
// invoked asynchronously. Without a reservation, a burst of them competes for
// the same account-wide pool the API serves requests from — and a 15-minute
// occupant does not give the slot back quickly. Reserving caps each worker so
// that can't happen, and simultaneously guarantees each one a floor so a busy
// API can't starve background work either.
//
// The caps are per stage, and three stages share the account's 1000. Together
// with the seed queue's 5 (infra/queue.ts) that is 25 per stage, ~75 in total,
// leaving the API well over 900 — the point is the ceiling, not the size of it.
//
// Throttling here is safe by construction: both are invoked with
// InvocationType 'Event', and Lambda queues and retries async invocations that
// hit a concurrency limit rather than dropping them. A throttled import starts
// late; it does not fail. The one caveat is GddlSyncJob's 20-minute stale
// timeout (routes/account/gddlSync.ts) — a sync throttled for longer than that
// would be reported as timed out, which is why its cap is generous relative to
// the number of users who could plausibly sync at once.
// ─────────────────────────────────────────────
const WORKER_RESERVED_CONCURRENCY = 10

// Worker Lambda — runs the full GDDL import in the background so that
// API Gateway's hard 29-second integration timeout never applies.
// The route Lambda invokes this asynchronously (InvocationType: Event)
// and returns 202 + jobId immediately.
export const gddlSyncWorker = new sst.aws.Function('GddlSyncWorker', {
  handler: 'src/handlers/gddlSyncWorker.handler',
  link: [...sharedLinks, levelSeedQueue],
  environment: {
    ...sharedEnvironment,
    GDDL_KMS_KEY_ID: gddlKmsKey.arn,
    LEVEL_SEED_QUEUE_URL: levelSeedQueue.url,
  },
  permissions: [
    {
      actions: ['kms:Decrypt'],
      resources: [gddlKmsKey.arn],
    },
    {
      actions: ['sqs:SendMessage'],
      resources: [levelSeedQueue.arn],
    },
  ],
  timeout: '15 minutes',
  concurrency: { reserved: WORKER_RESERVED_CONCURRENCY },
  ...sharedNodeOptions,
})

// Worker Lambda — processes an import job's rows in the background so
// API Gateway's hard 29-second integration timeout never applies. It
// reuses the level-seed queue (stub levels it creates get the same async
// RobTop enrichment as the old synchronous commit path) and, near its own
// time limit, asynchronously invokes itself again with the same jobId —
// hence the self-invoke permission granted below, added after creation
// since a resource can't reference its own ARN within its own definition.
export const importWorker = new sst.aws.Function('ImportWorker', {
  handler: 'src/handlers/importWorker.handler',
  link: [...sharedLinks, levelSeedQueue],
  environment: {
    ...sharedEnvironment,
    LEVEL_SEED_QUEUE_URL: levelSeedQueue.url,
  },
  permissions: [
    {
      actions: ['sqs:SendMessage'],
      resources: [levelSeedQueue.arn],
    },
  ],
  timeout: '15 minutes',
  // Caps simultaneous IMPORT JOBS, not batches: a job's self-reinvoke is
  // sequential, so one job never holds more than one slot at a time.
  concurrency: { reserved: WORKER_RESERVED_CONCURRENCY },
  ...sharedNodeOptions,
})

new aws.iam.RolePolicy('ImportWorkerSelfInvoke', {
  role: importWorker.nodes.role.name,
  policy: importWorker.arn.apply((arn) =>
    JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        { Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: arn },
      ],
    })
  ),
})
