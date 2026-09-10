// Level-cache sync worker — EventBridge Scheduler → Lambda. A frequent cron
// fires this; each run processes one bounded round-robin slice of the live level
// cache against RobTop (runLevelSyncSlice), a small slice of the delisted set to
// notice any reuploads (runDelistedReverifySlice), one bulk refresh of the AREDL
// list (runAredlListSync) and a slice of the community-list rotation
// (runCommunitySyncSlice). All logic lives in the shared sync core. See
// services/levels/sync.ts and EXTERNAL_APIS.md.

import {
  runLevelSyncSlice,
  runDelistedReverifySlice,
  runAredlListSync,
  runCommunitySyncSlice,
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
 * The community passes run LAST and unconditionally: they talk to different
 * hosts, so a RobTop outage says nothing about whether they can do their work.
 * They are also the passes that must not be skipped on an aborted run, since
 * list placements go stale far faster than RobTop metadata does.
 *
 * The AREDL list pass goes first of the two and hands its result to the
 * rotation: one bulk request refreshes every placed level's rank and doubles as
 * the membership oracle that keeps the rotation from asking AREDL about levels
 * that were never on it.
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
    const aredlList = await runAredlListSync()
    await runCommunitySyncSlice(aredlList)
  } catch (err) {
    logger.error({ err }, 'levelSyncWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
