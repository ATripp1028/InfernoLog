// RobTop level-cache sync — the shared fetch/compare/write core behind both
// scheduled jobs (weekly "volatile" + monthly "standard"). It re-checks cached
// `levels` rows against GD's servers and overwrites changed fields directly.
// There is no staging, no pending fields, and no nudge/notification: a diff is
// written to the shared cache silently. See EXTERNAL_APIS.md.
//
// GOLDEN RULE (inherited from the RobTop client): a level that RobTop no longer
// returns is treated as *delisted*, not deleted — its last-known metadata is
// frozen and the row is flagged so both jobs skip it thereafter.

import type { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { fetchRobtopLevel } from '../utils/robtop'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

// The "volatile window": a rated level whose rating status changed within this
// many days is re-checked weekly (rated difficulty is most likely to be revised
// shortly after a level is rated). Older rated levels fall to the monthly job.
export const VOLATILE_WINDOW_DAYS = 14

// Paces RobTop calls to stay well under ~1.5 req/s, matching levelSeedWorker.
const PACE_MS = 670
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface SyncBatchResult {
  processed: number
  // Found rows that had at least one field overwritten (excludes last_checked_at
  // bookkeeping-only writes).
  updated: number
  // Subset of `updated` where is_rated / in_game_difficulty changed (stamped
  // rating_status_since).
  ratingChanged: number
  delisted: number
  errors: number
}

// Just the fields the diff compares against. Selected up front so we compare to
// the pre-sync snapshot even if the row is written mid-loop.
const compareSelect = {
  isRated: true,
  inGameDifficulty: true,
  name: true,
  creator: true,
  songName: true,
  songAuthor: true,
} satisfies Prisma.LevelSelect

async function syncOneLevel(
  levelId: string,
  result: SyncBatchResult
): Promise<void> {
  const current = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select: compareSelect,
  })
  // Row vanished between the query that produced the batch and now — nothing to
  // reconcile against.
  if (!current) {
    logger.warn({ levelId }, 'levelSync: level row not found; skipping')
    return
  }

  result.processed++

  const robtop = await fetchRobtopLevel(levelId)

  // Not-found (RobTop "-1"/empty → null): freeze last-known metadata, flag the
  // row delisted, and run no diff logic.
  if (!robtop) {
    await prisma.level.update({
      where: { inGameId: levelId },
      data: {
        delisted: true,
        delistedAt: new Date(),
        lastCheckedAt: new Date(),
      },
    })
    result.delisted++
    logger.info({ levelId }, 'levelSync: level delisted (no RobTop result)')
    return
  }

  // Found: diff against the cached snapshot and write only what changed.
  const now = new Date()
  const data: Prisma.LevelUpdateInput = { lastCheckedAt: now }

  const ratingChanged =
    robtop.isRated !== current.isRated ||
    robtop.inGameDifficulty !== current.inGameDifficulty
  if (ratingChanged) {
    data.isRated = robtop.isRated
    data.inGameDifficulty = robtop.inGameDifficulty
    // Only rating-status volatility drives the weekly re-check window.
    data.ratingStatusSince = now
  }

  if (robtop.name !== current.name) data.name = robtop.name
  if (robtop.creator !== current.creator) data.creator = robtop.creator
  if (robtop.songName !== current.songName) data.songName = robtop.songName
  if (robtop.songAuthor !== current.songAuthor) {
    data.songAuthor = robtop.songAuthor
  }

  // More than just last_checked_at present means at least one field diffed.
  const changed = Object.keys(data).length > 1
  await prisma.level.update({ where: { inGameId: levelId }, data })

  if (changed) result.updated++
  if (ratingChanged) result.ratingChanged++
}

// Fetch/compare/write every level in the batch, sequentially and paced. Never
// throws: a per-level failure is logged + captured and the batch continues.
export async function syncLevelBatch(
  levelIds: string[],
  paceMs: number = PACE_MS
): Promise<SyncBatchResult> {
  const result: SyncBatchResult = {
    processed: 0,
    updated: 0,
    ratingChanged: 0,
    delisted: 0,
    errors: 0,
  }

  for (let i = 0; i < levelIds.length; i++) {
    const levelId = levelIds[i]
    if (!levelId) continue
    if (i > 0 && paceMs > 0) await sleep(paceMs)

    try {
      await syncOneLevel(levelId, result)
    } catch (err) {
      result.errors++
      logger.error({ levelId, err }, 'levelSync: error syncing level')
      Sentry.captureException(err)
    }
  }

  return result
}

function volatileCutoff(): Date {
  return new Date(Date.now() - VOLATILE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

// Weekly job: never-rated levels (their rating can appear at any time) plus
// rated levels still inside the volatile window. Delisted rows excluded.
export async function runVolatileSync(): Promise<SyncBatchResult> {
  const cutoff = volatileCutoff()
  const rows = await prisma.level.findMany({
    where: {
      delisted: false,
      OR: [{ isRated: false }, { ratingStatusSince: { gte: cutoff } }],
    },
    select: { inGameId: true },
  })

  logger.info({ count: rows.length }, 'levelSync: volatile batch selected')
  const result = await syncLevelBatch(rows.map((r) => r.inGameId))
  logger.info({ ...result }, 'levelSync: volatile batch complete')
  return result
}

// Monthly job: everything the volatile job does NOT already cover — rated,
// non-delisted levels whose rating status is older than the volatile window OR
// was never stamped (null). The explicit null branch matters: a rated level
// cached outside the sync (import/resolve) has a null rating_status_since and
// would otherwise fall through both jobs, since SQL `NOT (ts >= cutoff)` drops
// nulls.
export async function runStandardSync(): Promise<SyncBatchResult> {
  const cutoff = volatileCutoff()
  const rows = await prisma.level.findMany({
    where: {
      isRated: true,
      delisted: false,
      OR: [{ ratingStatusSince: null }, { ratingStatusSince: { lt: cutoff } }],
    },
    select: { inGameId: true },
  })

  logger.info({ count: rows.length }, 'levelSync: standard batch selected')
  const result = await syncLevelBatch(rows.map((r) => r.inGameId))
  logger.info({ ...result }, 'levelSync: standard batch complete')
  return result
}
