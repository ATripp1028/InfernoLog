// Shared token-bucket rate limiter for the PUBLIC GDDL level lookup, gated
// inside fetchGddlLevel (utils/gddl.ts) so callers don't need to know it
// exists. Modelled on utils/robtopRateLimit.ts — read that module's header for
// why the bucket lives in Postgres rather than in memory (Lambda invocations
// share no memory, so an in-process bucket only ever paces one invocation).
//
// GDDL is the one community source that publishes a limit, and it is tight:
//
//   x-ratelimit-limit: 100
//   x-ratelimit-reset: 60
//
// 100 requests per 60s per IP — a 600ms floor — against an egress IP shared by
// the sync cron, /resolve, the GD search escalation and the import worker. Each
// path individually looks well-behaved; their sum is what trips it.
//
// UNLIKE THE ROBTOP LIMITER, THIS ONE NEVER WAITS. A denied call returns
// `undefined` from fetchGddlLevel, which the community merge reads as "GDDL had
// no opinion this pass" — it leaves GDDL's fields untouched and backdates the
// level's checkedAt so a later lap picks it up. Waiting would buy nothing: the
// data is cached metadata, not something a user is blocked on.

import prisma from './prisma'

// Slightly under GDDL's measured 1.67/s ceiling, so the steady rate cannot
// itself trip the limit even with clock skew between the bucket and GDDL's
// own window.
const CAPACITY = 3
const REFILL_PER_SEC = 1.4

/** Backoff applied when GDDL 429s without a usable `Retry-After`. */
export const DEFAULT_COOLDOWN_MS = 60_000

/**
 * Hard ceiling on any cooldown, so a bogus or huge `Retry-After` from upstream
 * can't wedge every consumer for a long time.
 */
export const MAX_COOLDOWN_MS = 5 * 60_000

// Attempts to take one token, refilling first based on elapsed time since the
// last refill (capped at CAPACITY). A token is never granted while the shared
// cooldown is active, so all consumers back off together. One atomic statement,
// exactly as in robtopRateLimit.
async function tryAcquire(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ acquired: boolean }[]>`
    WITH upd AS (
      UPDATE "gddl_rate_limit"
      SET tokens = LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) - 1,
          "lastRefillAt" = now()
      WHERE id = 'singleton'
        AND ("cooldownUntil" IS NULL OR "cooldownUntil" <= now())
        AND LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) >= 1
      RETURNING tokens
    )
    SELECT (SELECT count(*) FROM upd) > 0 AS acquired
  `
  return rows[0]?.acquired ?? false
}

/**
 * Records a GDDL 429 by opening (or extending) a shared cooldown, during which
 * no consumer is granted a token. Only ever pushes the cooldown later, never
 * earlier. Best-effort: a failure here must not change the outcome of the
 * request that reported it.
 *
 * @param cooldownMs - How long to back off, clamped to {@link MAX_COOLDOWN_MS}.
 *   Pass the parsed `Retry-After` when GDDL sends a usable one.
 */
export async function reportGddlThrottled(
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): Promise<void> {
  const ms = Math.min(Math.max(cooldownMs, 0), MAX_COOLDOWN_MS)
  await prisma.$executeRaw`
    UPDATE "gddl_rate_limit"
    SET "cooldownUntil" = GREATEST(
      COALESCE("cooldownUntil", now()),
      now() + ${ms}::double precision * interval '1 millisecond'
    )
    WHERE id = 'singleton'
  `
}

/**
 * Takes one GDDL request slot, or reports that none is available right now.
 *
 * Single attempt, no polling — see this module's header. A false return is not
 * an error: fetchGddlLevel turns it into the same "no opinion" outcome as a
 * timeout, and the level is re-checked on a later lap.
 *
 * @returns True once a token was taken; false when the bucket is empty or a
 *   shared cooldown is open.
 */
export async function acquireGddlSlot(): Promise<boolean> {
  return tryAcquire()
}
