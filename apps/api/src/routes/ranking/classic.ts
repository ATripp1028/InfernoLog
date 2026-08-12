// The classic-mode personal difficulty ranking:
//
//   GET    /v1/me/ranking/classic                    — placed + unplaced columns
//   POST   /v1/me/ranking/classic                    — place an unplaced entry
//   PATCH  /v1/me/ranking/classic/:levelProgressId   — reorder a placed entry
//   DELETE /v1/me/ranking/classic/:levelProgressId   — unplace (back to panel)
//
// Thin HTTP shell: all ordering and fractional-indexing logic lives in
// services/ranking.ts. Service errors are thrown, not caught here — the
// module's onError maps them (see errors.ts).
//
// Platformer ranking is planned but unimplemented; it would land beside this
// as platformer.ts (only ClassicRanking exists in the schema today).

import { Hono } from 'hono'
import {
  PlaceRankingInputSchema,
  ReorderRankingInputSchema,
} from '@infernolog/core'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import {
  getClassicRanking,
  placeCompletion,
  reorderEntry,
  unplaceEntry,
} from '../../services/ranking'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

// Both columns in one payload — no pagination, no query params. The ranking UI
// is a drag-and-drop board over the whole set.
app.get('/me/ranking/classic', async (c) => {
  const userId = c.get('userId')
  const data = await getClassicRanking(userId)
  return c.json({ data })
})

app.post('/me/ranking/classic', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseJsonBody(c, PlaceRankingInputSchema)
  if (!parsed.ok) return parsed.response

  const data = await placeCompletion(userId, parsed.data)
  logger.info(
    { userId, levelProgressId: parsed.data.levelProgressId },
    'Placed ranking entry'
  )
  return c.json({ data }, 201)
})

app.patch('/me/ranking/classic/:levelProgressId', async (c) => {
  const userId = c.get('userId')
  const levelProgressId = c.req.param('levelProgressId')
  const parsed = await parseJsonBody(c, ReorderRankingInputSchema)
  if (!parsed.ok) return parsed.response

  const data = await reorderEntry(userId, levelProgressId, parsed.data)
  logger.info({ userId, levelProgressId }, 'Reordered ranking entry')
  return c.json({ data })
})

app.delete('/me/ranking/classic/:levelProgressId', async (c) => {
  const userId = c.get('userId')
  const levelProgressId = c.req.param('levelProgressId')

  const data = await unplaceEntry(userId, levelProgressId)
  logger.info({ userId, levelProgressId }, 'Unplaced ranking entry')
  return c.json({ data })
})

export default app
