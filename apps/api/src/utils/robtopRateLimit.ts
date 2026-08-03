// Shared token-bucket rate limiter for every path that hits RobTop's live
// servers, gated inside fetchRobtopLevel (utils/robtop.ts) so callers don't
// need to know it exists. Before this, each caller (levelSeedWorker, the
// volatile/standard sync crons, GET /levels/:id/resolve, gddlListSync,
// gddlSync) paced only its own loop — some not at all — with no shared
// ceiling, so their combined request rate to RobTop was unbounded even
// though each path individually looked well-behaved.
//
// Backed by a single Postgres row (see the RobtopRateLimit model) rather
// than in-memory state, since Lambda invocations don't share memory across
// concurrent executions — an in-process token bucket would only ever
// coordinate the calls made by that one invocation. Each acquire attempt is
// one atomic UPDATE: concurrent invocations racing for the same row
// serialize through Postgres's normal row-level locking rather than through
// any coordination this code has to implement itself.

import prisma from './prisma'

const CAPACITY = 3 // small burst allowance on top of the steady rate
const REFILL_PER_SEC = 1.5 // the steady rate every path individually paced to before
const POLL_MS = 120
const DEFAULT_MAX_WAIT_MS = 10_000

// Default backoff when RobTop 429s without a usable Retry-After, and a hard cap
// so a bogus/huge Retry-After can't wedge every consumer for a long time.
export const DEFAULT_COOLDOWN_MS = 60_000
export const MAX_COOLDOWN_MS = 5 * 60_000

// Attempts to take one token, refilling first based on elapsed time since
// the last refill (capped at CAPACITY). A token is never granted while the
// shared cooldown is active (set by reportRobtopThrottled after a 429), so all
// consumers back off together. Returns whether a token was taken.
async function tryAcquire(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ tokens: number }[]>`
    UPDATE "robtop_rate_limit"
    SET tokens = LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) - 1,
        "lastRefillAt" = now()
    WHERE id = 'singleton'
      AND ("cooldownUntil" IS NULL OR "cooldownUntil" <= now())
      AND LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) >= 1
    RETURNING tokens
  `
  return rows.length > 0
}

// Records a RobTop 429 by opening (or extending) a shared cooldown, during which
// tryAcquire grants nothing — so the whole app stops hitting RobTop and lets the
// per-IP block clear instead of prolonging it. Only ever pushes the cooldown
// later, never earlier. Best-effort; callers should not let a failure here
// change the outcome of their request.
export async function reportRobtopThrottled(
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): Promise<void> {
  const ms = Math.min(Math.max(cooldownMs, 0), MAX_COOLDOWN_MS)
  await prisma.$executeRaw`
    UPDATE "robtop_rate_limit"
    SET "cooldownUntil" = GREATEST(
      COALESCE("cooldownUntil", now()),
      now() + ${ms}::double precision * interval '1 millisecond'
    )
    WHERE id = 'singleton'
  `
}

// Blocks (polling) until a RobTop request slot is free, or gives up after
// maxWaitMs. Returns false on timeout — fetchRobtopLevel treats that exactly
// like any other failure (network error, non-OK status) and returns null, so no
// caller needs special handling for "the limiter was busy" or "we're cooling
// down after a 429". (During a cooldown longer than maxWaitMs a caller simply
// polls out and fails fast enough; the cooldown itself does the real throttling.)
export async function acquireRobtopSlot(
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    if (await tryAcquire()) return true
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
