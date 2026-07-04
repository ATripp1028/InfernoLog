// Collections routes — thin HTTP shell over services/collections.ts.
//
//   GET    /v1/users/:usernameOrId/collections                          — index
//   POST   /v1/users/:usernameOrId/collections                          — create (custom)
//   GET    /v1/users/:usernameOrId/collections/:collectionId            — detail + ordered entries
//   PATCH  /v1/users/:usernameOrId/collections/:collectionId            — rename/edit (custom only)
//   DELETE /v1/users/:usernameOrId/collections/:collectionId            — delete (custom only)
//   POST   /v1/users/:usernameOrId/collections/:collectionId/entries    — add a level
//   PATCH  /v1/users/:usernameOrId/collections/:collectionId/entries/:entryId — reorder
//   DELETE /v1/users/:usernameOrId/collections/:collectionId/entries/:entryId — remove
//
// Reads resolve the path user (username or UUID) and respect profilePublic;
// writes are ALWAYS the authenticated user's own collections — the path user
// must match the JWT user (the userId never comes from the path or payload).

import { Hono, type Context } from 'hono'
import * as Sentry from '@sentry/node'
import {
  CreateCollectionInputSchema,
  UpdateCollectionInputSchema,
  AddCollectionEntryInputSchema,
  ReorderCollectionEntryInputSchema,
} from '@infernolog/core'
import prisma from '../utils/prisma'
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Resolve the path's usernameOrId → user row (matching the level-page route).
async function resolveTargetUser(usernameOrId: string) {
  const isUuid = UUID_RE.test(usernameOrId)
  return prisma.user.findFirst({
    where: isUuid ? { id: usernameOrId } : { username: usernameOrId },
    select: { id: true, profilePublic: true },
  })
}

type ErrorBody = { error: string; message?: string }
type Ctx = Context<{ Variables: HonoVariables }>

// Shared handler scaffolding: resolves the target user, enforces read/write
// access, runs the service call, and maps the service errors to HTTP.
async function handle(
  c: Ctx,
  { write, label }: { write: boolean; label: string },
  run: (targetUserId: string) => Promise<unknown>
) {
  const viewerId = c.get('userId') as string
  const usernameOrId = c.req.param('usernameOrId')
  if (!usernameOrId) return c.json({ error: 'User not found' }, 404)

  try {
    const target = await resolveTargetUser(usernameOrId)
    if (!target) return c.json({ error: 'User not found' }, 404)

    const isOwner = target.id === viewerId
    // Writes are me-scoped: the path user must be the JWT user.
    if (write && !isOwner) return c.json({ error: 'Forbidden' }, 403)
    // Private profile → reads are owner-only too.
    if (!isOwner && !target.profilePublic) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const data = await run(target.id)
    return data === undefined ? c.body(null, 204) : c.json({ data })
  } catch (error) {
    if (error instanceof CollectionError) {
      const body: ErrorBody = { error: error.code, message: error.message }
      return c.json(body, error.status)
    }
    if (error instanceof CollectionNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    if (error instanceof CollectionLevelNotCachedError) {
      return c.json({ error: error.message }, 400)
    }
    console.error(`${label} error:`, error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

// GET /users/:usernameOrId/collections — index summaries.
app.get('/users/:usernameOrId/collections', (c) =>
  handle(c, { write: false, label: 'GET /collections' }, (uid) =>
    getCollections(uid)
  )
)

// POST /users/:usernameOrId/collections — create an empty custom collection.
app.post('/users/:usernameOrId/collections', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = CreateCollectionInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  return handle(c, { write: true, label: 'POST /collections' }, async (uid) => {
    const detail = await createCollection(uid, parsed.data)
    logger.info(
      { userId: uid, collectionId: detail.id },
      'Collection created'
    )
    return detail
  })
})

// GET /users/:usernameOrId/collections/:collectionId — detail + entries.
app.get('/users/:usernameOrId/collections/:collectionId', (c) =>
  handle(c, { write: false, label: 'GET /collections/:id' }, (uid) =>
    getCollectionDetail(uid, c.req.param('collectionId'))
  )
)

// PATCH /users/:usernameOrId/collections/:collectionId — custom only.
app.patch('/users/:usernameOrId/collections/:collectionId', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = UpdateCollectionInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
  return handle(c, { write: true, label: 'PATCH /collections/:id' }, (uid) =>
    updateCollection(uid, c.req.param('collectionId'), parsed.data)
  )
})

// DELETE /users/:usernameOrId/collections/:collectionId — custom only.
app.delete('/users/:usernameOrId/collections/:collectionId', (c) =>
  handle(c, { write: true, label: 'DELETE /collections/:id' }, async (uid) => {
    await deleteCollection(uid, c.req.param('collectionId'))
    return undefined // 204
  })
)

// POST …/entries — add a level (idempotent per collection+level).
app.post(
  '/users/:usernameOrId/collections/:collectionId/entries',
  async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = AddCollectionEntryInputSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
    return handle(
      c,
      { write: true, label: 'POST /collections/:id/entries' },
      (uid) => addEntry(uid, c.req.param('collectionId'), parsed.data.levelId)
    )
  }
)

// PATCH …/entries/:entryId — reorder between two neighbours.
app.patch(
  '/users/:usernameOrId/collections/:collectionId/entries/:entryId',
  async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ReorderCollectionEntryInputSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)
    return handle(
      c,
      { write: true, label: 'PATCH /collections/:id/entries/:entryId' },
      (uid) =>
        reorderEntry(
          uid,
          c.req.param('collectionId'),
          c.req.param('entryId'),
          parsed.data
        )
    )
  }
)

// DELETE …/entries/:entryId — remove a level from the collection.
app.delete(
  '/users/:usernameOrId/collections/:collectionId/entries/:entryId',
  (c) =>
    handle(
      c,
      { write: true, label: 'DELETE /collections/:id/entries/:entryId' },
      (uid) =>
        removeEntry(uid, c.req.param('collectionId'), c.req.param('entryId'))
    )
)

export default app
