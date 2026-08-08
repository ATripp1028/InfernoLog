// RobTop level-cache sync worker — EventBridge Scheduler → Lambda. A frequent
// cron fires this; each run processes one bounded round-robin slice of the live
// level cache (runLevelSyncSlice), then a small slice of the delisted set to
// notice any reuploads (runDelistedReverifySlice). All logic lives in the shared
// sync core. See services/levelSync.ts and EXTERNAL_APIS.md.

import {
  runLevelSyncSlice,
  runDelistedReverifySlice,
} from '../services/levels/sync'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

/**
 * Cron entry point for the RobTop level-cache sync (EventBridge Scheduler →
 * Lambda).
 *
 * Each run processes one bounded round-robin slice of the live cache, then a
 * small slice of the delisted set to notice reuploads. The reverify pass is
 * skipped when the main slice aborted — that means RobTop was failing the run,
 * so re-checking delisted levels would only burn unreachable calls.
 *
 * Rethrows after logging so a failed run is visible as a Lambda error, not just
 * a log line.
 */
export const handler = async (): Promise<void> => {
  try {
    const result = await runLevelSyncSlice()
    // Skip the reverify pass when the main slice aborted — RobTop was failing the
    // run, so re-checking delisted levels would just churn unreachable calls.
    if (!result.aborted) {
      await runDelistedReverifySlice()
    }
  } catch (err) {
    logger.error({ err }, 'levelSyncWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
