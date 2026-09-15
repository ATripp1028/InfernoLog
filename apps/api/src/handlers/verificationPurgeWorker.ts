// Email-verification purge worker — EventBridge Scheduler → Lambda, hourly.
// Deletes verification rows past their 24-hour retention, which is both the
// end of the rate-limit ledger's usefulness and the bound on how long a
// requester's hashed IP is kept. See services/verification.

import * as Sentry from '@sentry/aws-serverless'
import { purgeExpiredVerifications } from '../services/verification'
import { logger } from '../utils/logger'

/**
 * Cron entry point for the verification purge.
 *
 * A failed run is rethrown so it shows as a Lambda error; the next hourly run
 * catches up, since it deletes everything past retention rather than one
 * hour's worth.
 */
export const handler = async (): Promise<void> => {
  try {
    const deleted = await purgeExpiredVerifications()
    logger.info({ deleted }, 'verificationPurgeWorker: purged expired rows')
  } catch (err) {
    logger.error({ err }, 'verificationPurgeWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
