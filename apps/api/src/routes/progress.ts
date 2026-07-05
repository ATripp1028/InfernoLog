// Progress reads and the level-entry delete:
//
//   GET /v1/me/progress                              — the authed user's full list (List page)
//   GET /v1/users/{usernameOrId}/progress/{levelId}  — Level Page payload
//   DELETE /v1/me/progress/:levelId                  — remove the user's entry for a level
//
// All filtering / multi-key sorting / column selection happen client-side for the
// list endpoint, so every row carries the raw fields each filter/column needs.
// See docs/API_DESIGN.md, docs/PRIVACY.md, and packages/core's schemas.
// Writes (completion / progress / drop) live in logging.ts.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/node'
import { EditProgressInputSchema } from '@infernolog/core'
import prisma from '../utils/prisma'
import { computeOverallRating } from '../utils/rating'
import type { OverallRatingConfig } from '../utils/rating'
import { computeRunsGraph } from '../utils/runsGraph'
import { OFFICIAL_LEVELS_BY_ID } from '../data/officialLevels'
import type { HonoVariables } from '../types/hono'
import { applyEdit } from '../services/progress'

const app = new Hono<{ Variables: HonoVariables }>()

type DecimalLike = { toNumber(): number }
const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()

// ─────────────────────────────────────────────
// Shared selects
// ─────────────────────────────────────────────

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
    device: update.device,
    loggedAt: update.loggedAt,
    listReferences: update.listReferences,
  }
}

function serializeRow(row: RawRow, ratingConfig: OverallRatingConfig) {
  const update = row.progressUpdates[0] ?? null
  // Official levels (ids 1–38) aren't served by RobTop, so their release
  // version and secret-coin count come from our data file, not the cache.
  const official = OFFICIAL_LEVELS_BY_ID.get(row.level.inGameId)
  const level = official
    ? { ...row.level, gameVersion: official.gameVersion, coins: official.coins }
    : row.level
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
      level.levelType === 'CLASSIC' &&
      row.classicRanking === null,
    level,
    entry: update ? serializeEntry(update, ratingConfig) : null,
  }
}

// ─────────────────────────────────────────────
// GET /v1/me/progress — the authed user's full list
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// GET /v1/me/progress/:levelId — Level Page payload
//
// Returns: level_progress fields, level metadata, ALL progress_updates (with
// list_references and rating_scores, newest-first), classicRanking placement,
// and the computed runsGraph array (see computeRunsGraph).
//
// The Level Page timeline shows complete history without the "show
// non-completions" toggle — that toggle governs The List and The Ranking only.
// ─────────────────────────────────────────────

app.get('/me/progress/:levelId', async (c) => {
  const userId = c.get('userId') as string
  const { levelId } = c.req.param()

  try {
    const lp = await prisma.levelProgress.findUnique({
      where: { userId_levelId: { userId, levelId } },
      select: {
        id: true,
        status: true,
        visibility: true,
        levelNotes: true,
        droppedReason: true,
        droppedAt: true,
        attemptsAtDrop: true,
        worstFail: true,
        createdAt: true,
        updatedAt: true,
        classicRanking: {
          select: { id: true, rankingIndex: true },
        },
        level: {
          select: {
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
            officialSongId: true,
          },
        },
        progressUpdates: {
          orderBy: { loggedAt: 'desc' },
          select: {
            id: true,
            isCompletion: true,
            percentage: true,
            runFrom: true,
            runTo: true,
            attempts: true,
            date: true,
            dateUncertain: true,
            onStream: true,
            fps: true,
            enjoyment: true,
            simpleRating: true,
            difficultyOpinion: true,
            difficultyOpinionStars: true,
            notes: true,
            videoUrl: true,
            highlightUrl: true,
            loggedAt: true,
            coinsCollected: true,
            twoPlayerSolo: true,
            twoPlayerPartner: true,
            device: true,
            listReferences: {
              select: {
                listSource: true,
                tierOrRank: true,
                atTimeOfLogging: true,
              },
            },
            ratingScores: {
              select: { categoryId: true, score: true },
            },
          },
        },
      },
    })

    // No entry → 404 (whether the level doesn't exist or the user never logged it).
    if (!lp) return c.json({ error: 'Level progress not found' }, 404)

    // Build runsGraph. In v1 there is at most one drop event on level_progress;
    // computeRunsGraph accepts an array for forward-compatibility.
    // Gate on status === 'DROPPED': worstFail and attemptsAtDrop can be set on
    // completed levels too, so they alone must not trigger a drop bar.
    const drops =
      lp.status === 'DROPPED'
        ? [
            {
              droppedAt: lp.droppedAt,
              attemptsAtDrop: lp.attemptsAtDrop,
              worstFail: lp.worstFail,
            },
          ]
        : []

    // runsGraph expects oldest-first; progressUpdates above is newest-first.
    const updatesForGraph = [...lp.progressUpdates].reverse().map((u) => ({
      id: u.id,
      isCompletion: u.isCompletion,
      percentage: toNum(u.percentage),
      runFrom: u.runFrom,
      runTo: u.runTo,
      date: u.date,
      dateUncertain: u.dateUncertain,
      loggedAt: u.loggedAt,
    }))

    const runsGraph = computeRunsGraph(updatesForGraph, drops)

    // Derive rank position from rankingIndex: count how many of the user's
    // placed completions have a higher (easier) rankingIndex. 1-based.
    let rankPosition: number | null = null
    if (lp.classicRanking) {
      const count = await prisma.classicRanking.count({
        where: {
          userId,
          rankingIndex: { gt: lp.classicRanking.rankingIndex },
        },
      })
      rankPosition = count + 1
    }

    // Find the completion update (if any) for video/highlight URLs.
    const completionUpdate =
      lp.progressUpdates.find((u) => u.isCompletion) ?? null

    return c.json({
      data: {
        levelProgressId: lp.id,
        status: lp.status,
        visibility: lp.visibility,
        levelNotes: lp.levelNotes,
        droppedReason: lp.droppedReason,
        droppedAt: lp.droppedAt,
        attemptsAtDrop: lp.attemptsAtDrop,
        worstFail: lp.worstFail,
        createdAt: lp.createdAt,
        updatedAt: lp.updatedAt,
        // Ranking placement (null if unplaced or not completed)
        rankingIndex: lp.classicRanking
          ? toNum(lp.classicRanking.rankingIndex)
          : null,
        rankPosition,
        // Completion media (video/highlight) — unambiguous in v1 (one completion
        // per level). In v3 (rebeat), "which video is the hero" is deferred to
        // the rebeat design. See DATA_MODEL.md near progress_updates.video_url.
        completionVideoUrl: completionUpdate?.videoUrl ?? null,
        completionHighlightUrl: completionUpdate?.highlightUrl ?? null,
        level: lp.level,
        progressUpdates: lp.progressUpdates.map((u) => ({
          progressUpdateId: u.id,
          isCompletion: u.isCompletion,
          percentage: toNum(u.percentage),
          runFrom: u.runFrom,
          runTo: u.runTo,
          attempts: u.attempts,
          date: u.date,
          dateUncertain: u.dateUncertain,
          onStream: u.onStream,
          fps: u.fps,
          enjoyment: u.enjoyment,
          simpleRating: u.simpleRating,
          difficultyOpinion: u.difficultyOpinion,
          difficultyOpinionStars: u.difficultyOpinionStars,
          notes: u.notes,
          videoUrl: u.videoUrl,
          highlightUrl: u.highlightUrl,
          loggedAt: u.loggedAt,
          listReferences: u.listReferences,
          ratingScores: u.ratingScores,
          coinsCollected: u.coinsCollected,
          twoPlayerSolo: u.twoPlayerSolo,
          twoPlayerPartner: u.twoPlayerPartner,
          device: u.device,
        })),
        runsGraph,
      },
    })
  } catch (error) {
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
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
