// Maps the collections service's error classes onto HTTP responses.
//
// Registered once as the module's Hono onError (see index.ts) rather than
// repeated in a try/catch per handler, so the routes read as the single
// service call each one is. Handlers throw; this decides the status.

import * as Sentry from '@sentry/node'
import type { Context } from 'hono'
import {
  CollectionError,
  CollectionLevelNotCachedError,
  CollectionNotFoundError,
} from '../../services/collections'
import type { HonoVariables } from '../../types/hono'

type Ctx = Context<{ Variables: HonoVariables }>

export function handleCollectionsError(error: Error, c: Ctx) {
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

  // routePath is the matched pattern (e.g. /me/collections/:collectionId),
  // so the label stays correct without being hand-maintained per handler.
  console.error(`${c.req.method} ${c.req.routePath} error:`, error)
  Sentry.captureException(error)
  return c.json({ error: 'Internal server error' }, 500)
}
