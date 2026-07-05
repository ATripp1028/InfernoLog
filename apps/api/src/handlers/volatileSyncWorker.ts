// Weekly "volatile" RobTop sync — EventBridge Scheduler → Lambda. Re-checks
// never-rated levels and recently-rated levels (inside the volatile window)
// against GD's servers. All logic lives in the shared sync core. See
// services/levelSync.ts and EXTERNAL_APIS.md.

import { runVolatileSync } from '../services/levelSync'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

export const handler = async (): Promise<void> => {
  try {
    await runVolatileSync()
  } catch (err) {
    logger.error({ err }, 'volatileSyncWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
