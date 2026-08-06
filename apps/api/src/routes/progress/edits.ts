// Edits and deletes on an existing entry:
//   PATCH  /v1/me/progress/:levelId
//   DELETE /v1/me/progress/:levelId
//   DELETE /v1/me/progress/:levelId/updates/:progressUpdateId

import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { EditProgressInputSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import type { HonoVariables } from '../../types/hono'
import {
  applyEdit,
  deleteProgressUpdate,
  ProgressFieldsNotApplicableError,
} from '../../services/progress'

const app = new Hono<{ Variables: HonoVariables }>()

// ─────────────────────────────────────────────
// PATCH /v1/me/progress/:levelId — edit the most recent progress update
// and/or LevelProgress metadata for the authed user's entry on a level.
//
// All fields are optional. Only present keys are written; absent keys are
// left unchanged. The "most recent" update is the completion (if any),
// then by loggedAt desc — matching the level page's display order.
// ─────────────────────────────────────────────

app.patch('/me/progress/:levelId', async (c) => {
  const userId = c.get('userId') as string
  const levelId = c.req.param('levelId')

  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = EditProgressInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }

    const result = await applyEdit(userId, levelId, parsed.data)
    if (!result) return c.json({ error: 'Entry not found' }, 404)

    return c.json({ data: result })
  } catch (error) {
    if (error instanceof ProgressFieldsNotApplicableError) {
      return c.json({ error: error.message }, 400)
    }
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─────────────────────────────────────────────
// DELETE /v1/me/progress/:levelId — remove the user's entire entry for a level.
//
// Deleting the LevelProgress cascades to its ProgressUpdates (and their rating
// scores / list references) and its ClassicRanking, per the schema's
// onDelete: Cascade relations.
//
// GDDL caveat: GDDL records cannot be deleted via the GDDL API. Users must
// manage GDDL record deletion directly on the GDDL platform. This is noted in
// the response body so the frontend can surface it in the delete confirmation.
// ─────────────────────────────────────────────

const GDDL_DELETE_CAVEAT =
  'GDDL records cannot be deleted via the GDDL API. ' +
  'Manage any associated GDDL record directly on the GDDL platform.'

app.delete('/me/progress/:levelId', async (c) => {
  const userId = c.get('userId') as string
  const levelId = c.req.param('levelId')

  try {
    const existing = await prisma.levelProgress.findUnique({
      where: { userId_levelId: { userId, levelId } },
      select: { id: true },
    })
    if (!existing) return c.json({ error: 'Entry not found' }, 404)

    await prisma.levelProgress.delete({ where: { id: existing.id } })
    return c.json({ gddlCaveat: GDDL_DELETE_CAVEAT })
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─────────────────────────────────────────────
// DELETE /v1/me/progress/:levelId/updates/:progressUpdateId — remove a
// single logged entry (completion, progress log, or drop) rather than the
// whole level entry. Deleting the last remaining update for a level deletes
// the entire level_progress instead (see deleteProgressUpdate).
// ─────────────────────────────────────────────

app.delete('/me/progress/:levelId/updates/:progressUpdateId', async (c) => {
  const userId = c.get('userId') as string
  const { levelId, progressUpdateId } = c.req.param()

  try {
    const result = await deleteProgressUpdate(userId, levelId, progressUpdateId)
    if (!result) return c.json({ error: 'Entry not found' }, 404)
    return c.json({ data: result })
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
