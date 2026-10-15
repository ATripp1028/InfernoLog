// One place for the "unexpected error → log, report, 500" tail that every
// route module needs, plus the Prisma error predicates routes branch on.
//
// Before this, ~30 handlers each carried their own try/catch whose body was
// the same four lines (console.error with a hand-written route label, Sentry
// capture, generic 500). Hand-written labels drift from the routes they name,
// `console.error` bypasses the Pino logger the rest of the API uses, and a
// handler that forgot the catch returned a Hono default instead. The
// collections and ranking modules had already replaced theirs with a single
// `app.onError`; this generalizes that pattern so every module shares it.
//
// Handlers now let domain errors propagate. Each module registers one handler
// (see any routes/*/index.ts) that maps its own error classes to statuses and
// delegates everything else here.

import type { Context, ErrorHandler } from 'hono'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger'
import type { HonoVariables } from '../types/hono'

/** The Hono environment every route module in this API is typed against. */
export type RouteEnv = { Variables: HonoVariables }
/** A request context carrying {@link HonoVariables}. */
export type RouteContext = Context<RouteEnv>

/**
 * Maps one module's own error classes onto responses.
 *
 * Return `undefined` for anything the module doesn't recognize — the error then
 * falls through to the generic 500 tail, which logs and reports it.
 */
export type DomainErrorMap = (
  error: Error,
  c: RouteContext
) => Response | undefined

/**
 * Builds the `app.onError` handler for a route module.
 *
 * The returned handler tries `mapDomainError` first, then falls back to
 * logging the error against the matched route pattern, reporting it to Sentry,
 * and returning a generic 500. Nothing beyond the status leaks to the client.
 *
 * The log line uses `c.req.routePath` — the matched pattern, e.g.
 * `/me/collections/:collectionId` — so labels stay accurate on their own
 * rather than being hand-maintained per handler.
 *
 * @param moduleLabel - Route module name, used as the log message (e.g. `'Collections'` → `'Collections route error'`).
 * @param mapDomainError - Optional mapper for the module's expected error classes.
 *
 * @example
 * app.onError(
 *   createErrorHandler('Ranking', (error, c) => {
 *     if (error instanceof RankingNotFoundError) return c.json({ error: error.message }, 404)
 *     return undefined
 *   })
 * )
 */
export function createErrorHandler(
  moduleLabel: string,
  mapDomainError?: DomainErrorMap
): ErrorHandler<RouteEnv> {
  return (error, c) => {
    const mapped = mapDomainError?.(error, c)
    if (mapped) return mapped

    logger.error(
      { path: `${c.req.method} ${c.req.routePath}`, err: error },
      `${moduleLabel} route error`
    )
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

/**
 * True for a Postgres unique-constraint violation surfaced by Prisma (P2002).
 *
 * Routes that pre-check uniqueness still need this: the pre-check is TOCTOU,
 * and the constraint is the real guarantee. Which message a violation deserves
 * depends on the constraint, so callers translate it themselves rather than
 * this returning a response.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}
