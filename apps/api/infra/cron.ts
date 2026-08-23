/// <reference path="../.sst/platform/config.d.ts" />

import { sharedEnvironment, sharedLinks } from './api'
import { sharedNodeOptions } from './defaults'

// ─────────────────────────────────────────────
// ROBTOP LEVEL-CACHE SYNC — a single frequent EventBridge Scheduler cron
// over the shared fetch/compare/write core (services/levelSync.ts). Each run
// processes one bounded round-robin slice of the level cache, advancing a
// cursor and wrapping at the end, so every level is re-checked over a full
// rotation without any single run being large enough to trip RobTop's rate
// limit. Overwrites the `levels` cache directly on diff; no staging or nudge.
//
// 15-minute timeout comfortably covers one slice at ~670ms/level RobTop
// pacing. See EXTERNAL_APIS.md.
// ─────────────────────────────────────────────
const syncFunctionOptions = {
  link: sharedLinks,
  environment: sharedEnvironment,
  timeout: '15 minutes' as const,
  // One run at a time; the 6-hour interval far exceeds the 15-minute timeout,
  // so runs cannot overlap. The reservation exists to bound this against the
  // account pool the API shares, not to allow parallelism.
  concurrency: { reserved: 2 },
  ...sharedNodeOptions,
}

// ─────────────────────────────────────────────
// PRODUCTION ONLY.
//
// This cron used to be deployed to every stage, on the same fixed UTC schedule,
// which made all three (production, staging, and each developer's personal
// stage) fire simultaneously four times a day. Two separate problems:
//
//  1. RobTop load. The shared token bucket that paces these calls
//     (utils/robtopRateLimit.ts) is a row in the stage's OWN database, so
//     per-stage limiters know nothing about each other — three stages meant
//     roughly triple the request rate from the same egress, uncoordinated,
//     which is precisely the situation that limiter was built to prevent.
//     Being throttled here is not harmless: before the fix in
//     services/levels/sync.ts a throttled batch mass-delisted live levels, and
//     scripts/undelistFalsePositives.ts exists to repair that damage.
//
//  2. Concurrency. Three 15-minute runs starting at the same instant held
//     three slots of an account-wide pool that every stage's API also draws
//     from.
//
// Non-production stages get nothing from a background cache refresh — no test
// depends on it, and staging's cache is seeded on demand like any user's — so
// the fix is not to stagger the schedules but to stop deploying it three times.
// ─────────────────────────────────────────────
if ($app.stage === 'production') {
  // ─────────────────────────────────────────────
  // ROBTOP REACHABILITY CANARY — one getGJLevels21 call every 15 minutes for a
  // single known-good level, alerting when GD's servers stop answering us.
  //
  // The level sync runs every 6 hours, so without this the first signal that
  // RobTop has cut us off is a circuit-breaker log up to a full interval after
  // it started (exactly how the Aug 2026 Cloudflare block was found — hours
  // late, from a log line nobody was watching). One call per run is negligible
  // against the shared rate limiter, and the canary skips its check entirely
  // while a cooldown is open, so it never adds load to a RobTop that is already
  // refusing us. Production only, for the same reason the sync is: a per-stage
  // canary would multiply an uncoordinated request rate from one egress IP.
  // ─────────────────────────────────────────────
  new sst.aws.CronV2('RobtopCanary', {
    schedule: 'rate(15 minutes)',
    function: {
      handler: 'src/handlers/robtopCanaryWorker.handler',
      link: sharedLinks,
      environment: sharedEnvironment,
      // Bounds one limiter wait (CANARY_LIMITER_WAIT_MS, 30s) plus one fetch
      // (5s) with room to spare.
      timeout: '1 minute' as const,
      ...sharedNodeOptions,
    },
  })

  new sst.aws.CronV2('LevelSync', {
    // Every 6 hours. Each run processes one bounded round-robin slice
    // (SYNC_SLICE_SIZE levels) so no single run can trip RobTop's per-IP rate
    // limit, and the ~6h gap gives the egress IP plenty of recovery time.
    schedule: 'cron(0 0/6 * * ? *)',
    function: {
      handler: 'src/handlers/levelSyncWorker.handler',
      ...syncFunctionOptions,
    },
  })
}
