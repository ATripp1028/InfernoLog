// RobTop level-cache sync worker — EventBridge Scheduler → Lambda. A frequent
// cron fires this; each run processes one bounded round-robin slice of the
// level cache (see runLevelSyncSlice). All logic lives in the shared sync core.
// See services/levelSync.ts and EXTERNAL_APIS.md.

import { runLevelSyncSlice } from '../services/levelSync'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

export const handler = async (): Promise<void> => {
  try {
    await runLevelSyncSlice()
  } catch (err) {
    logger.error({ err }, 'levelSyncWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
