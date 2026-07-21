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

// Attempts to take one token, refilling first based on elapsed time since
// the last refill (capped at CAPACITY). Returns whether a token was taken.
async function tryAcquire(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ tokens: number }[]>`
    UPDATE "robtop_rate_limit"
    SET tokens = LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) - 1,
        "lastRefillAt" = now()
    WHERE id = 'singleton'
      AND LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) >= 1
    RETURNING tokens
  `
  return rows.length > 0
}

// Blocks (polling) until a RobTop request slot is free, or gives up after
// maxWaitMs. Returns false on timeout — fetchRobtopLevel treats that exactly
// like any other failure (network error, non-OK status) and returns null,
// so no caller needs special handling for "the limiter was busy".
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
