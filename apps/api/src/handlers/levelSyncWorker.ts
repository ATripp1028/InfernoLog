// Level-cache sync worker — EventBridge Scheduler → Lambda. A frequent cron
// fires this; each run processes one bounded round-robin slice of the live level
// cache against RobTop (runLevelSyncSlice), a small slice of the delisted set to
// notice any reuploads (runDelistedReverifySlice), and a slice of the Global
// Stats Viewer rotation (runGsvSyncSlice). All logic lives in the shared sync
// core. See services/levels/sync.ts and EXTERNAL_APIS.md.

import {
  runLevelSyncSlice,
  runDelistedReverifySlice,
  runGsvSyncSlice,
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
 * The GSV slice runs LAST and unconditionally: it talks to a different host, so
 * a RobTop outage says nothing about whether it can do its work. It is also the
 * one pass that must not be skipped on an aborted run, since list placements go
 * stale far faster than RobTop metadata does.
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
    await runGsvSyncSlice()
  } catch (err) {
    logger.error({ err }, 'levelSyncWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
