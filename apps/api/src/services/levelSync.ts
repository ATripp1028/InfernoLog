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
import { fetchRobtopLevelResult } from '../utils/robtop'
import { checkAndPersistSfhNong, sfhCheckDue } from './sfhSync'
import { logger } from '../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

// The "volatile window": a rated level whose rating status changed within this
// many days is re-checked weekly (rated difficulty is most likely to be revised
// shortly after a level is rated). Older rated levels fall to the monthly job.
export const VOLATILE_WINDOW_DAYS = 14

// Local pacing on top of the shared rate limiter every fetchRobtopLevel call
// goes through (utils/robtopRateLimit.ts) — belt and suspenders. `paceMs` is
// also how tests skip the delay (pass 0) since fetchRobtopLevel is mocked in
// those tests and the shared limiter is never in play there.
const PACE_MS = 670
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Circuit breaker: if this many levels in a row come back "gone" (not-found or
// unreachable) or throw, abort the whole batch. A healthy RobTop never returns a
// long run of missing levels — an ID-ordered batch doesn't have 5 genuinely-
// deleted levels back to back — so a streak this long means RobTop is rate-
// limiting/erroring the whole run (the Aug 2026 incident 429'd every request
// once it started). Aborting caps the blast radius and stops wasting the block
// window; the untouched tail is retried on the next run.
const CIRCUIT_BREAKER_STREAK = 5

// Mass-delist alarm: a single run delisting at least this many levels (even if
// not consecutive) is almost always an upstream problem, not reality. Surfaced
// to Sentry so it pages instead of being discovered weeks later.
const MASS_DELIST_ALERT = 10

// Per-level result, so syncLevelBatch can drive the circuit breaker. 'synced'
// (a live level, changed or not) resets the streak; 'delisted'/'unreachable'
// extend it; 'skipped' (our cache row vanished mid-run — unrelated to RobTop
// health) is neutral.
type SyncOutcome = 'synced' | 'delisted' | 'unreachable' | 'skipped'

export interface SyncBatchResult {
  processed: number
  // Found rows that had at least one field overwritten (excludes last_checked_at
  // bookkeeping-only writes).
  updated: number
  // Subset of `updated` where is_rated / in_game_difficulty changed (stamped
  // rating_status_since).
  ratingChanged: number
  delisted: number
  // RobTop couldn't be reached for this level (rate-limit/Cloudflare/network/
  // timeout/parse). The row is left untouched — NOT delisted — and retried next
  // run. Tracked separately from `errors` (unexpected throws) and `delisted`
  // (genuine not-found) so a throttled batch is diagnosable.
  unreachable: number
  errors: number
  // True if the circuit breaker tripped and the batch was aborted before every
  // level was processed (RobTop was failing the whole run). The untouched tail
  // is retried next run.
  aborted: boolean
  // SFH bookkeeping: levels eligible for a Song File Hub check that we actually
  // called SFH for this run, and how many of those turned up a rated NONG.
  sfhChecked: number
  sfhFound: number
}

// Just the fields the diff compares against, plus the SFH-gating fields.
// Selected up front so we compare to the pre-sync snapshot even if the row is
// written mid-loop. sfhCheckedAt/delistedAt drive the SFH re-check filter.
const compareSelect = {
  isRated: true,
  inGameDifficulty: true,
  name: true,
  creator: true,
  songName: true,
  songAuthor: true,
  sfhCheckedAt: true,
  delistedAt: true,
} satisfies Prisma.LevelSelect

async function syncOneLevel(
  levelId: string,
  result: SyncBatchResult,
  paceMs: number
): Promise<SyncOutcome> {
  const current = await prisma.level.findUnique({
    where: { inGameId: levelId },
    select: compareSelect,
  })
  // Row vanished between the query that produced the batch and now — nothing to
  // reconcile against.
  if (!current) {
    logger.warn({ levelId }, 'levelSync: level row not found; skipping')
    return 'skipped'
  }

  result.processed++

  const robtopResult = await fetchRobtopLevelResult(levelId)

  // Unreachable — a transient failure (rate-limiter timeout, Cloudflare block,
  // non-OK response, network error, timeout, parse failure). It says NOTHING
  // about whether the level exists, so we must NOT delist on it: doing so
  // (the old code collapsed unreachable → null → delist) mass-delisted live
  // levels whenever a batch got throttled. Leave the row entirely untouched —
  // not even lastCheckedAt — and let a later run re-check it.
  if (robtopResult.status === 'unreachable') {
    result.unreachable++
    logger.warn(
      { levelId },
      'levelSync: RobTop unreachable; skipping (no delist, will retry)'
    )
    return 'unreachable'
  }

  // Not-found (RobTop "-1"/empty body): GD genuinely has no such level. Freeze
  // last-known metadata, flag the row delisted, and run no diff logic. A level
  // just discovered to no longer exist is NOT worth an SFH call this run, so we
  // return before it.
  if (robtopResult.status === 'not_found') {
    await prisma.level.update({
      where: { inGameId: levelId },
      data: {
        delistedAt: new Date(),
        lastCheckedAt: new Date(),
      },
    })
    result.delisted++
    logger.info({ levelId }, 'levelSync: level delisted (no RobTop result)')
    return 'delisted'
  }

  const robtop = robtopResult.level

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

  // Opportunistic Song File Hub NONG check — piggybacks on this batch for any
  // level due for a check (never successfully checked, or last checked past the
  // re-check cadence) that wasn't (before this run) delisted. Paced separately
  // since SFH is a community-run API. A failure leaves sfhCheckedAt null so a
  // later run retries.
  const sfhEligible =
    current.delistedAt === null && sfhCheckDue(current.sfhCheckedAt)
  if (sfhEligible) {
    if (paceMs > 0) await sleep(paceMs)
    result.sfhChecked++
    // Query the SFH catalog matching this level's just-synced rating status.
    const outcome = await checkAndPersistSfhNong(levelId, robtop.isRated)
    if (outcome === 'found') result.sfhFound++
  }

  return 'synced'
}

// Fetch/compare/write every level in the batch, sequentially and paced. Never
// throws: a per-level failure is logged + captured and the batch continues —
// except the circuit breaker, which aborts the batch when RobTop is clearly
// failing the whole run (see CIRCUIT_BREAKER_STREAK).
export async function syncLevelBatch(
  levelIds: string[],
  paceMs: number = PACE_MS
): Promise<SyncBatchResult> {
  const result: SyncBatchResult = {
    processed: 0,
    updated: 0,
    ratingChanged: 0,
    delisted: 0,
    unreachable: 0,
    errors: 0,
    aborted: false,
    sfhChecked: 0,
    sfhFound: 0,
  }

  // Consecutive "gone" (not-found/unreachable) or thrown results. Reset by any
  // successful sync; a long enough streak trips the circuit breaker.
  let goneStreak = 0

  for (let i = 0; i < levelIds.length; i++) {
    const levelId = levelIds[i]
    if (!levelId) continue
    if (i > 0 && paceMs > 0) await sleep(paceMs)

    try {
      const outcome = await syncOneLevel(levelId, result, paceMs)
      if (outcome === 'delisted' || outcome === 'unreachable') goneStreak++
      else if (outcome === 'synced') goneStreak = 0
      // 'skipped' is neutral — leave the streak unchanged.
    } catch (err) {
      result.errors++
      goneStreak++
      logger.error({ levelId, err }, 'levelSync: error syncing level')
      Sentry.captureException(err)
    }

    if (goneStreak >= CIRCUIT_BREAKER_STREAK) {
      result.aborted = true
      const remaining = levelIds.length - (i + 1)
      logger.error(
        { streak: goneStreak, processed: result.processed, remaining },
        'levelSync: circuit breaker tripped; aborting batch (RobTop failing)'
      )
      Sentry.captureMessage(
        `levelSync circuit breaker: ${goneStreak} consecutive failures, ` +
          `aborted with ${remaining} level(s) unprocessed`,
        'error'
      )
      break
    }
  }

  // Mass-delist alarm: a large number of delistings in one run (even without a
  // consecutive streak) is almost always upstream failure, not real deletions.
  if (!result.aborted && result.delisted >= MASS_DELIST_ALERT) {
    Sentry.captureMessage(
      `levelSync mass delist: ${result.delisted} levels delisted in one run`,
      'error'
    )
  }

  return result
}

function volatileCutoff(): Date {
  return new Date(Date.now() - VOLATILE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

// Weekly job: never-rated levels (their rating can appear at any time) plus
// rated levels still inside the volatile window. Delisted rows excluded, and so
// are official levels — getGJLevels21 doesn't serve them, so a sync would always
// see not-found and wrongly delist them (see runStandardSync).
export async function runVolatileSync(): Promise<SyncBatchResult> {
  const cutoff = volatileCutoff()
  const rows = await prisma.level.findMany({
    where: {
      delistedAt: null,
      dataSource: { not: 'official' },
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
// nulls. Official levels are excluded: getGJLevels21 never returns them, so
// syncing one always looks like a not-found and would delist a level that plainly
// still exists.
export async function runStandardSync(): Promise<SyncBatchResult> {
  const cutoff = volatileCutoff()
  const rows = await prisma.level.findMany({
    where: {
      isRated: true,
      delistedAt: null,
      dataSource: { not: 'official' },
      OR: [{ ratingStatusSince: null }, { ratingStatusSince: { lt: cutoff } }],
    },
    select: { inGameId: true },
  })

  logger.info({ count: rows.length }, 'levelSync: standard batch selected')
  const result = await syncLevelBatch(rows.map((r) => r.inGameId))
  logger.info({ ...result }, 'levelSync: standard batch complete')
  return result
}
