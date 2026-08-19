// GET /v1/levels/:levelId/resolve — the autofill endpoint that fires on
// level-ID entry in the logging modal.
//
// Cache hit returns cached; miss calls RobTop once and caches it. RobTop being
// down or returning nothing is an EXPECTED branch, not an error: it responds
// 200 with the manual-fallback signal rather than a 500. Always includes the
// user's existing completion (or null) so the client can pre-populate the edit
// form — "edit, not replace".

import { Hono } from 'hono'
import { LevelIdSchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { fetchRobtopLevel } from '../../utils/robtop'
import { fetchGddlTier } from '../../utils/gddl'
import { checkSfhNongIfDue } from '../../services/levels/sfhSync'
import { buildRobtopCreateData } from '../../services/levels/robtopMapping'
import type { HonoVariables } from '../../types/hono'
import {
  levelDetailSelect,
  mapLevelDetail,
} from '../../services/levels/selects'
import { chargeRobtopBudget } from '../../utils/robtopUserBudget'

const app = new Hono<{ Variables: HonoVariables }>()

// Loads the authenticated user's existing completion for a level (if any),
// shaped to pre-populate the edit form. This is the read dependency that makes
// "log a completion on an already-completed level → edit existing" work.
async function loadExistingCompletion(userId: string, levelId: string) {
  const lp = await prisma.levelProgress.findUnique({
    where: { userId_levelId: { userId, levelId } },
    select: { id: true },
  })
  if (!lp) return null

  const completion = await prisma.progressUpdate.findFirst({
    where: { levelProgressId: lp.id, kind: 'COMPLETION' },
    include: {
      levelProgress: {
        select: {
          visibility: true,
          worstFail: true,
          worstFailDate: true,
          worstFailDateTimezone: true,
          userGddlTier: true,
          simpleRating: true,
          coinsCollected: true,
          completionTime: true,
          ratingScores: { select: { categoryId: true, score: true } },
        },
      },
    },
  })
  if (!completion) return null

  return {
    progressUpdateId: completion.id,
    date: completion.date,
    dateTimezone: completion.dateTimezone,
    dateUncertain: completion.dateUncertain,
    attempts: completion.attempts,
    worstFail: completion.levelProgress.worstFail,
    worstFailDate: completion.levelProgress.worstFailDate,
    worstFailDateTimezone: completion.levelProgress.worstFailDateTimezone,
    difficultyOpinion: completion.difficultyOpinion,
    enjoyment: completion.enjoyment,
    fps: completion.fps,
    onStream: completion.onStream,
    videoUrl: completion.videoUrl,
    highlightUrl: completion.highlightUrl,
    notes: completion.notes,
    visibility: completion.levelProgress.visibility,
    device: completion.device,
    // LevelProgress fields — one current value per level, not per event.
    simpleRating: completion.levelProgress.simpleRating,
    ratingScores: completion.levelProgress.ratingScores,
    coinsCollected: completion.levelProgress.coinsCollected,
    completionTime: completion.levelProgress.completionTime,
    userGddlTier: completion.levelProgress.userGddlTier,
    twoPlayerSolo: completion.twoPlayerSolo,
    twoPlayerPartner: completion.twoPlayerPartner,
    percentageVersion: completion.percentageVersion ?? null,
  }
}

app.get('/levels/:levelId/resolve', async (c) => {
  const userId = c.get('userId')
  const levelId = c.req.param('levelId')

  if (!LevelIdSchema.safeParse(levelId).success) {
    return c.json({ error: 'Level ID must be numeric' }, 400)
  }

  let level = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select: levelDetailSelect,
  })

  if (!level) {
    // Cache miss — this is the only branch that reaches RobTop, so it is the
    // only one that costs the user a token. A hit above is free, which is what
    // keeps the budget clear of ordinary use: a level resolves from GD once and
    // is cached from then on. The traffic this actually meters is repeated
    // lookups of ids GD has no level for, which are never cached and so would
    // otherwise call out forever.
    await chargeRobtopBudget(userId)

    // Try RobTop's servers exactly once. Unavailability is an expected branch,
    // NOT an error: signal the client to fall back to manual.
    const gd = await fetchRobtopLevel(levelId)
    if (!gd) {
      return c.json({
        level: null,
        fallbackToManual: true,
        suggestedGddlTier: null,
        existingCompletion: await loadExistingCompletion(userId, levelId),
      })
    }
    level = await prisma.level.create({
      data: buildRobtopCreateData(levelId, gd),
      select: levelDetailSelect,
    })
  }

  // GDDL suggested tier autofill — only meaningful for rated levels, and must
  // never block or fail the resolve (returns null on any failure). The Song
  // File Hub NONG check runs alongside it: best-effort, its result is cached
  // (not surfaced in this payload yet), and it can never fail the resolve
  // (checkSfhNongIfDue never throws and self-gates on delisted levels and
  // levels checked within the re-check cadence).
  const [suggestedGddlTier, existingCompletion] = await Promise.all([
    level.isRated ? fetchGddlTier(levelId) : Promise.resolve(null),
    loadExistingCompletion(userId, levelId),
    checkSfhNongIfDue(levelId),
  ])

  return c.json({
    level: mapLevelDetail(level),
    fallbackToManual: false,
    suggestedGddlTier,
    existingCompletion,
  })
})

export default app
