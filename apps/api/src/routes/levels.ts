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
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Columns returned for a cached level (the wire shape, LevelSchema). Excludes
// the internal monthly-sync fields (lastCheckedAt, pending*).
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
  isNong: true,
  nongSongTitle: true,
  nongArtist: true,
  nongSourceUrl: true,
  peakMusicBpm: true,
  // Extended RobTop metadata.
  description: true,
  creatorPlayerId: true,
  creatorAccountId: true,
  creatorPoints: true,
  stars: true,
  starsRequested: true,
  partialDiff: true,
  difficultyFace: true,
  downloads: true,
  likes: true,
  disliked: true,
  objectCount: true,
  largeLevel: true,
  coins: true,
  coinsVerified: true,
  orbs: true,
  diamonds: true,
  featured: true,
  featureScore: true,
  epicValue: true,
  twoPlayer: true,
  lowDetailMode: true,
  copiedFromId: true,
  levelVersion: true,
  gameVersion: true,
  editorSeconds: true,
  editorSecondsTotal: true,
  officialSongId: true,
  songId: true,
  songLink: true,
  songSize: true,
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
      levelProgress: { select: { visibility: true, worstFail: true } },
    },
  })
  if (!completion) return null

  return {
    progressUpdateId: completion.id,
    date: completion.date,
    dateUncertain: completion.dateUncertain,
    attempts: completion.attempts,
    worstFail: completion.levelProgress.worstFail,
    difficultyOpinion: completion.difficultyOpinion,
    difficultyOpinionStars: completion.difficultyOpinionStars,
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
    coinsCollected: completion.coinsCollected,
    twoPlayerSolo: completion.twoPlayerSolo,
    twoPlayerPartner: completion.twoPlayerPartner,
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
      SELECT "inGameId", "name", "creator", "inGameDifficulty", "featured", "epicValue", "songName", "isRated"
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
        data: {
          inGameId: levelId,
          levelType: gd.platformer ? 'PLATFORMER' : 'CLASSIC',
          name: gd.name,
          creator: gd.creator,
          inGameDifficulty: gd.inGameDifficulty,
          length: gd.length,
          songName: gd.songName,
          songAuthor: gd.songAuthor,
          isRated: gd.isRated,
          isDemon: gd.isDemon,
          // Extended RobTop metadata snapshot.
          description: gd.description,
          creatorPlayerId: gd.creatorPlayerId,
          creatorAccountId: gd.creatorAccountId,
          creatorPoints: gd.creatorPoints,
          stars: gd.stars,
          starsRequested: gd.starsRequested,
          partialDiff: gd.partialDiff,
          difficultyFace: gd.difficultyFace,
          downloads: gd.downloads,
          likes: gd.likes,
          disliked: gd.disliked,
          objectCount: gd.objectCount,
          largeLevel: gd.largeLevel,
          coins: gd.coins,
          coinsVerified: gd.coinsVerified,
          orbs: gd.orbs,
          diamonds: gd.diamonds,
          featured: gd.featured,
          featureScore: gd.featureScore,
          epicValue: gd.epicValue,
          twoPlayer: gd.twoPlayer,
          lowDetailMode: gd.lowDetailMode,
          copiedFromId: gd.copiedFromId,
          levelVersion: gd.levelVersion,
          gameVersion: gd.gameVersion,
          editorSeconds: gd.editorSeconds,
          editorSecondsTotal: gd.editorSecondsTotal,
          officialSongId: gd.officialSongId,
          songId: gd.songId,
          songLink: gd.songLink,
          songSize: gd.songSize,
          dataSource: 'robtop_autofill',
          verified: true,
        },
        select: levelSelect,
      })
    }

    // GDDL suggested tier autofill — only meaningful for rated levels, and must
    // never block or fail the resolve (returns null on any failure).
    const [suggestedGddlTier, existingCompletion] = await Promise.all([
      level.isRated ? fetchGddlTier(levelId) : Promise.resolve(null),
      loadExistingCompletion(userId, levelId),
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
