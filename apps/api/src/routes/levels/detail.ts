// Reading one level:
//
//   GET /v1/levels/:levelId/page  — the Global Level Page's data source
//   GET /v1/levels/:levelId       — cached metadata only, never calls RobTop
//
// ⚠️ The bare /:levelId is the catch-all of the levels tree: it matches any
// single segment, including literals like "search" and "browse". It must be
// registered after search.ts — see index.ts and routing.test.ts.

import { Hono } from 'hono'
import { LevelIdSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { findOrResolveLevel } from '../../services/levels/resolve'
import type { HonoVariables } from '../../types/hono'
import {
  levelDetailSelect,
  mapLevelDetail,
  levelPageSelect,
} from '../../services/levels/selects'
import { chargeRobtopBudget } from '../../utils/robtopUserBudget'

const app = new Hono<{ Variables: HonoVariables }>()

// GET /v1/levels/:levelId/page — the Global Level Page's data source. Unlike
// the bare cached-only GET below, a cache miss here resolves the level from GD
// (autofill + SFH lookup) and caches it, matching ID entry elsewhere. The two
// failure modes are kept distinct so the page can branch on them:
//   404 { reason: 'not_found' }   — GD has no such level (terminal; nothing
//                                   cached, so a later visit re-resolves)
//   503 { reason: 'unreachable' } — GD couldn't be reached (retryable)
//   429 { reason: 'rate_limited' }— this user has spent their RobTop budget
//                                   (only reachable on a cache miss)
app.get('/levels/:levelId/page', async (c) => {
  const userId = c.get('userId')
  const levelId = c.req.param('levelId')

  if (!LevelIdSchema.safeParse(levelId).success) {
    return c.json({ error: 'Level ID must be numeric' }, 400)
  }

  // The budget is charged from inside findOrResolveLevel's cache-miss hook, so
  // opening the page for a level already in the cache — the overwhelmingly
  // common case — costs nothing. See utils/robtopUserBudget.ts. A dry budget
  // throws to the module's onError → 429.
  const resolved = await findOrResolveLevel(levelId, levelPageSelect, () =>
    chargeRobtopBudget(userId)
  )

  if (resolved.status === 'not_found') {
    return c.json({ error: 'No such level', reason: 'not_found' }, 404)
  }
  if (resolved.status === 'unreachable') {
    return c.json(
      {
        error: 'Could not reach the Geometry Dash servers',
        reason: 'unreachable',
        retryable: true,
      },
      503
    )
  }

  // Existence check ONLY — the page renders no progress values, just the
  // cross-link to the user's own page for this level. A row in any state
  // (in progress, dropped, completed) counts.
  const progress = await prisma.levelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } },
    select: { id: true },
  })

  return c.json({
    data: {
      // Same resolution every other detail response applies — `stars` is
      // canonical for a non-demon and outranks the stored label.
      ...mapLevelDetail(resolved.level),
      hasUserProgress: progress !== null,
    },
  })
})

// GET /v1/levels/:levelId — cached metadata only. Does NOT call RobTop.
app.get('/levels/:levelId', async (c) => {
  const levelId = c.req.param('levelId')

  if (!LevelIdSchema.safeParse(levelId).success) {
    return c.json({ error: 'Level ID must be numeric' }, 400)
  }

  const level = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select: levelDetailSelect,
  })
  if (!level) return c.json({ error: 'Level not found' }, 404)
  return c.json({ data: mapLevelDetail(level) })
})

export default app
