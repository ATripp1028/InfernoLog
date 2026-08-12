// The collection resource itself (the entries it holds live in entries.ts):
//
//   GET    /v1/me/collections
//   POST   /v1/me/collections
//   GET    /v1/me/collections/:collectionId
//   PATCH  /v1/me/collections/:collectionId
//   DELETE /v1/me/collections/:collectionId
//
// Thin HTTP shell over services/collections.ts. Service errors are thrown, not
// caught here — the module's onError maps them (see errors.ts).

import { Hono } from 'hono'
import {
  CreateCollectionInputSchema,
  UpdateCollectionInputSchema,
} from '@infernolog/core'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import {
  createCollection,
  deleteCollection,
  getCollectionDetail,
  getCollections,
  updateCollection,
} from '../../services/collections'
import { parseJsonBody } from '../../utils/requestBody'

const app = new Hono<{ Variables: HonoVariables }>()

app.get('/me/collections', async (c) => {
  const userId = c.get('userId')
  return c.json({ data: await getCollections(userId) })
})

app.post('/me/collections', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseJsonBody(c, CreateCollectionInputSchema)
  if (!parsed.ok) return parsed.response

  const detail = await createCollection(userId, parsed.data)
  logger.info({ userId, collectionId: detail.id }, 'Collection created')
  return c.json({ data: detail })
})

app.get('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId')
  const detail = await getCollectionDetail(userId, c.req.param('collectionId'))
  return c.json({ data: detail })
})

app.patch('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseJsonBody(c, UpdateCollectionInputSchema)
  if (!parsed.ok) return parsed.response

  const detail = await updateCollection(
    userId,
    c.req.param('collectionId'),
    parsed.data
  )
  return c.json({ data: detail })
})

app.delete('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId')
  await deleteCollection(userId, c.req.param('collectionId'))
  return c.body(null, 204)
})

export default app
