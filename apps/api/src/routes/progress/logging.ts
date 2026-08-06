// The three FAB logging write endpoints:
//   POST /v1/me/completions
//   POST /v1/me/progress
//   POST /v1/me/drops
//
// The authenticated user always comes from the JWT (c.get('userId')); any
// userId in a payload is ignored. The shared find-or-create-then-apply logic
// lives in services/progress.ts. Each endpoint returns the full resulting
// record so the client needn't follow up with a GET.
//
// Note POST /me/progress is a sibling of the GET /me/progress in list.ts —
// same path, different verb. They were split across two route files before
// these were merged into routes/progress/.

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import {
  CompletionInputSchema,
  ProgressInputSchema,
  DropInputSchema,
} from '@infernolog/core'
import { logger } from '../../utils/logger'
import type { HonoVariables } from '../../types/hono'
import {
  applyCompletion,
  applyProgress,
  applyDrop,
  LevelNotFoundError,
} from '../../services/progress'

const app = new Hono<{ Variables: HonoVariables }>()

// POST /v1/me/completions — create OR edit (idempotent) the user's completion.
app.post('/me/completions', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = CompletionInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await applyCompletion(userId, parsed.data)

    logger.info({ userId, levelId: parsed.data.levelId }, 'Logged completion')
    return c.json({ data: result }, 201)
  } catch (error) {
    if (error instanceof LevelNotFoundError) {
      return c.json({ error: error.message }, 400)
    }
    console.error('POST /me/completions error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/progress — create a non-completion progress update.
app.post('/me/progress', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ProgressInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await applyProgress(userId, parsed.data)
    logger.info({ userId, levelId: parsed.data.levelId }, 'Logged progress')
    return c.json({ data: result }, 201)
  } catch (error) {
    if (error instanceof LevelNotFoundError) {
      return c.json({ error: error.message }, 400)
    }
    console.error('POST /me/progress error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/me/drops — set the level_progress to dropped (drop-from-scratch ok).
app.post('/me/drops', async (c) => {
  const userId = c.get('userId') as string

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = DropInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await applyDrop(userId, parsed.data)
    logger.info({ userId, levelId: parsed.data.levelId }, 'Logged drop')
    return c.json({ data: result }, 201)
  } catch (error) {
    if (error instanceof LevelNotFoundError) {
      return c.json({ error: error.message }, 400)
    }
    console.error('POST /me/drops error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
