// Maps the ranking service's error classes onto HTTP responses.
//
// Registered once as the module's Hono onError (see index.ts) rather than
// repeated per handler. Handlers throw; this decides the status.

import * as Sentry from '@sentry/node'
import type { Context } from 'hono'
import { RankingError, RankingNotFoundError } from '../../services/ranking'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'

type Ctx = Context<{ Variables: HonoVariables }>

export function handleRankingError(error: Error, c: Ctx) {
  // The targeted completion / ranking row doesn't exist for this user.
  if (error instanceof RankingNotFoundError) {
    return c.json({ error: error.message }, 404)
  }
  // Caller-fixable rule violation (already placed, bad neighbours, etc.).
  if (error instanceof RankingError) {
    return c.json({ error: error.message }, 400)
  }

  // routePath is the matched pattern, so the label stays correct without
  // being hand-maintained per handler.
  logger.error(
    { path: `${c.req.method} ${c.req.routePath}`, err: error },
    'Ranking route error'
  )
  Sentry.captureException(error)
  return c.json({ error: 'Internal server error' }, 500)
}
