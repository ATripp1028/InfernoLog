// Progress reads — the "My Demons" list page.
//
//   GET /v1/me/progress — the authed user's full level-progress list in one
//                         payload (both PUBLIC and PRIVATE entries).
//
// All filtering / multi-key sorting / column selection happen client-side, so
// every row carries the raw fields each filter and column needs. See
// docs/API_DESIGN.md and packages/core's LevelProgressListItemSchema. Writes
// (completion / progress / drop) live in logging.ts.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/node'
import prisma from '../utils/prisma'
import { computeOverallRating } from '../utils/rating'
import type { OverallRatingConfig } from '../utils/rating'
import type { HonoVariables } from '../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

type DecimalLike = { toNumber(): number }
const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()

// Trimmed level columns for a list row (LevelListSummarySchema). The face,
// name/creator, type, and rated-status badge fields the list needs.
const levelListSelect = {
  inGameId: true,
  name: true,
  creator: true,
  levelType: true,
  inGameDifficulty: true,
  isDemon: true,
  isRated: true,
  difficultyFace: true,
  featured: true,
  epicValue: true,
  length: true,
  songName: true,
  songAuthor: true,
  coins: true,
  coinsVerified: true,
  twoPlayer: true,
  gameVersion: true,
} satisfies Prisma.LevelSelect

const listEntryInclude = {
  ratingScores: { select: { categoryId: true, score: true } },
  listReferences: {
    select: { listSource: true, tierOrRank: true, atTimeOfLogging: true },
  },
  recordAcceptances: {
    select: { listSource: true, isAccepted: true, acceptedAt: true },
  },
} satisfies Prisma.ProgressUpdateInclude

const levelProgressListSelect = {
  id: true,
  status: true,
  visibility: true,
  worstFail: true,
  attemptsAtDrop: true,
  droppedAt: true,
  droppedReason: true,
  createdAt: true,
  updatedAt: true,
  // Presence of a ranking row → !needsPlacement for completed classic levels.
  classicRanking: { select: { id: true } },
  level: { select: levelListSelect },
  // The representative update: completion first (isCompletion desc), else the
  // most recent. `take: 1` yields exactly one per level in a single query.
  progressUpdates: {
    orderBy: [{ isCompletion: 'desc' }, { loggedAt: 'desc' }] as const,
    take: 1,
    include: listEntryInclude,
  },
} satisfies Prisma.LevelProgressSelect

type RawRow = Prisma.LevelProgressGetPayload<{
  select: typeof levelProgressListSelect
}>

function serializeEntry(
  update: RawRow['progressUpdates'][number],
  ratingConfig: OverallRatingConfig
) {
  return {
    progressUpdateId: update.id,
    isCompletion: update.isCompletion,
    date: update.date,
    dateUncertain: update.dateUncertain,
    attempts: update.attempts,
    percentage: toNum(update.percentage),
    runFrom: update.runFrom,
    runTo: update.runTo,
    enjoyment: update.enjoyment,
    overallRating: computeOverallRating(ratingConfig, {
      simpleRating: update.simpleRating,
      enjoyment: update.enjoyment,
      ratingScores: update.ratingScores,
    }),
    difficultyOpinion: update.difficultyOpinion,
    onStream: update.onStream,
    fps: update.fps,
    videoUrl: update.videoUrl,
    highlightUrl: update.highlightUrl,
    notes: update.notes,
    loggedAt: update.loggedAt,
    listReferences: update.listReferences,
    recordAcceptances: update.recordAcceptances,
  }
}

function serializeRow(row: RawRow, ratingConfig: OverallRatingConfig) {
  const update = row.progressUpdates[0] ?? null
  return {
    levelProgressId: row.id,
    status: row.status,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    worstFail: row.worstFail,
    attemptsAtDrop: row.attemptsAtDrop,
    droppedAt: row.droppedAt,
    droppedReason: row.droppedReason,
    needsPlacement:
      row.status === 'COMPLETED' &&
      row.level.levelType === 'CLASSIC' &&
      row.classicRanking === null,
    level: row.level,
    entry: update ? serializeEntry(update, ratingConfig) : null,
  }
}

app.get('/me/progress', async (c) => {
  const userId = c.get('userId') as string

  try {
    // Two queries: the user's rating config (to compute each row's overall
    // rating) and the list itself.
    const [user, rows] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          ratingMode: true,
          includeEnjoyment: true,
          enjoymentWeight: true,
          ratingCategories: { select: { id: true, weight: true } },
        },
      }),
      prisma.levelProgress.findMany({
        where: { userId },
        select: levelProgressListSelect,
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const ratingConfig: OverallRatingConfig = {
      ratingMode: user.ratingMode,
      includeEnjoyment: user.includeEnjoyment,
      enjoymentWeight: toNum(user.enjoymentWeight) ?? 0,
      categoryWeights: new Map(
        user.ratingCategories.map((cat) => [cat.id, toNum(cat.weight) ?? 0])
      ),
    }

    return c.json({ data: rows.map((row) => serializeRow(row, ratingConfig)) })
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /v1/me/progress/:levelId — remove the user's entire entry for a level.
// Deleting the LevelProgress cascades to its ProgressUpdates (and their rating
// scores / list references / record acceptances) and its ClassicRanking, per
// the schema's onDelete: Cascade relations.
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
    return c.body(null, 204)
  } catch (error) {
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
