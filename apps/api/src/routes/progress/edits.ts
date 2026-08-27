// Edits and deletes on an existing entry:
//   PATCH  /v1/me/progress/:levelId
//   DELETE /v1/me/progress/:levelId
//   DELETE /v1/me/progress/:levelId/updates/:progressUpdateId

import { Hono } from 'hono'
import { EditProgressInputSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import type { HonoVariables } from '../../types/hono'
import { applyEdit, deleteProgressUpdate } from '../../services/progress'
import { purgeLevelActivity } from '../../services/activityLog'
import { parseJsonBody } from '../../utils/requestBody'

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
  const userId = c.get('userId')
  const levelId = c.req.param('levelId')

  const parsed = await parseJsonBody(c, EditProgressInputSchema)
  if (!parsed.ok) return parsed.response

  const result = await applyEdit(userId, levelId, parsed.data)
  if (!result) return c.json({ error: 'Entry not found' }, 404)

  return c.json({ data: result })
})

// ─────────────────────────────────────────────
// DELETE /v1/me/progress/:levelId — remove the user's entire entry for a level.
//
// Deleting the LevelProgress cascades to its ProgressUpdates (and their rating
// scores / list references) and its ClassicDemonList, per the schema's
// onDelete: Cascade relations. The activity_log rows scoped to this level are
// NOT cascaded (they hang off the user and the level, not the entry), so they
// are purged explicitly in the same transaction — the user asked for the entry
// to be gone, and its event history goes with it.
//
// GDDL caveat: GDDL records cannot be deleted via the GDDL API. Users must
// manage GDDL record deletion directly on the GDDL platform. This is noted in
// the response body so the frontend can surface it in the delete confirmation.
// ─────────────────────────────────────────────

const GDDL_DELETE_CAVEAT =
  'GDDL records cannot be deleted via the GDDL API. ' +
  'Manage any associated GDDL record directly on the GDDL platform.'

app.delete('/me/progress/:levelId', async (c) => {
  const userId = c.get('userId')
  const levelId = c.req.param('levelId')

  const existing = await prisma.levelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } },
    select: { id: true },
  })
  if (!existing) return c.json({ error: 'Entry not found' }, 404)

  await prisma.$transaction(async (tx) => {
    await purgeLevelActivity(tx, userId, levelId)
    await tx.levelProgress.delete({ where: { id: existing.id } })
  })
  return c.json({ gddlCaveat: GDDL_DELETE_CAVEAT })
})

// ─────────────────────────────────────────────
// DELETE /v1/me/progress/:levelId/updates/:progressUpdateId — remove a
// single logged entry (completion, progress log, or drop) rather than the
// whole level entry. Deleting the last remaining update for a level deletes
// the entire level_progress instead (see deleteProgressUpdate).
// ─────────────────────────────────────────────

app.delete('/me/progress/:levelId/updates/:progressUpdateId', async (c) => {
  const userId = c.get('userId')
  const { levelId, progressUpdateId } = c.req.param()

  const result = await deleteProgressUpdate(userId, levelId, progressUpdateId)
  if (!result) return c.json({ error: 'Entry not found' }, 404)
  return c.json({ data: result })
})

export default app
