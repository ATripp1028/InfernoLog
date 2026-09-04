// GET /v1/me/progress — the authed user's full level-progress list (The List).
//
// Returns every row in one payload, both PUBLIC and PRIVATE, with no query
// params: all filtering, multi-key sorting, and column selection happen
// client-side, so every row carries the raw fields each filter/column needs.
// See docs/API_DESIGN.md and packages/core's LevelProgressListItemSchema.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import {
  computeOverallRating,
  type OverallRatingConfig,
} from '@infernolog/core'
import prisma from '../../utils/prisma'
import type { HonoVariables } from '../../types/hono'
import { toNum } from '../../utils/decimal'
import { levelSummarySelect, mapLevel } from '../../services/levels/row'

const app = new Hono<{ Variables: HonoVariables }>()

// ─────────────────────────────────────────────
// Selects
// ─────────────────────────────────────────────

const levelProgressListSelect = {
  id: true,
  status: true,
  visibility: true,
  worstFail: true,
  createdAt: true,
  updatedAt: true,
  // Presence of a ranking row → !needsPlacement for completed classic levels.
  classicDemonList: { select: { id: true } },
  userGddlTier: true,
  difficultyOpinion: true,
  simpleRating: true,
  ratingScores: { select: { categoryId: true, score: true } },
  level: { select: levelSummarySelect },
  // The representative update: completion first (kind desc — see
  // ProgressUpdateKind's declaration order), else the most recent. For a
  // DROPPED level that's the drop itself, now that drops are ordinary
  // progress_update rows. `take: 1` yields exactly one per level in a single
  // query.
  progressUpdates: {
    orderBy: [{ kind: 'desc' }, { loggedAt: 'desc' }] as const,
    take: 1,
  },
} satisfies Prisma.LevelProgressSelect

type RawRow = Prisma.LevelProgressGetPayload<{
  select: typeof levelProgressListSelect
}>

// ─────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────

function serializeEntry(update: RawRow['progressUpdates'][number]) {
  return {
    progressUpdateId: update.id,
    kind: update.kind,
    date: update.date,
    dateTimezone: update.dateTimezone,
    dateUncertain: update.dateUncertain,
    attempts: update.attempts,
    percentage: toNum(update.percentage),
    runFrom: update.runFrom,
    runTo: update.runTo,
    enjoyment: update.enjoyment,
    onStream: update.onStream,
    fps: update.fps,
    percentageVersion: update.percentageVersion,
    videoUrl: update.videoUrl,
    highlightUrl: update.highlightUrl,
    notes: update.notes,
    device: update.device,
    loggedAt: update.loggedAt,
  }
}

function serializeRow(row: RawRow, ratingConfig: OverallRatingConfig) {
  const update = row.progressUpdates[0] ?? null
  const level = mapLevel(row.level)
  return {
    levelProgressId: row.id,
    status: row.status,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    worstFail: row.worstFail,
    needsPlacement:
      row.status === 'COMPLETED' &&
      level.levelType === 'CLASSIC' &&
      row.classicDemonList === null,
    userGddlTier: row.userGddlTier,
    // Level-scoped, not per-event — so it rides on the row, not on `entry`.
    difficultyOpinion: row.difficultyOpinion,
    // One rating per level (LevelProgress), not per event — enjoyment still
    // comes from the representative update since it's logged per-event.
    overallRating: computeOverallRating(ratingConfig, {
      simpleRating: row.simpleRating,
      enjoyment: update?.enjoyment ?? null,
      ratingScores: row.ratingScores,
    }),
    ratingScores: row.ratingScores,
    level,
    entry: update ? serializeEntry(update) : null,
  }
}

// ─────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────

app.get('/me/progress', async (c) => {
  const userId = c.get('userId')

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
})

export default app
