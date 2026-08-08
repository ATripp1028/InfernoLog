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
  ...sharedNodeOptions,
}

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
