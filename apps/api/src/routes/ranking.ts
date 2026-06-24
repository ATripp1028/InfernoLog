// Classic-ranking endpoints (me-scoped):
//   GET    /v1/me/ranking/classic                    — placed + unplaced columns
//   POST   /v1/me/ranking/classic                    — place an unplaced entry
//   PATCH  /v1/me/ranking/classic/:levelProgressId   — reorder a placed entry
//   DELETE /v1/me/ranking/classic/:levelProgressId   — unplace (back to panel)
//
// The authed user always comes from the JWT (c.get('userId')). All ordering /
// fractional-indexing logic lives in services/ranking.ts; these handlers only
// parse, dispatch, and map service errors to status codes.

import { Hono } from 'hono'
import type { Context } from 'hono'
import * as Sentry from '@sentry/node'
import {
  PlaceRankingInputSchema,
  ReorderRankingInputSchema,
} from '@infernolog/core'
import { logger } from '../utils/logger'
import type { HonoVariables } from '../types/hono'
import {
  getClassicRanking,
  placeCompletion,
  reorderEntry,
  unplaceEntry,
  RankingError,
  RankingNotFoundError,
} from '../services/ranking'

const app = new Hono<{ Variables: HonoVariables }>()

// Shared error→status mapping for the three writes.
function handleError(c: Context<{ Variables: HonoVariables }>, error: unknown) {
  if (error instanceof RankingNotFoundError) {
    return c.json({ error: error.message }, 404)
  }
  if (error instanceof RankingError) {
    return c.json({ error: error.message }, 400)
  }
  Sentry.captureException(error)
  return c.json({ error: 'Internal server error' }, 500)
}

// GET /v1/me/ranking/classic — both columns in one payload.
app.get('/me/ranking/classic', async (c) => {
  const userId = c.get('userId') as string
  try {
    const data = await getClassicRanking(userId)
    return c.json({ data })
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/ranking/classic — place an unplaced completion.
app.post('/me/ranking/classic', async (c) => {
  const userId = c.get('userId') as string
  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = PlaceRankingInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const data = await placeCompletion(userId, parsed.data)
    logger.info(
      { userId, levelProgressId: parsed.data.levelProgressId },
      'Placed ranking entry'
    )
    return c.json({ data }, 201)
  } catch (error) {
    return handleError(c, error)
  }
})

// PATCH /v1/me/ranking/classic/:levelProgressId — reorder a placed entry.
app.patch('/me/ranking/classic/:levelProgressId', async (c) => {
  const userId = c.get('userId') as string
  const levelProgressId = c.req.param('levelProgressId')
  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ReorderRankingInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const data = await reorderEntry(userId, levelProgressId, parsed.data)
    logger.info({ userId, levelProgressId }, 'Reordered ranking entry')
    return c.json({ data })
  } catch (error) {
    return handleError(c, error)
  }
})

// DELETE /v1/me/ranking/classic/:levelProgressId — unplace.
app.delete('/me/ranking/classic/:levelProgressId', async (c) => {
  const userId = c.get('userId') as string
  const levelProgressId = c.req.param('levelProgressId')
  try {
    const data = await unplaceEntry(userId, levelProgressId)
    logger.info({ userId, levelProgressId }, 'Unplaced ranking entry')
    return c.json({ data })
  } catch (error) {
    return handleError(c, error)
  }
})

export default app
