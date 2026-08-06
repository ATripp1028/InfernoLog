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

const app = new Hono<{ Variables: HonoVariables }>()

app.get('/me/collections', async (c) => {
  const userId = c.get('userId') as string
  return c.json({ data: await getCollections(userId) })
})

app.post('/me/collections', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = CreateCollectionInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const detail = await createCollection(userId, parsed.data)
  logger.info({ userId, collectionId: detail.id }, 'Collection created')
  return c.json({ data: detail })
})

app.get('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId') as string
  const detail = await getCollectionDetail(userId, c.req.param('collectionId'))
  return c.json({ data: detail })
})

app.patch('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = UpdateCollectionInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const detail = await updateCollection(
    userId,
    c.req.param('collectionId'),
    parsed.data
  )
  return c.json({ data: detail })
})

app.delete('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId') as string
  await deleteCollection(userId, c.req.param('collectionId'))
  return c.body(null, 204)
})

export default app
