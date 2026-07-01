// POST /v1/me/import/check  — read-only conflict check
// POST /v1/me/import        — commit one batch of ≤50 rows
//
// Both are own-account only: the authenticated user comes from the JWT
// (c.get('userId')), never from the path or payload.

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import {
  ImportCheckRequestSchema,
  ImportCommitRequestSchema,
  ImportRankingRequestSchema,
  ImportListsRequestSchema,
  ImportRatingsRequestSchema,
} from '@infernolog/core'
import { logger } from '../utils/logger'
import type { HonoVariables } from '../types/hono'
import { commitImportBatch, checkImportConflicts } from '../services/import'
import { commitImportRanking } from '../services/importRanking'
import { commitImportLists } from '../services/importLists'
import { commitImportRatings } from '../services/importRatings'

const app = new Hono<{ Variables: HonoVariables }>()

// POST /v1/me/import/check — returns which of the given level IDs the
// authenticated user already has a completion for, with summary detail
// for the conflict UI. Read-only; no writes.
app.post('/me/import/check', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ImportCheckRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await checkImportConflicts(userId, parsed.data.levelIds)
    return c.json(result, 200)
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import/check error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/import — commits one client-driven batch of ≤50 rows.
// Partial commits are allowed: a failed row never aborts its batch.
// Idempotent: (importJobId, rowIndex) pairs are recorded so a retried
// or double-clicked batch never double-writes.
app.post('/me/import', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ImportCommitRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await commitImportBatch(
      userId,
      parsed.data.importJobId,
      parsed.data.rows
    )

    logger.info(
      {
        userId,
        importJobId: parsed.data.importJobId,
        rowCount: parsed.data.rows.length,
        committed: result.outcomes.filter((o) => o.status === 'committed').length,
        updated: result.outcomes.filter((o) => o.status === 'updated').length,
        skipped: result.outcomes.filter((o) => o.status === 'skipped').length,
        failed: result.outcomes.filter((o) => o.status === 'failed').length,
      },
      'POST /me/import: batch committed'
    )

    return c.json(result, 200)
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/import/ranking — replaces the user's classic ranking with an
// ordered list (hardest → easiest). Runs once, after the row batches, so every
// ranked level already exists as one of the user's completions.
app.post('/me/import/ranking', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ImportRankingRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await commitImportRanking(userId, parsed.data.entries)

    logger.info(
      {
        userId,
        entries: parsed.data.entries.length,
        placed: result.placed,
        skipped: result.skipped.length,
      },
      'POST /me/import/ranking: ranking replaced'
    )

    return c.json(result, 200)
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import/ranking error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/import/lists — replaces membership of the lists the sheet names
// (want-to-beat / favorites / least-favorites / custom). Runs once, after the
// row batches. Lists the sheet doesn't mention are left untouched.
app.post('/me/import/lists', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ImportListsRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await commitImportLists(userId, parsed.data.entries)

    logger.info(
      {
        userId,
        entries: parsed.data.entries.length,
        lists: result.lists.length,
        skipped: result.skipped.length,
      },
      'POST /me/import/lists: lists replaced'
    )

    return c.json(result, 200)
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import/lists error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/import/ratings — writes weighted per-category scores onto
// completions. Runs once, after the row batches. Categories are matched by name
// and created on demand; only the categories the sheet names are written.
app.post('/me/import/ratings', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ImportRatingsRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await commitImportRatings(userId, parsed.data.entries)

    logger.info(
      {
        userId,
        entries: parsed.data.entries.length,
        scored: result.scored,
        levels: result.levels,
        categoriesCreated: result.categoriesCreated.length,
        skipped: result.skipped.length,
      },
      'POST /me/import/ratings: scores written'
    )

    return c.json(result, 200)
  } catch (err) {
    logger.error({ userId, err }, 'POST /me/import/ratings error')
    Sentry.captureException(err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
