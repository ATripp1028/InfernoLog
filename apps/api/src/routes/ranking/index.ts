// The user's personal difficulty ranking — their own ordering of completed
// levels, independent of any community list.
//
//   classic.ts  GET    /v1/me/ranking/classic
//               POST   /v1/me/ranking/classic
//               PATCH  /v1/me/ranking/classic/:levelProgressId
//               DELETE /v1/me/ranking/classic/:levelProgressId
//
// Ordering uses a fractional index (ClassicRanking.rankingIndex): lower =
// easier, higher = harder, so the displayed list is rankingIndex DESC with
// #1 = hardest. See services/ranking.ts and utils/fractionalIndex.ts.
//
// One onError for the module maps the service's error classes to statuses, so
// individual handlers carry no try/catch. It is scoped to these routes —
// sibling modules' errors pass through untouched.
//
// Me-scoped: the user comes from the JWT, never a path segment. The planned
// cross-user read (GET /v1/users/{usernameOrId}/ranking/classic) will land
// here as a public.ts sibling — see docs/API_DESIGN.md.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import classicRoutes from './classic'
import { createErrorHandler } from '../../middleware/errors'
import { RankingError, RankingNotFoundError } from '../../services/ranking'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(
  createErrorHandler('Ranking', (error, c) => {
    // The targeted completion / ranking row doesn't exist for this user.
    if (error instanceof RankingNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    // Caller-fixable rule violation (already placed, bad neighbours, etc.).
    if (error instanceof RankingError) {
      return c.json({ error: error.message }, 400)
    }
    return undefined
  })
)

app.route('/', classicRoutes)

export default app
