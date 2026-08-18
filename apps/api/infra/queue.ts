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
// Concurrency is bounded twice, and the two bounds are not redundant:
// `concurrency.reserved` is an ACCOUNT-level reservation (this function can
// never take more than 5 of the account's 1000, and always has 5 available),
// while the event source mapping's `maximumConcurrency` is how many invocations
// SQS will drive. AWS wants the latter <= the former, or SQS scales into a wall
// and burns receive counts on throttled messages, so they are deliberately the
// same number — change one and change the other.
//
// The reservation is what stops background work starving the API. A 10-minute
// batch × 5 in flight used to be 5 slots held out of an account limit of 10,
// which together with the import/GDDL workers could leave the API with none.
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
  // MUST be >= the consumer's timeout below. SST defaults this to 30 SECONDS,
  // which is far shorter than a batch's worst case (see the per-batch budget
  // above) — SQS would then hand the same message to a second invocation while
  // the first is still working, doubling RobTop calls at exactly the moment
  // RobTop is throttling us, and burning the receive count on a message that
  // was never actually failing.
  //
  // It is also the redelivery gap the worker's unreachable path relies on: it
  // fails the batch on purpose so SQS retries it later, and "later" has to be
  // long enough for a RobTop 429 cooldown (60s–5min) to clear. At 15 minutes
  // the 3 retries span ~45 minutes, comfortably past any cooldown; at the
  // 30-second default all three would be spent inside it and the message would
  // hit the DLQ with its stubs still unenriched.
  visibilityTimeout: '15 minutes',
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
    concurrency: { reserved: 5 },
  },
  {
    batch: { size: 1 },
    // Cap in-flight seed batches at 5, matching the reserved concurrency above.
    // This is the event source mapping's scaling config — how hard SQS pushes —
    // and it is set alongside the reservation rather than instead of it. (It
    // used to be the only cap available: the account limit was 10, and AWS
    // rejects a reservation that would leave too little unreserved, so
    // `concurrency.reserved` was unusable until that limit was raised to 1000.)
    // Valid range is 2–1000.
    transform: {
      eventSourceMapping: {
        scalingConfig: { maximumConcurrency: 5 },
      },
    },
  }
)
