// Everything under /v1/me/collections — user-owned groupings of levels: the
// three built-ins (Want to Beat / Favorites / Least Favorites) plus custom
// named collections.
//
//   collections.ts  GET    /v1/me/collections
//                   POST   /v1/me/collections
//                   GET    /v1/me/collections/:collectionId
//                   PATCH  /v1/me/collections/:collectionId
//                   DELETE /v1/me/collections/:collectionId
//   entries.ts      POST   /v1/me/collections/:collectionId/entries
//                   PATCH  /v1/me/collections/:collectionId/entries/:entryId
//                   DELETE /v1/me/collections/:collectionId/entries/:entryId
//
// Not to be confused with list references (ListReference / ListSource — the
// GDDL/AREDL/NLW community difficulty-list tiers on a completion). Unrelated
// concepts that both get called "lists" in conversation.
//
// One onError for the whole module maps the service's error classes to
// statuses, so individual handlers carry no try/catch. It is scoped to these
// routes — sibling modules' errors pass through untouched.
//
// All routes are me-scoped: the user comes from the JWT (c.get('userId')),
// never from a path segment. The planned cross-user reads
// (GET /v1/users/{usernameOrId}/collections) will land here as a public.ts
// sibling, sharing this module's serialization — see docs/API_DESIGN.md.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'
import collectionRoutes from './collections'
import entryRoutes from './entries'
import { createErrorHandler } from '../../middleware/errors'
import {
  CollectionError,
  CollectionLevelNotCachedError,
  CollectionNotFoundError,
} from '../../services/collections'

const app = new Hono<{ Variables: HonoVariables }>()

app.onError(
  createErrorHandler('Collections', (error, c) => {
    // Caller-fixable rule violation — carries the machine-readable code the
    // client branches on (DUPLICATE_NAME, RESERVED_NAME, BUILT_IN_COLLECTION,
    // LEVEL_ALREADY_COMPLETED) and the status the service chose for it.
    if (error instanceof CollectionError) {
      return c.json({ error: error.code, message: error.message }, error.status)
    }
    if (error instanceof CollectionNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    if (error instanceof CollectionLevelNotCachedError) {
      return c.json({ error: error.message }, 400)
    }
    return undefined
  })
)

app.route('/', collectionRoutes)
app.route('/', entryRoutes)

export default app
