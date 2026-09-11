// The levels held by a collection:
//
//   GET    /v1/me/collections/:collectionId/levels
//   POST   /v1/me/collections/:collectionId/entries
//   POST   /v1/me/collections/:collectionId/entries/copy
//   PATCH  /v1/me/collections/:collectionId/entries/:entryId
//   DELETE /v1/me/collections/:collectionId/entries/:entryId
//
// Adding an already-present level is an idempotent no-op. Reorder sends the two
// neighbour entry ids (prevId / nextId) and the service bisects their fractional
// indices, renormalising when the gap closes (utils/fractionalIndex.ts).
//
// GET …/levels is the /search page's browse scoped to one collection — the
// same query string, the same sorts and filters, plus each row's entry id.
//
// Want to Beat is the one collection with membership constraints — it accepts
// only uncompleted levels, and completion write paths auto-remove from it.
//
// Service errors are thrown, not caught here — see errors.ts.

import { Hono } from 'hono'
import {
  AddCollectionEntryInputSchema,
  CopyCollectionEntriesInputSchema,
  ReorderCollectionEntryInputSchema,
} from '@infernolog/core'
import type { HonoVariables } from '../../types/hono'
import {
  addEntry,
  browseCollection,
  copyEntries,
  removeEntry,
  reorderEntry,
} from '../../services/collections'
import { logger } from '../../utils/logger'
import { parseBrowseQuery } from '../../utils/browseQuery'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

app.get('/me/collections/:collectionId/levels', async (c) => {
  const userId = c.get('userId')
  const parsed = parseBrowseQuery(new URL(c.req.url).searchParams)
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  const result = await browseCollection(
    userId,
    c.req.param('collectionId'),
    parsed.data
  )
  return c.json(result)
})

// Registered before the /:entryId routes for readability only — they are
// PATCH/DELETE, so "copy" can never match as an entry id here.
app.post('/me/collections/:collectionId/entries/copy', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseJsonBody(c, CopyCollectionEntriesInputSchema)
  if (!parsed.ok) return parsed.response

  const result = await copyEntries(
    userId,
    c.req.param('collectionId'),
    parsed.data.sourceCollectionId
  )
  logger.info(
    {
      userId,
      collectionId: result.collection.id,
      sourceCollectionId: parsed.data.sourceCollectionId,
      added: result.added,
    },
    'Collection entries copied'
  )
  return c.json({ data: result })
})

app.post('/me/collections/:collectionId/entries', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseJsonBody(c, AddCollectionEntryInputSchema)
  if (!parsed.ok) return parsed.response

  const entry = await addEntry(
    userId,
    c.req.param('collectionId'),
    parsed.data.levelId
  )
  return c.json({ data: entry })
})

app.patch('/me/collections/:collectionId/entries/:entryId', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseJsonBody(c, ReorderCollectionEntryInputSchema)
  if (!parsed.ok) return parsed.response

  const entry = await reorderEntry(
    userId,
    c.req.param('collectionId'),
    c.req.param('entryId'),
    parsed.data
  )
  return c.json({ data: entry })
})

app.delete('/me/collections/:collectionId/entries/:entryId', async (c) => {
  const userId = c.get('userId')
  const result = await removeEntry(
    userId,
    c.req.param('collectionId'),
    c.req.param('entryId')
  )
  return c.json({ data: result })
})

export default app
