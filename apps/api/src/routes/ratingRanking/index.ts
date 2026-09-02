// The MANUAL rating mode's ordering — the user's own arrangement of their
// completions by quality, where the position IS the rating.
//
//   GET    /v1/me/ranking          — ranked + unranked columns, ANY mode
//   POST   /v1/me/ranking          — place an unranked entry
//   PATCH  /v1/me/ranking/:levelProgressId   — reorder a ranked entry
//   DELETE /v1/me/ranking/:levelProgressId   — remove (back to the panel)
//
// The READ serves all three rating modes: SIMPLE and WEIGHTED derive the order
// from the ratings (the same comparator the clients and `rating_rank` use),
// MANUAL returns the order the user arranged. The WRITES are MANUAL-only and
// answer 409 otherwise — there is no stored order to rearrange when it is
// derived. The response says which mode produced it and whether it is editable,
// so a consumer need not guess.
//
// MANUAL ordering uses a fractional index (RatingRanking.ratingIndex): higher =
// better, so the list comes back ratingIndex DESC with #1 = best rated. See
// services/ratingRanking and utils/fractionalIndex.
//
// One onError for the module maps the service's error classes to statuses, so
// individual handlers carry no try/catch.
//
// Me-scoped: the user comes from the JWT, never a path segment.

import { Hono } from 'hono'
import {
  PlaceRatingInputSchema,
  ReorderRatingInputSchema,
} from '@infernolog/core'
import type { HonoVariables } from '../../types/hono'
import { createErrorHandler } from '../../middleware/errors'
import {
  getRatingRanking,
  placeRating,
  removeRating,
  reorderRating,
  RatingRankingError,
  RatingRankingModeError,
  RatingRankingNotFoundError,
} from '../../services/ratingRanking'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(
  createErrorHandler('RatingRanking', (error, c) => {
    // The targeted completion / ranking row doesn't exist for this user.
    if (error instanceof RatingRankingNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    // The read serves every mode; the writes only make sense in MANUAL.
    if (error instanceof RatingRankingModeError) {
      return c.json({ error: error.message }, 409)
    }
    // Caller-fixable rule violation (already ranked, bad neighbours, etc.).
    if (error instanceof RatingRankingError) {
      return c.json({ error: error.message }, 400)
    }
    return undefined
  })
)

// Both columns in one payload — no pagination, no query params. The ranking UI
// is a drag-and-drop board over the whole set.
app.get('/me/ranking', async (c) => {
  const data = await getRatingRanking(c.get('userId'))
  return c.json({ data })
})

app.post('/me/ranking', async (c) => {
  const parsed = await parseJsonBody(c, PlaceRatingInputSchema)
  if (!parsed.ok) return parsed.response

  const data = await placeRating(c.get('userId'), parsed.data)
  return c.json({ data }, 201)
})

app.patch('/me/ranking/:levelProgressId', async (c) => {
  const parsed = await parseJsonBody(c, ReorderRatingInputSchema)
  if (!parsed.ok) return parsed.response

  const data = await reorderRating(
    c.get('userId'),
    c.req.param('levelProgressId'),
    parsed.data
  )
  return c.json({ data })
})

app.delete('/me/ranking/:levelProgressId', async (c) => {
  const data = await removeRating(
    c.get('userId'),
    c.req.param('levelProgressId')
  )
  return c.json({ data })
})

export default app
