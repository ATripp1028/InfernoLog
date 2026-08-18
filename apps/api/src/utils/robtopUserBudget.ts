// Per-user budget for RobTop calls, sitting in front of the shared singleton
// token bucket in robtopRateLimit.ts.
//
// The two are complementary and both are load-bearing. The shared bucket exists
// to keep InfernoLog's AGGREGATE request rate under RobTop's tolerance, so it
// deliberately has no notion of who is spending it — which means one account
// looping a RobTop-reaching endpoint can drain it and degrade level resolution
// for every other user. That is a denial-of-service against InfernoLog's own
// users rather than against RobTop, and the shared bucket cannot see it. This
// module attributes the spend so it can be bounded per account.
//
// WHAT IT DOES NOT LIMIT is the point of the design: a charge happens only when
// a request is genuinely about to call RobTop, never on a cache hit. Resolving
// a level already in the cache is free, and resolving one that isn't caches it,
// so the second lookup is free too. Ordinary use — logging levels, opening
// level pages, browsing the cache — therefore never touches this budget at all.
//
// What it does bound is the traffic the cache CANNOT absorb:
//
//   • GET /v1/levels/:id/resolve and /page for an id GD has no level for. A
//     not-found is deliberately never cached (see services/levels/resolve.ts),
//     so every retry is a fresh RobTop call, forever. Iterating ids is the
//     cheapest possible way to burn the shared bucket.
//   • GET /v1/levels/gd-search, which calls RobTop unconditionally.
//
// The charge is taken BEFORE the call, not after a successful one — otherwise
// the not-found path, the one that cannot be cached away, would be free.

import { Prisma } from '@prisma/client'
import prisma from './prisma'

/**
 * Burst allowance, and also the hourly refill: a user who has been idle for an
 * hour can spend all {@link BUDGET_CAPACITY} at once, and sustains one call
 * every {@link BUDGET_CAPACITY}/3600 seconds thereafter.
 *
 * Sized to be unreachable in real use rather than to be a tight quota. A heavy
 * genuine session — hand-logging a backlog of obscure levels that aren't cached
 * yet, plus a run of explicit GD-search escalations — lands in the dozens. Only
 * deliberate iteration reaches 200.
 */
export const BUDGET_CAPACITY = 200
const REFILL_PER_SEC = BUDGET_CAPACITY / 3600

/**
 * Thrown when a user has spent their RobTop budget.
 *
 * Carries the wait until one token is back so the API can answer with a
 * concrete `Retry-After` instead of an opaque "too many requests" — the routes
 * that raise this are user-facing, and "try again in 4 minutes" is actionable
 * where "rate limited" is not.
 */
export class RobtopBudgetExhaustedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('Too many Geometry Dash server lookups — please wait a moment')
    this.name = 'RobtopBudgetExhaustedError'
  }
}

// How long until the bucket refills to one token, given what it holds now.
// Floored at 1s so a Retry-After is never 0 (which reads as "retry immediately"
// and would invite an instant re-request).
function secondsUntilRefill(tokens: number): number {
  return Math.max(1, Math.ceil((1 - tokens) / REFILL_PER_SEC))
}

/**
 * Spends one token from a user's RobTop budget, or throws if none is left.
 *
 * Call this immediately before a RobTop request made on a user's behalf, and
 * only on the code path that actually issues one — charging on a cache hit
 * would turn a free operation into a metered one and make the limit reachable
 * during normal use.
 *
 * The whole refill-check-decrement cycle is a single atomic statement, for the
 * same reason the shared bucket's is (see robtopRateLimit.ts): Lambda
 * invocations share no memory, so concurrent requests from one user must
 * serialize through Postgres's row lock rather than through anything this code
 * does. `INSERT ... ON CONFLICT DO UPDATE ... WHERE` also creates the row on
 * first use, so an absent row correctly means "full budget" and no backfill was
 * needed when the table was added.
 *
 * @param userId - Internal user UUID from the JWT.
 * @throws {RobtopBudgetExhaustedError} The budget is spent; carries the wait.
 */
export async function chargeRobtopBudget(userId: string): Promise<void> {
  // The refill expression appears three times (twice in the UPDATE, once in the
  // exhausted-path read), so it is built once as a fragment — the same
  // technique services/levels/browse.ts uses to keep a sort expression
  // identical between its SELECT, WHERE and ORDER BY. Every value is still a
  // bound parameter; nothing is string-concatenated into the SQL.
  const refilled = (tokensCol: Prisma.Sql, refillCol: Prisma.Sql) =>
    Prisma.sql`LEAST(${BUDGET_CAPACITY}::float, ${tokensCol} + EXTRACT(EPOCH FROM (now() - ${refillCol})) * ${REFILL_PER_SEC}::float)`

  const onConflict = refilled(
    Prisma.sql`"robtop_user_budget".tokens`,
    Prisma.sql`"robtop_user_budget"."lastRefillAt"`
  )

  const granted = await prisma.$queryRaw<{ tokens: number }[]>(Prisma.sql`
    INSERT INTO "robtop_user_budget" ("userId", tokens, "lastRefillAt")
    VALUES (${userId}, ${BUDGET_CAPACITY}::float - 1, now())
    ON CONFLICT ("userId") DO UPDATE
      SET tokens = ${onConflict} - 1,
          "lastRefillAt" = now()
      WHERE ${onConflict} >= 1
    RETURNING tokens
  `)
  if (granted.length > 0) return

  // Zero rows means the WHERE rejected the update — the bucket is dry. Only
  // this rare path pays for a second query; the granted path is one round trip.
  const [row] = await prisma.$queryRaw<{ tokens: number }[]>(Prisma.sql`
    SELECT ${refilled(Prisma.sql`tokens`, Prisma.sql`"lastRefillAt"`)} AS tokens
    FROM "robtop_user_budget"
    WHERE "userId" = ${userId}
  `)
  throw new RobtopBudgetExhaustedError(secondsUntilRefill(row?.tokens ?? 0))
}
