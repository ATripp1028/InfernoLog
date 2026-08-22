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

/**
 * Default backoff when RobTop 429s without a usable Retry-After, and a hard cap
 * so a bogus/huge Retry-After can't wedge every consumer for a long time.
 */
/** Backoff applied when RobTop 429s without a usable `Retry-After`. */
export const DEFAULT_COOLDOWN_MS = 60_000

/**
 * Hard ceiling on any cooldown, so a bogus or huge `Retry-After` from upstream
 * can't wedge every consumer for a long time.
 */
export const MAX_COOLDOWN_MS = 5 * 60_000

/**
 * Backoff applied when Cloudflare blocks us outright (a 403 block page rather
 * than a RobTop 429). These carry no `Retry-After`, and a WAF/reputation block
 * is not cleared by continuing to hit it — if anything the opposite — so back
 * off for the full window the cap allows and let it age out.
 */
export const BLOCKED_COOLDOWN_MS = MAX_COOLDOWN_MS

// Outcome of one acquire attempt:
//   'acquired' — a token was taken.
//   'cooling'  — a shared 429 cooldown is active, so no token was (or will soon
//                be) granted. Distinct from 'empty' so acquireRobtopSlot can
//                fail fast instead of polling out a cooldown that far outlasts
//                its wait window.
//   'empty'    — the bucket is momentarily out of tokens; a later poll may
//                succeed as it refills.
type AcquireOutcome = 'acquired' | 'cooling' | 'empty'

// Attempts to take one token, refilling first based on elapsed time since
// the last refill (capped at CAPACITY). A token is never granted while the
// shared cooldown is active (set by reportRobtopThrottled after a 429), so all
// consumers back off together. One atomic statement reports both whether a
// token was taken and whether a cooldown is in effect (all now() reads within a
// single statement are consistent).
async function tryAcquire(): Promise<AcquireOutcome> {
  const rows = await prisma.$queryRaw<
    { cooling: boolean; acquired: boolean }[]
  >`
    WITH state AS (
      SELECT ("cooldownUntil" IS NOT NULL AND "cooldownUntil" > now()) AS cooling
      FROM "robtop_rate_limit"
      WHERE id = 'singleton'
    ),
    upd AS (
      UPDATE "robtop_rate_limit"
      SET tokens = LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) - 1,
          "lastRefillAt" = now()
      WHERE id = 'singleton'
        AND ("cooldownUntil" IS NULL OR "cooldownUntil" <= now())
        AND LEAST(${CAPACITY}::float, tokens + EXTRACT(EPOCH FROM (now() - "lastRefillAt")) * ${REFILL_PER_SEC}) >= 1
      RETURNING tokens
    )
    SELECT state.cooling, (SELECT count(*) FROM upd) > 0 AS acquired
    FROM state
  `
  const row = rows[0]
  if (row?.acquired) return 'acquired'
  return row?.cooling ? 'cooling' : 'empty'
}

/**
 * Records a RobTop 429 by opening (or extending) a shared cooldown, during which
 * tryAcquire grants nothing — so the whole app stops hitting RobTop and lets the
 * per-IP block clear instead of prolonging it. Only ever pushes the cooldown
 * later, never earlier. Best-effort; callers should not let a failure here
 * change the outcome of their request.
 */
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

/**
 * Whether a shared cooldown is currently in effect, i.e. every consumer is
 * deliberately holding off after a 429 or a Cloudflare block.
 *
 * Read-only and token-free — it takes nothing from the bucket. Exists so the
 * reachability canary can tell "we are choosing not to call RobTop" apart from
 * "RobTop won't answer us", and stay quiet during a cooldown it would otherwise
 * report as an outage.
 *
 * @returns True while a cooldown is active.
 */
export async function isRobtopCooling(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ cooling: boolean }[]>`
    SELECT ("cooldownUntil" IS NOT NULL AND "cooldownUntil" > now()) AS cooling
    FROM "robtop_rate_limit"
    WHERE id = 'singleton'
  `
  return rows[0]?.cooling ?? false
}

/**
 * Blocks (polling) until a RobTop request slot is free, or gives up after
 * maxWaitMs. Returns false on timeout — fetchRobtopLevel treats that exactly
 * like any other failure (network error, non-OK status) and returns null, so no
 * caller needs special handling for "the limiter was busy" or "we're cooling
 * down after a 429". An active cooldown returns false immediately rather than
 * polling it out: a cooldown is measured in whole minutes and won't clear inside
 * this wait window, so busy-polling the DB for maxWaitMs would just add latency
 * (a user-facing /resolve or /page waiting ~10s) and wasted queries.
 *
 * @param maxWaitMs - How long to keep polling for a token. The default suits a
 *   user-facing request; a background caller that must not read a drained
 *   bucket as an upstream failure (the reachability canary) passes more.
 * @returns True once a token was taken; false on timeout or an open cooldown.
 */
export async function acquireRobtopSlot(
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    const outcome = await tryAcquire()
    if (outcome === 'acquired') return true
    if (outcome === 'cooling') return false
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
