// RobTop reachability canary worker — EventBridge Scheduler → Lambda. A short
// cron fires this; each run makes one getGJLevels21 call for a known-good level
// and alerts when GD's servers stop answering. All logic lives in the shared
// canary service. See services/levels/canary.ts.

import { runRobtopCanary } from '../services/levels/canary'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

/**
 * Cron entry point for the RobTop reachability canary (EventBridge Scheduler →
 * Lambda).
 *
 * An unreachable result is NOT a handler failure — the canary already reported
 * it, and throwing here would double-report it as a Lambda error too. Only an
 * unexpected throw (a DB read for the cooldown state failing, say) is rethrown,
 * so the run shows up as failed rather than silently doing nothing.
 */
export const handler = async (): Promise<void> => {
  try {
    await runRobtopCanary()
  } catch (err) {
    logger.error({ err }, 'robtopCanaryWorker: unhandled error')
    Sentry.captureException(err)
    throw err
  }
}
