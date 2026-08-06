// The levels held by a collection:
//
//   POST   /v1/me/collections/:collectionId/entries
//   PATCH  /v1/me/collections/:collectionId/entries/:entryId
//   DELETE /v1/me/collections/:collectionId/entries/:entryId
//
// Adding an already-present level is an idempotent no-op. Reorder sends the two
// neighbour entry ids (prevId / nextId) and the service bisects their fractional
// indices, renormalising when the gap closes (utils/fractionalIndex.ts).
//
// Want to Beat is the one collection with membership constraints — it accepts
// only uncompleted levels, and completion write paths auto-remove from it.
//
// Service errors are thrown, not caught here — see errors.ts.

import { Hono } from 'hono'
import {
  AddCollectionEntryInputSchema,
  ReorderCollectionEntryInputSchema,
} from '@infernolog/core'
import type { HonoVariables } from '../../types/hono'
import { addEntry, removeEntry, reorderEntry } from '../../services/collections'

const app = new Hono<{ Variables: HonoVariables }>()

app.post('/me/collections/:collectionId/entries', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = AddCollectionEntryInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const entry = await addEntry(
    userId,
    c.req.param('collectionId'),
    parsed.data.levelId
  )
  return c.json({ data: entry })
})

app.patch('/me/collections/:collectionId/entries/:entryId', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = ReorderCollectionEntryInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const entry = await reorderEntry(
    userId,
    c.req.param('collectionId'),
    c.req.param('entryId'),
    parsed.data
  )
  return c.json({ data: entry })
})

app.delete('/me/collections/:collectionId/entries/:entryId', async (c) => {
  const userId = c.get('userId') as string
  const result = await removeEntry(
    userId,
    c.req.param('collectionId'),
    c.req.param('entryId')
  )
  return c.json({ data: result })
})

export default app
