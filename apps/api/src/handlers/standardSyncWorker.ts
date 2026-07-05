// Monthly "standard" RobTop sync — EventBridge Scheduler → Lambda. Re-checks
// rated levels the weekly volatile job doesn't already cover (rating status
// older than the volatile window, or never stamped). All logic lives in the
// shared sync core. See services/levelSync.ts and EXTERNAL_APIS.md.

import { runStandardSync } from '../services/levelSync'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

export const handler = async (): Promise<void> => {
  try {
    await runStandardSync()
  } catch (err) {
    logger.error({ err }, 'standardSyncWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
