/// <reference path="../.sst/platform/config.d.ts" />

import { sharedEnvironment, sharedLinks } from './api'
import { sharedNodeOptions } from './defaults'

// ─────────────────────────────────────────────
// LEVEL-SEED QUEUE — async RobTop metadata enrichment for stub levels.
//
// Two producers: spreadsheet import (the import endpoint commits stub levels
// immediately and enqueues their IDs) and GDDL sync (which can find
// existing-but-unverified stub levels — see getOrCreateLevel's needsSeed in
// services/gddlSync.ts). Both workers live in infra/workers.ts.
//
// The system-wide rate limit is enforced by the shared Postgres-backed token
// bucket (utils/robtopRateLimit.ts) rather than by serializing this consumer —
// that limiter is explicitly safe under concurrent callers (an atomic row
// UPDATE), so a modest concurrency here just lets more batches make progress
// in parallel while still bottlenecked by the same shared ceiling. Each batch
// can carry up to 8 level IDs (BATCH_SIZE in services/import.ts), each needing
// up to ~49s in the worst case (3 retries, each up to a 10s rate-limiter wait
// + 5s fetch, plus backoff) — timeout sized well above that per-batch worst
// case.
// ─────────────────────────────────────────────
const levelSeedDlq = new sst.aws.Queue('LevelSeedDlq')

export const levelSeedQueue = new sst.aws.Queue('LevelSeedQueue', {
  dlq: {
    queue: levelSeedDlq.arn,
    retry: 3,
  },
})

levelSeedQueue.subscribe(
  {
    handler: 'src/handlers/levelSeedWorker.handler',
    link: sharedLinks,
    environment: sharedEnvironment,
    ...sharedNodeOptions,
    timeout: '10 minutes',
    concurrency: 5,
  },
  { batch: { size: 1 } }
)
