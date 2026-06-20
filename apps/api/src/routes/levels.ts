// Level-entry support endpoints backing the logging modal:
//   GET  /v1/levels/search?q=     — fuzzy name search (pg_trgm)
//   GET  /v1/levels/:levelId/resolve — autofill (cache-or-GDBrowser) + the
//                                      user's existing completion (edit form)
//   POST /v1/levels                — manual metadata write (GDBrowser fallback)
//   GET  /v1/levels/:levelId       — cached metadata only (no GDBrowser call)
//
// Route order matters: /search and /:levelId/resolve are declared before the
// bare /:levelId so Hono doesn't capture "search" as a level id.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/node'
import { ManualLevelInputSchema, LevelIdSchema } from '@infernolog/core'
import type { LevelSearchResult } from '@infernolog/core'
import prisma from '../utils/prisma'
import { logger } from '../utils/logger'
import { fetchGdBrowserLevel } from '../utils/gdbrowser'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Columns returned for a cached level (the wire shape, LevelSchema).
const levelSelect = {
  inGameId: true,
  levelType: true,
  isRated: true,
  name: true,
  creator: true,
  inGameDifficulty: true,
  length: true,
  songName: true,
  songAuthor: true,
  isNong: true,
  nongSongTitle: true,
  nongArtist: true,
  nongSourceUrl: true,
  peakMusicBpm: true,
  dataSource: true,
  verified: true,
} as const

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
    where: { levelProgressId: lp.id, isCompletion: true },
    include: {
      ratingScores: { select: { categoryId: true, score: true } },
      listReferences: {
        select: { listSource: true, tierOrRank: true, atTimeOfLogging: true },
      },
      levelProgress: { select: { visibility: true } },
    },
  })
  if (!completion) return null

  return {
    progressUpdateId: completion.id,
    date: completion.date,
    dateUncertain: completion.dateUncertain,
    attempts: completion.attempts,
    difficultyOpinion: completion.difficultyOpinion,
    enjoyment: completion.enjoyment,
    simpleRating: completion.simpleRating,
    fps: completion.fps,
    onStream: completion.onStream,
    videoUrl: completion.videoUrl,
    highlightUrl: completion.highlightUrl,
    notes: completion.notes,
    visibility: completion.levelProgress.visibility,
    ratingScores: completion.ratingScores,
    listReferences: completion.listReferences,
  }
}

// GET /v1/levels/search?q= — fuzzy/typo-tolerant name search via the pg_trgm
// GIN index (the `%` operator uses the index; similarity() orders by relevance).
app.get('/levels/search', async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400)

  try {
    const results = await prisma.$queryRaw<LevelSearchResult[]>(Prisma.sql`
      SELECT "inGameId", "name", "creator", "inGameDifficulty"
      FROM "levels"
      WHERE "name" % ${q}
      ORDER BY similarity("name", ${q}) DESC
      LIMIT 20
    `)
    return c.json({ data: results })
  } catch (error) {
    console.error('GET /levels/search error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/levels/:levelId/resolve — cache hit returns cached; miss calls
// GDBrowser once and caches; GDBrowser down/empty returns the manual-fallback
// signal (never a 500). Always includes the user's existing completion or null.
app.get('/levels/:levelId/resolve', async (c) => {
  const userId = c.get('userId') as string
  const levelId = c.req.param('levelId')

  if (!LevelIdSchema.safeParse(levelId).success) {
    return c.json({ error: 'Level ID must be numeric' }, 400)
  }

  try {
    let level = await prisma.level.findUnique({
      where: { inGameId: levelId },
      select: levelSelect,
    })

    if (!level) {
      // Cache miss — try GDBrowser exactly once. Unavailability is an expected
      // branch, NOT an error: signal the client to fall back to manual entry.
      const gd = await fetchGdBrowserLevel(levelId)
      if (!gd) {
        return c.json({
          level: null,
          fallbackToManual: true,
          existingCompletion: await loadExistingCompletion(userId, levelId),
        })
      }
      level = await prisma.level.create({
        data: {
          inGameId: levelId,
          name: gd.name,
          creator: gd.creator,
          inGameDifficulty: gd.inGameDifficulty,
          length: gd.length,
          songName: gd.songName,
          songAuthor: gd.songAuthor,
          isRated: gd.isRated,
          dataSource: 'gdbrowser_autofill',
          verified: true,
        },
        select: levelSelect,
      })
    }

    return c.json({
      level,
      fallbackToManual: false,
      existingCompletion: await loadExistingCompletion(userId, levelId),
    })
  } catch (error) {
    console.error('GET /levels/:levelId/resolve error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/levels — manual metadata write (the GDBrowser-fallback form submit).
// The user-entered difficulty BECOMES the in-game difficulty (the one
// sanctioned exception). Stored data_source=manual, verified=false.
app.post('/levels', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ManualLevelInputSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400)
    }
    const input = parsed.data

    const level = await prisma.level.create({
      data: {
        inGameId: input.inGameId,
        name: input.name,
        creator: input.creator,
        inGameDifficulty: input.difficulty,
        length: input.length ?? null,
        songName: input.songName ?? null,
        songAuthor: input.songAuthor ?? null,
        dataSource: 'manual',
        verified: false,
      },
      select: levelSelect,
    })

    logger.info({ inGameId: input.inGameId }, 'Manually created level metadata')
    return c.json({ data: level }, 201)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return c.json({ error: 'Level already exists' }, 409)
    }
    console.error('POST /levels error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/levels/:levelId — cached metadata only. Does NOT call GDBrowser.
app.get('/levels/:levelId', async (c) => {
  const levelId = c.req.param('levelId')

  if (!LevelIdSchema.safeParse(levelId).success) {
    return c.json({ error: 'Level ID must be numeric' }, 400)
  }

  try {
    const level = await prisma.level.findUnique({
      where: { inGameId: levelId },
      select: levelSelect,
    })
    if (!level) return c.json({ error: 'Level not found' }, 404)
    return c.json({ data: level })
  } catch (error) {
    console.error('GET /levels/:levelId error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
