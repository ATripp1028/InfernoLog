// RobTop reachability canary — one cheap request on a frequent cron, purely so
// we learn that GD's servers have stopped answering us within minutes rather
// than inferring it from the level sync's circuit breaker up to six hours later
// (how the Aug 2026 Cloudflare block was found).
//
// Deliberately tiny: a single getGJLevels21 call for one known-good level. It
// goes through the same shared rate limiter as every other RobTop path, so it
// competes for the same budget as user-facing resolves — at one call per run
// that is noise, but it is the reason this must not grow into a multi-level
// health sweep.

import { fetchRobtopLevelResult } from '../../utils/robtop'
import { isRobtopCooling } from '../../utils/robtopRateLimit'
import { logger } from '../../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

/**
 * The level the canary asks for. 128 ("1st level") is one of the oldest levels
 * on the servers and has outlived every outage so far, which is the only
 * property that matters here. Overridable so a stage can point at something
 * else without a deploy — and so this is fixable by config if the level ever
 * does disappear.
 */
const CANARY_LEVEL_ID = process.env.ROBTOP_CANARY_LEVEL_ID ?? '128'

/**
 * How long the canary waits for a shared rate-limiter slot, well above the
 * limiter's user-facing default.
 *
 * A limiter timeout comes back from `fetchRobtopLevelResult` as `unreachable`,
 * indistinguishable from RobTop refusing us — so with the default 10s wait a
 * merely-drained token bucket pages as an outage. The level sync alone paces at
 * 670ms/level against a 1.5/s refill, so the bucket sits at its edge for the
 * length of every slice and any concurrent user resolve empties it. Waiting
 * 30s (≈45 tokens' worth of refill) leaves an open cooldown as the only thing
 * that can deny the canary a slot — and a cooldown only ever opens on a real
 * 429 or Cloudflare block, which is exactly what this is here to report.
 *
 * Must stay comfortably inside the cron's Lambda timeout (see infra/cron.ts):
 * this wait plus one 5s fetch is the run's worst case.
 */
const CANARY_LIMITER_WAIT_MS = 30_000

/**
 * Outcome of one canary run:
 *   - 'healthy'      → RobTop answered with the level. Nothing to see.
 *   - 'cooling'      → a shared cooldown is open, so we deliberately did not
 *                      call. Not an outage, and not alerted on: whatever opened
 *                      the cooldown has already reported itself.
 *   - 'unreachable'  → RobTop would not answer. This is the alarm.
 *   - 'level_missing' → RobTop answered, but says this level does not exist.
 *                      That is a canary-configuration problem (the level was
 *                      deleted), NOT an outage — alerted separately so it never
 *                      reads as one.
 */
export type CanaryOutcome =
  | 'healthy'
  | 'cooling'
  | 'unreachable'
  | 'level_missing'

/**
 * Runs one reachability check against RobTop.
 *
 * No RobTop failure throws: `fetchRobtopLevelResult` swallows every one of
 * them, so an outage comes back as an outcome rather than as a Lambda error
 * that would look like a different problem. Something genuinely unexpected —
 * the cooldown read failing, say — still propagates, and the worker turns that
 * into a failed run on purpose.
 *
 * @returns What the check found; see {@link CanaryOutcome}.
 */
export async function runRobtopCanary(): Promise<CanaryOutcome> {
  if (await isRobtopCooling()) {
    logger.info(
      { levelId: CANARY_LEVEL_ID },
      'robtopCanary: cooldown active; skipping check'
    )
    return 'cooling'
  }

  const result = await fetchRobtopLevelResult(
    CANARY_LEVEL_ID,
    CANARY_LIMITER_WAIT_MS
  )

  if (result.status === 'found') {
    logger.info({ levelId: CANARY_LEVEL_ID }, 'robtopCanary: RobTop reachable')
    return 'healthy'
  }

  if (result.status === 'not_found') {
    // The canary level itself is gone — pick a new one. Says nothing about
    // RobTop's health, so it must not page as an outage.
    logger.error(
      { levelId: CANARY_LEVEL_ID },
      'robtopCanary: canary level no longer exists; pick a new ROBTOP_CANARY_LEVEL_ID'
    )
    Sentry.captureMessage(
      `robtopCanary: canary level ${CANARY_LEVEL_ID} no longer exists — set ROBTOP_CANARY_LEVEL_ID to a live level`,
      'warning'
    )
    return 'level_missing'
  }

  logger.error({ levelId: CANARY_LEVEL_ID }, 'robtopCanary: RobTop unreachable')
  Sentry.captureMessage(
    `robtopCanary: RobTop unreachable (level ${CANARY_LEVEL_ID}) — see the fetchRobtopLevel log line for the status and cf-ray`,
    'error'
  )
  return 'unreachable'
}
