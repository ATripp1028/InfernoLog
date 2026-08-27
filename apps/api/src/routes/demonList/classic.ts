// The classic-mode personal difficulty ranking:
//
//   GET    /v1/me/demon-list/classic                    — placed + unplaced columns
//   POST   /v1/me/demon-list/classic                    — place an unplaced entry
//   PATCH  /v1/me/demon-list/classic/:levelProgressId   — reorder a placed entry
//   DELETE /v1/me/demon-list/classic/:levelProgressId   — unplace (back to panel)
//
// Thin HTTP shell: all ordering and fractional-indexing logic lives in
// services/demonList.ts. Service errors are thrown, not caught here — the
// module's onError maps them (see errors.ts).
//
// Platformer ranking is planned but unimplemented; it would land beside this
// as platformer.ts (only ClassicDemonList exists in the schema today).

import { Hono } from 'hono'
import {
  PlaceOnDemonListInputSchema,
  ReorderDemonListInputSchema,
} from '@infernolog/core'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import {
  getClassicDemonList,
  placeCompletion,
  reorderEntry,
  unplaceEntry,
} from '../../services/demonList'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

// Both columns in one payload — no pagination, no query params. The ranking UI
// is a drag-and-drop board over the whole set.
app.get('/me/demon-list/classic', async (c) => {
  const userId = c.get('userId')
  const data = await getClassicDemonList(userId)
  return c.json({ data })
})

app.post('/me/demon-list/classic', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseJsonBody(c, PlaceOnDemonListInputSchema)
  if (!parsed.ok) return parsed.response

  const data = await placeCompletion(userId, parsed.data)
  logger.info(
    { userId, levelProgressId: parsed.data.levelProgressId },
    'Placed demon list entry'
  )
  return c.json({ data }, 201)
})

app.patch('/me/demon-list/classic/:levelProgressId', async (c) => {
  const userId = c.get('userId')
  const levelProgressId = c.req.param('levelProgressId')
  const parsed = await parseJsonBody(c, ReorderDemonListInputSchema)
  if (!parsed.ok) return parsed.response

  const data = await reorderEntry(userId, levelProgressId, parsed.data)
  logger.info({ userId, levelProgressId }, 'Reordered demon list entry')
  return c.json({ data })
})

app.delete('/me/demon-list/classic/:levelProgressId', async (c) => {
  const userId = c.get('userId')
  const levelProgressId = c.req.param('levelProgressId')

  const data = await unplaceEntry(userId, levelProgressId)
  logger.info({ userId, levelProgressId }, 'Unplaced demon list entry')
  return c.json({ data })
})

export default app
