// Level-entry support endpoints backing the logging modal:
//   GET  /v1/levels/search?q=     — fuzzy name search (pg_trgm)
//   GET  /v1/levels/:levelId/resolve — autofill (cache-or-RobTop) + the
//                                      user's existing completion (edit form)
//   POST /v1/levels                — manual metadata write (RobTop fallback)
//   GET  /v1/levels/:levelId       — cached metadata only (no RobTop call)
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
import { fetchRobtopLevel } from '../utils/robtop'
import { fetchGddlTier } from '../utils/gddl'
import { checkSfhNongIfDue } from '../services/sfhSync'
import { buildRobtopCreateData, findOrResolveLevel } from '../services/levelResolve'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Columns returned for a cached level (the wire shape, LevelSchema). Excludes
// internal sync/bookkeeping fields (lastCheckedAt, pending*, sfhCheckedAt).
const levelSelect = {
  inGameId: true,
  levelType: true,
  isRated: true,
  isDemon: true,
  name: true,
  creator: true,
  inGameDifficulty: true,
  length: true,
  songName: true,
  songAuthor: true,
  // NONG / Song File Hub data (sfhCheckedAt is internal bookkeeping, omitted).
  isNong: true,
  sfhId: true,
  sfhSongName: true,
  sfhYoutubeUrl: true,
  sfhYoutubeVideoId: true,
  sfhDownloadUrl: true,
  sfhFileType: true,
  sfhDownloads: true,
  // Extended RobTop metadata.
  description: true,
  creatorPlayerId: true,
  creatorAccountId: true,
  stars: true,
  starsRequested: true,
  partialDiff: true,
  downloads: true,
  likes: true,
  disliked: true,
  objectCount: true,
  coins: true,
  coinsVerified: true,
  featured: true,
  featureScore: true,
  epicValue: true,
  twoPlayer: true,
  lowDetailMode: true,
  copiedFromId: true,
  levelVersion: true,
  gameVersion: true,
  officialSongId: true,
  songId: true,
  songLink: true,
  songSize: true,
  dataSource: true,
  verified: true,
} as const

// The Global Level Page renders everything the logging wire shape carries plus
// two fields the logging flow omits as internal: delistedAt (drives the amber
// "frozen as of…" banner) and lastCheckedAt (the frozen-as-of date it shows).
const pageLevelSelect = {
  ...levelSelect,
  delistedAt: true,
  lastCheckedAt: true,
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

// GET /v1/levels/search?q= — name search backed by the pg_trgm GIN index.
// Two complementary matchers, both index-supported by gin_trgm_ops:
//   • ILIKE '%q%'  — substring/prefix match, so short fragments like "Cat"
//     surface "Cataclysm" (the `%` similarity operator alone needs ~4 chars of
//     a long name to clear pg_trgm's 0.3 threshold).
//   • name % q     — trigram similarity, for typo tolerance ("Cataclism").
// Results are ordered by similarity so the closest name ranks first.
app.get('/levels/search', async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400)

  // Escape ILIKE wildcards in user input so "100%" matches literally.
  const likePattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`

  try {
    const results = await prisma.$queryRaw<LevelSearchResult[]>(Prisma.sql`
      SELECT "inGameId", "name", "creator", "inGameDifficulty", "stars", "featured", "epicValue", "songName", "isRated"
      FROM "levels"
      WHERE "name" ILIKE ${likePattern} OR "name" % ${q}
      ORDER BY similarity("name", ${q}) DESC, "name" ASC
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
// RobTop once and caches; RobTop down/empty returns the manual-fallback
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
      // Cache miss — try RobTop's servers exactly once. Unavailability is an
      // expected branch, NOT an error: signal the client to fall back to manual.
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
        select: levelSelect,
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
      level,
      fallbackToManual: false,
      suggestedGddlTier,
      existingCompletion,
    })
  } catch (error) {
    console.error('GET /levels/:levelId/resolve error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/levels/:levelId/page — the Global Level Page's data source. Unlike
// the bare cached-only GET below, a cache miss here resolves the level from GD
// (autofill + SFH lookup) and caches it, matching ID entry elsewhere. The two
// failure modes are kept distinct so the page can branch on them:
//   404 { reason: 'not_found' }   — GD has no such level (terminal; nothing
//                                   cached, so a later visit re-resolves)
//   503 { reason: 'unreachable' } — GD couldn't be reached (retryable)
app.get('/levels/:levelId/page', async (c) => {
  const userId = c.get('userId') as string
  const levelId = c.req.param('levelId')

  if (!LevelIdSchema.safeParse(levelId).success) {
    return c.json({ error: 'Level ID must be numeric' }, 400)
  }

  try {
    const resolved = await findOrResolveLevel(levelId, pageLevelSelect)

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
      data: { ...resolved.level, hasUserProgress: progress !== null },
    })
  } catch (error) {
    console.error('GET /levels/:levelId/page error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /v1/levels — manual metadata write (the RobTop-fallback form submit).
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
        isDemon: input.isDemon ?? false,
        isRated: input.isRated ?? false,
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

// GET /v1/levels/:levelId — cached metadata only. Does NOT call RobTop.
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
