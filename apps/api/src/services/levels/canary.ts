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

import type { RobtopUnreachableReason } from '../../utils/robtop'
import { fetchRobtopLevelResult } from '../../utils/robtop'
import { isRobtopCooling } from '../../utils/robtopRateLimit'
import { logger } from '../../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

/**
 * The level the canary asks for. 128 ("1st level") is one of the oldest levels
 * on the servers and has outlived every outage so far, which is the only
 * property that matters here.
 *
 * A constant rather than configuration: the day this level disappears is the
 * day the `level_missing` alarm below fires, and changing one line then is
 * simpler than carrying an env var nothing ever sets.
 */
const CANARY_LEVEL_ID = '128'

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
 * Must stay comfortably inside the cron's Lambda timeout (see infra/cron.ts).
 * The run's worst case is TWO samples — this wait plus a 5s fetch each — either
 * side of CANARY_RETRY_DELAY_MS, so ~73s of a 2-minute budget.
 */
const CANARY_LIMITER_WAIT_MS = 30_000

/**
 * How long to wait before re-sampling after a failed check.
 *
 * The canary alerts on a FAILED PAIR, never on a single failure. RobTop answers
 * in ~300ms against a 5s timeout, so a lone request occasionally overrunning it
 * is upstream noise, not a state change — and on 15-minute runs that noise
 * pages roughly every couple of days, which is how a canary gets ignored (the
 * exact failure that let the Aug 2026 block go unnoticed for six hours). One
 * observed false alarm, on 2026-08-27, was precisely this: a single AbortError
 * between 191 healthy checks.
 *
 * A real refusal fails both samples, so this costs detection nothing — at most
 * this delay plus one extra request, and only ever on the failure path.
 */
const CANARY_RETRY_DELAY_MS = 3_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Outcome of one canary run:
 *   - 'healthy'      → RobTop answered with the level. Nothing to see.
 *   - 'cooling'      → a shared cooldown is open, so we deliberately did not
 *                      call. Not an outage, and not alerted on: whatever opened
 *                      the cooldown has already reported itself.
 *   - 'recovered'    → the first sample failed and the retry succeeded. Logged,
 *                      never alerted: this is the transient blip the retry
 *                      exists to absorb, and it is worth seeing in the logs if
 *                      it starts happening often.
 *   - 'unreachable'  → BOTH samples failed. This is the alarm.
 *   - 'level_missing' → RobTop answered, but says this level does not exist.
 *                      That is a canary-configuration problem (the level was
 *                      deleted), NOT an outage — alerted separately so it never
 *                      reads as one.
 */
export type CanaryOutcome =
  | 'healthy'
  | 'cooling'
  | 'recovered'
  | 'unreachable'
  | 'level_missing'

/**
 * Classifies the result of one sample, so the run logic reads as three cases
 * rather than a chain of status checks.
 */
type Sample =
  | { kind: 'ok' }
  | { kind: 'gone' }
  | { kind: 'failed'; reason: RobtopUnreachableReason }

/** Takes one sample: a single getGJLevels21 call for the canary level. */
async function sample(): Promise<Sample> {
  const result = await fetchRobtopLevelResult(
    CANARY_LEVEL_ID,
    CANARY_LIMITER_WAIT_MS
  )
  if (result.status === 'found') return { kind: 'ok' }
  if (result.status === 'not_found') return { kind: 'gone' }
  return { kind: 'failed', reason: result.reason }
}

/**
 * Reports that the canary level itself no longer exists — a problem with this
 * file, not with RobTop, so it is raised as a warning that cannot be mistaken
 * for an outage.
 */
function reportLevelMissing(): CanaryOutcome {
  logger.error(
    { levelId: CANARY_LEVEL_ID },
    'robtopCanary: canary level no longer exists; point CANARY_LEVEL_ID at a live level'
  )
  Sentry.captureMessage(
    `robtopCanary: canary level ${CANARY_LEVEL_ID} no longer exists — point CANARY_LEVEL_ID (services/levels/canary.ts) at a live level`,
    'warning'
  )
  return 'level_missing'
}

/**
 * Raises the outage alarm, with the runbook that fits what actually happened.
 *
 * The distinction matters more than it looks. A refusal (`blocked`/`throttled`)
 * is answerable ONLY by running the same request from elsewhere while it is
 * still happening, so the alert says so. A timeout or network failure is not a
 * refusal — nobody said no — and sending someone to compare egress IPs over one
 * would waste the window and teach them to distrust the alert.
 *
 * Note a block usually shows as `blocked` then `limiter`: the 403 opens the
 * shared cooldown, which then denies the retry its slot. Both reasons are
 * reported so that sequence is legible rather than looking like two unrelated
 * failures.
 */
function reportUnreachable(
  first: RobtopUnreachableReason,
  second: RobtopUnreachableReason
): CanaryOutcome {
  const refused =
    first === 'blocked' ||
    first === 'throttled' ||
    second === 'blocked' ||
    second === 'throttled'

  logger.error(
    { levelId: CANARY_LEVEL_ID, first, second, refused },
    'robtopCanary: RobTop unreachable'
  )
  Sentry.captureMessage(
    refused
      ? `robtopCanary: RobTop REFUSED us (${first} then ${second}) — check the fetchRobtopLevel log line for status/cf-ray, then run \`pnpm probe:robtop\` from a non-AWS machine while this is still firing: if it succeeds, the block is on our egress IP rather than our request`
      : `robtopCanary: RobTop did not answer twice (${first} then ${second}) — NOT a refusal, so this is a timeout or network failure rather than a block; check the fetchRobtopLevel log lines before treating it as one`,
    'error'
  )
  return 'unreachable'
}

/**
 * Runs one reachability check against RobTop, alerting only on a failed pair.
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

  const first = await sample()
  if (first.kind === 'ok') {
    logger.info({ levelId: CANARY_LEVEL_ID }, 'robtopCanary: RobTop reachable')
    return 'healthy'
  }
  // A not-found is a definite answer from a reachable server. Re-sampling would
  // only ask a working server the same question twice.
  if (first.kind === 'gone') return reportLevelMissing()

  await sleep(CANARY_RETRY_DELAY_MS)
  const second = await sample()

  if (second.kind === 'ok') {
    logger.warn(
      { levelId: CANARY_LEVEL_ID, reason: first.reason },
      'robtopCanary: first check failed, retry succeeded; not alerting'
    )
    return 'recovered'
  }
  if (second.kind === 'gone') return reportLevelMissing()

  return reportUnreachable(first.reason, second.reason)
}
