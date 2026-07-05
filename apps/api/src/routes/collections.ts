// Collections routes — thin HTTP shell over services/collections.ts.
//
//   GET    /v1/me/collections
//   POST   /v1/me/collections
//   GET    /v1/me/collections/:collectionId
//   PATCH  /v1/me/collections/:collectionId
//   DELETE /v1/me/collections/:collectionId
//   POST   /v1/me/collections/:collectionId/entries
//   PATCH  /v1/me/collections/:collectionId/entries/:entryId
//   DELETE /v1/me/collections/:collectionId/entries/:entryId

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import {
  CreateCollectionInputSchema,
  UpdateCollectionInputSchema,
  AddCollectionEntryInputSchema,
  ReorderCollectionEntryInputSchema,
} from '@infernolog/core'
import { logger } from '../utils/logger'
import type { HonoVariables } from '../types/hono'
import {
  CollectionError,
  CollectionLevelNotCachedError,
  CollectionNotFoundError,
  addEntry,
  createCollection,
  deleteCollection,
  getCollectionDetail,
  getCollections,
  removeEntry,
  reorderEntry,
  updateCollection,
} from '../services/collections'

const app = new Hono<{ Variables: HonoVariables }>()

function mapServiceError(error: unknown, label: string) {
  if (error instanceof CollectionError) {
    return {
      status: error.status,
      body: { error: error.code, message: error.message },
    } as const
  }
  if (error instanceof CollectionNotFoundError) {
    return { status: 404 as const, body: { error: error.message } }
  }
  if (error instanceof CollectionLevelNotCachedError) {
    return { status: 400 as const, body: { error: error.message } }
  }
  console.error(`${label} error:`, error)
  Sentry.captureException(error)
  return { status: 500 as const, body: { error: 'Internal server error' } }
}

app.get('/me/collections', async (c) => {
  const userId = c.get('userId') as string
  try {
    return c.json({ data: await getCollections(userId) })
  } catch (error) {
    const { status, body } = mapServiceError(error, 'GET /me/collections')
    return c.json(body, status)
  }
})

app.post('/me/collections', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = CreateCollectionInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  try {
    const detail = await createCollection(userId, parsed.data)
    logger.info({ userId, collectionId: detail.id }, 'Collection created')
    return c.json({ data: detail })
  } catch (error) {
    const { status, body: errBody } = mapServiceError(
      error,
      'POST /me/collections'
    )
    return c.json(errBody, status)
  }
})

app.get('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId') as string
  try {
    return c.json({
      data: await getCollectionDetail(userId, c.req.param('collectionId')),
    })
  } catch (error) {
    const { status, body } = mapServiceError(error, 'GET /me/collections/:id')
    return c.json(body, status)
  }
})

app.patch('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = UpdateCollectionInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  try {
    return c.json({
      data: await updateCollection(
        userId,
        c.req.param('collectionId'),
        parsed.data
      ),
    })
  } catch (error) {
    const { status, body: errBody } = mapServiceError(
      error,
      'PATCH /me/collections/:id'
    )
    return c.json(errBody, status)
  }
})

app.delete('/me/collections/:collectionId', async (c) => {
  const userId = c.get('userId') as string
  try {
    await deleteCollection(userId, c.req.param('collectionId'))
    return c.body(null, 204)
  } catch (error) {
    const { status, body } = mapServiceError(
      error,
      'DELETE /me/collections/:id'
    )
    return c.json(body, status)
  }
})

app.post('/me/collections/:collectionId/entries', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = AddCollectionEntryInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  try {
    return c.json({
      data: await addEntry(
        userId,
        c.req.param('collectionId'),
        parsed.data.levelId
      ),
    })
  } catch (error) {
    const { status, body: errBody } = mapServiceError(
      error,
      'POST /me/collections/:id/entries'
    )
    return c.json(errBody, status)
  }
})

app.patch('/me/collections/:collectionId/entries/:entryId', async (c) => {
  const userId = c.get('userId') as string
  const body = await c.req.json().catch(() => ({}))
  const parsed = ReorderCollectionEntryInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  try {
    return c.json({
      data: await reorderEntry(
        userId,
        c.req.param('collectionId'),
        c.req.param('entryId'),
        parsed.data
      ),
    })
  } catch (error) {
    const { status, body: errBody } = mapServiceError(
      error,
      'PATCH /me/collections/:id/entries/:entryId'
    )
    return c.json(errBody, status)
  }
})

app.delete('/me/collections/:collectionId/entries/:entryId', async (c) => {
  const userId = c.get('userId') as string
  try {
    await removeEntry(
      userId,
      c.req.param('collectionId'),
      c.req.param('entryId')
    )
    return c.body(null, 204)
  } catch (error) {
    const { status, body } = mapServiceError(
      error,
      'DELETE /me/collections/:id/entries/:entryId'
    )
    return c.json(body, status)
  }
})

export default app
