// RobTop level-cache sync — re-checks cached `levels` rows against GD's servers
// and overwrites changed fields directly. There is no staging, no pending
// fields, and no nudge/notification: a diff is written to the shared cache
// silently. See EXTERNAL_APIS.md.
//
// A single frequent cron drives it as a ROUND-ROBIN over a cursor
// (runLevelSyncSlice): each run processes a bounded slice of eligible levels
// ordered by inGameId and advances the cursor, wrapping at the end. This
// replaced the old "big weekly + big monthly batch" model, which fired the
// entire rated-level set in one run and reliably tripped RobTop's per-IP rate
// limit — mass-delisting live levels when transient failures were mistaken for
// not-founds (fixed here too; see syncOneLevel + the circuit breaker).
//
// GOLDEN RULE (inherited from the RobTop client): a level that RobTop no longer
// returns is treated as *delisted*, not deleted — its last-known metadata is
// frozen and the row is flagged so the sync skips it thereafter.

import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { fetchRobtopLevelResult } from '../../utils/robtop'
import { buildRobtopRefreshData } from './robtopMapping'
import { checkAndPersistSfhNong, sfhCheckDue } from '../levels/sfhSync'
import { logger } from '../../utils/logger'
import * as Sentry from '@sentry/aws-serverless'

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

// Confirm-before-delist window. A level's FIRST not-found stamps missingSince
// but does NOT delist; only once it has stayed missing at least this long (i.e.
// been re-confirmed on a later rotation) do we actually delist. At the current
// ~daily rotation this is ~2 independent checks — enough that a transient RobTop
// "-1"/rate-limit blip for a live level clears on the next `found` instead of
// delisting it. Tune alongside the cron cadence in sst.config.ts.
const DELIST_CONFIRM_MS = 36 * 60 * 60 * 1000 // 36 hours

// Per-level result, so syncLevelBatch can drive the circuit breaker. 'synced'
// (a live level, changed or not) resets the streak; 'missing' (not-found, first
// or unconfirmed — no delist yet), 'delisted' (not-found confirmed past the
// window), and 'unreachable' all extend it; 'skipped' (our cache row vanished
// mid-run — unrelated to RobTop health) is neutral.
type SyncOutcome = 'synced' | 'missing' | 'delisted' | 'unreachable' | 'skipped'

/** Per-run tallies from one level-cache sync slice, for logging and alarms. */
export interface SyncBatchResult {
  processed: number
  // Found rows that had at least one field overwritten (excludes last_checked_at
  // bookkeeping-only writes).
  updated: number
  // Subset of `updated` where is_rated / in_game_difficulty changed (stamped
  // rating_status_since).
  ratingChanged: number
  // Subset of `updated` that were unverified rows (never given a full RobTop
  // snapshot) rewritten wholesale rather than diffed. Steady state is 0 — a
  // non-zero count means stubs are reaching the sweep, i.e. the seed queue
  // didn't get to them, so it's worth watching rather than just tallying.
  repaired: number
  // Confirmed gone (missing past the confirmation window) and delisted this run.
  delisted: number
  // Seen missing (RobTop not-found) but NOT delisted — either the first sighting
  // (missingSince just stamped) or still inside the confirmation window. Extends
  // the circuit-breaker streak but writes no delistedAt.
  missing: number
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
  // The last id this batch actually attempted, or null for an empty batch. The
  // cron advances its cursor to this rather than to the end of the slice, so an
  // aborted run doesn't skip the levels it never looked at (see
  // runLevelSyncSlice).
  lastAttemptedId: string | null
  // SFH bookkeeping: levels eligible for a Song File Hub check that we actually
  // called SFH for this run, and how many of those turned up a rated NONG.
  sfhChecked: number
  sfhFound: number
}

// Just the fields the diff compares against, plus the SFH-gating fields.
// Selected up front so we compare to the pre-sync snapshot even if the row is
// written mid-loop. sfhCheckedAt/delistedAt drive the SFH re-check filter, and
// `verified` selects between the drift diff and a full repair (see below).
const compareSelect = {
  isRated: true,
  inGameDifficulty: true,
  stars: true,
  name: true,
  creator: true,
  songName: true,
  songAuthor: true,
  verified: true,
  sfhCheckedAt: true,
  delistedAt: true,
  missingSince: true,
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

  // Not-found (RobTop "-1"/empty body): GD reports no such level. This is NOT an
  // immediate delist — RobTop returns "-1" under load too, so a single sighting
  // can't be trusted. We stamp missingSince on the first sighting and only delist
  // once the level has stayed missing past the confirmation window (i.e. been
  // re-confirmed on a later rotation). A level that reappears clears missingSince
  // in the found path below. No SFH call either way, so we return before it.
  if (robtopResult.status === 'not_found') {
    const now = new Date()

    // First sighting — record it and wait for confirmation; do not delist.
    if (current.missingSince === null) {
      await prisma.level.update({
        where: { inGameId: levelId },
        data: { missingSince: now, lastCheckedAt: now },
      })
      result.missing++
      logger.info(
        { levelId },
        'levelSync: level missing (first sighting; awaiting confirmation)'
      )
      return 'missing'
    }

    // Confirmed missing past the window — freeze last-known metadata and delist.
    if (current.missingSince.getTime() <= now.getTime() - DELIST_CONFIRM_MS) {
      await prisma.level.update({
        where: { inGameId: levelId },
        data: { delistedAt: now, lastCheckedAt: now },
      })
      result.delisted++
      logger.info(
        { levelId, missingSince: current.missingSince },
        'levelSync: level delisted (missing past confirmation window)'
      )
      return 'delisted'
    }

    // Still missing but inside the window — keep waiting (leave missingSince).
    await prisma.level.update({
      where: { inGameId: levelId },
      data: { lastCheckedAt: now },
    })
    result.missing++
    logger.info(
      { levelId, missingSince: current.missingSince },
      'levelSync: level still missing (inside confirmation window)'
    )
    return 'missing'
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
    data.ratingStatusSince = now
  }

  // `stars` is the CANONICAL difficulty for a non-demon — every read path
  // resolves the label against it and the count wins (starDifficulty.ts). So it
  // cannot be left behind when the label moves: a level rerated 4-star Hard →
  // 7-star Harder would keep serving "Hard" off the stale count, republishing
  // the very difficulty this sync just corrected. Compared on its own rather
  // than folded into `ratingChanged` for two reasons: a rerate INSIDE one face
  // (4 → 5 stars, still "Hard") changes no label and would otherwise be
  // invisible, and backfilling a count onto a row that never had one is not
  // news about when the level was rated, so it must not bump
  // `ratingStatusSince` (which orders the "recently rated" sort).
  const starsChanged = robtop.stars !== current.stars
  if (starsChanged) data.stars = robtop.stars

  // Text drift. A null from RobTop for any of these is "the response didn't
  // carry it", not a rename to nothing (see PRESERVE_IF_NULL in
  // robtopMapping.ts), and the cached value can be the only one that exists —
  // a name from GDDL metadata, a creator/song typed in on a manual level. So a
  // null is no news: keep what's there. Same rule the repair path below gets
  // from buildRobtopRefreshData.
  let changed = ratingChanged || starsChanged
  for (const field of ['name', 'creator', 'songName', 'songAuthor'] as const) {
    const next = robtop[field]
    if (next === null || next === current[field]) continue
    data[field] = next
    changed = true
  }

  // A row that never received a full RobTop snapshot (verified=false — a stub
  // left by a spreadsheet import, a GDDL sync, or manual entry) is not
  // DRIFTING, it is INCOMPLETE, and the diff above can't fix that: it only ever
  // touches those six fields, so length/coins/featureScore/stars/objectCount/…
  // stay null forever while the row acquires a real name, creator, difficulty
  // and a fresh lastCheckedAt — i.e. it comes to look healthy without being so.
  // That is exactly how the 2026-07-21 GDDL import went unnoticed for weeks.
  //
  // We are already holding the full snapshot here, so write all of it. Costs no
  // extra RobTop call, and flips the row to verified/robtop_autofill, after
  // which it rejoins the narrow-diff regime on the next lap. The narrow diff
  // stays the rule for healthy rows on purpose — writing everything every run
  // would mark nearly every level `updated` (downloads and likes always move),
  // making the drift tallies useless.
  const repaired = !current.verified
  if (repaired) Object.assign(data, buildRobtopRefreshData(robtop))

  // The level is present, so any pending "missing" mark is stale — clear it so a
  // brief disappearance never accumulates toward a delist. Bookkeeping only; not
  // counted as a metadata `changed`.
  if (current.missingSince !== null) data.missingSince = null

  await prisma.level.update({ where: { inGameId: levelId }, data })

  if (changed || repaired) result.updated++
  if (repaired) result.repaired++
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

/**
 * Fetch/compare/write every level in the batch, sequentially and paced. Never
 * throws: a per-level failure is logged + captured and the batch continues —
 * except the circuit breaker, which aborts the batch when RobTop is clearly
 * failing the whole run (see CIRCUIT_BREAKER_STREAK).
 */
export async function syncLevelBatch(
  levelIds: string[],
  paceMs: number = PACE_MS
): Promise<SyncBatchResult> {
  const result: SyncBatchResult = {
    processed: 0,
    updated: 0,
    ratingChanged: 0,
    repaired: 0,
    delisted: 0,
    missing: 0,
    unreachable: 0,
    errors: 0,
    aborted: false,
    lastAttemptedId: null,
    sfhChecked: 0,
    sfhFound: 0,
  }

  // Consecutive "gone" (not-found/missing/unreachable) or thrown results. Reset
  // by any successful sync; a long enough streak trips the circuit breaker.
  let goneStreak = 0

  for (let i = 0; i < levelIds.length; i++) {
    const levelId = levelIds[i]
    if (!levelId) continue
    if (i > 0 && paceMs > 0) await sleep(paceMs)
    result.lastAttemptedId = levelId

    try {
      const outcome = await syncOneLevel(levelId, result, paceMs)
      if (
        outcome === 'delisted' ||
        outcome === 'missing' ||
        outcome === 'unreachable'
      ) {
        goneStreak++
      } else if (outcome === 'synced') goneStreak = 0
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
          `aborted with ${remaining} level(s) unprocessed — if RobTop is ` +
          'blocking us, run `pnpm probe:robtop` from a non-AWS machine while ' +
          'it lasts to tell an egress-IP block from a bad request',
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

/**
 * How many levels one cron invocation processes. Deliberately well under
 * RobTop's rate-limit tolerance (the Aug 2026 incident tripped it after ~165
 * sequential requests), so a single slice can't provoke a throttle, and the
 * long gap between runs gives the egress IP ample recovery time. Bumping this
 * (or the cron frequency in sst.config.ts) tightens the re-check cadence as the
 * cache grows.
 */
export const SYNC_SLICE_SIZE = 50

// Levels the main sweep considers, in every run: cached, not delisted, and not
// official (getGJLevels21 never returns official levels, so syncing one always
// looks like a not-found — it would wrongly delist a level that plainly exists).
const syncEligibleWhere = {
  delistedAt: null,
  dataSource: { not: 'official' },
} satisfies Prisma.LevelWhereInput

// The reverify pass rotates over the OTHER half: already-delisted (non-official)
// levels, re-checking whether they've come back (reuploads reuse the inGameId).
const reverifyEligibleWhere = {
  delistedAt: { not: null },
  dataSource: { not: 'official' },
} satisfies Prisma.LevelWhereInput

// Each rotation keeps its own cursor row in level_sync_cursor, keyed by id.
type CursorKey = 'singleton' | 'reverify'

async function readCursor(key: CursorKey): Promise<string | null> {
  const row = await prisma.levelSyncCursor.findUnique({
    where: { id: key },
    select: { lastInGameId: true },
  })
  return row?.lastInGameId ?? null
}

async function writeCursor(
  key: CursorKey,
  lastInGameId: string
): Promise<void> {
  await prisma.levelSyncCursor.upsert({
    where: { id: key },
    create: { id: key, lastInGameId },
    update: { lastInGameId },
  })
}

// Selects the next slice of ids matching `where` after `cursor` (lexicographic —
// ids compare as strings, matching this orderBy). Returns fewer than `size` at
// the end of the rotation, and an empty array once the cursor is past the last
// id (the caller then wraps to the start).
async function selectSlice(
  where: Prisma.LevelWhereInput,
  cursor: string | null,
  size: number
): Promise<string[]> {
  const rows = await prisma.level.findMany({
    where: cursor ? { ...where, inGameId: { gt: cursor } } : where,
    orderBy: { inGameId: 'asc' },
    take: size,
    select: { inGameId: true },
  })
  return rows.map((r) => r.inGameId)
}

// Reads a cursor and returns the next slice of ids for it, wrapping to the start
// of the rotation when the cursor has passed the last matching id.
async function nextSlice(
  key: CursorKey,
  where: Prisma.LevelWhereInput,
  size: number
): Promise<{ cursor: string | null; ids: string[] }> {
  const cursor = await readCursor(key)
  let ids = await selectSlice(where, cursor, size)
  if (ids.length === 0 && cursor !== null) {
    ids = await selectSlice(where, null, size)
  }
  return { cursor, ids }
}

/**
 * One cron slice of the round-robin sync. Reads the cursor, syncs the next
 * `size` eligible levels (wrapping to the start when it reaches the end), and
 * advances the cursor to the last id it ATTEMPTED — which is the end of the
 * slice on a healthy run, and the level the circuit breaker stopped on when a
 * run aborts.
 *
 * Advancing to the last attempted id rather than the end of the slice keeps
 * both guarantees at once. Nothing is silently skipped: an aborted run leaves
 * the untouched tail in front of the cursor, so the next run picks it up ~6h
 * later instead of a whole rotation later — during the Aug 2026 Cloudflare
 * block, a run that processed 5 of 50 levels moved the cursor past all 50, so
 * ~90% of every lap went unchecked for as long as the block lasted. And the
 * rotation still can't be pinned: the cursor advances by at least the breaker's
 * streak length every run, so even a permanently-failing stretch is stepped
 * over rather than retried forever.
 */
export async function runLevelSyncSlice(
  size: number = SYNC_SLICE_SIZE
): Promise<SyncBatchResult> {
  const { cursor, ids } = await nextSlice('singleton', syncEligibleWhere, size)

  if (ids.length === 0) {
    logger.info('levelSync: no eligible levels to sync')
    return syncLevelBatch([])
  }

  logger.info(
    { count: ids.length, from: cursor, to: ids[ids.length - 1] },
    'levelSync: slice selected'
  )
  const result = await syncLevelBatch(ids)

  // Advance regardless of abort — but only over what we actually attempted, so
  // an aborted run's untouched tail stays in front of the cursor.
  await writeCursor('singleton', result.lastAttemptedId ?? ids[ids.length - 1]!)

  logger.info({ ...result }, 'levelSync: slice complete')
  return result
}

/**
 * How many delisted levels the reverify pass re-checks per run. Smaller than the
 * main slice — the delisted set is small and reappearances are rare, so this is
 * just a slow safety net that eventually notices a reupload.
 */
export const REVERIFY_SLICE_SIZE = 20

/** Tallies from one pass over the delisted set, looking for reuploads. */
export interface ReverifyResult {
  processed: number
  // Reappeared on RobTop → un-delisted this run.
  restored: number
  // Re-confirmed still gone → left delisted.
  stillGone: number
  // RobTop unreachable → left untouched, retried next lap.
  unreachable: number
}

/**
 * One cron slice of the delisted-reverify rotation. Re-checks a bounded slice of
 * already-delisted levels and un-delists any that RobTop now returns (reuploads
 * reuse the inGameId, so a delisted level can legitimately come back). No
 * circuit breaker: reverify makes no destructive writes — un-delisting only a
 * level RobTop actually returns is always safe — and a run of not-founds is the
 * EXPECTED case here, not a failure signal. The shared 429 cooldown still stops
 * it from hammering a rate-limited RobTop.
 */
export async function runDelistedReverifySlice(
  size: number = REVERIFY_SLICE_SIZE,
  paceMs: number = PACE_MS
): Promise<ReverifyResult> {
  const result: ReverifyResult = {
    processed: 0,
    restored: 0,
    stillGone: 0,
    unreachable: 0,
  }

  const { ids } = await nextSlice('reverify', reverifyEligibleWhere, size)
  if (ids.length === 0) {
    logger.info('levelSync: no delisted levels to reverify')
    return result
  }

  for (let i = 0; i < ids.length; i++) {
    const levelId = ids[i]!
    if (i > 0 && paceMs > 0) await sleep(paceMs)
    result.processed++

    try {
      const res = await fetchRobtopLevelResult(levelId)
      if (res.status === 'found') {
        await prisma.level.update({
          where: { inGameId: levelId },
          data: {
            delistedAt: null,
            missingSince: null,
            lastCheckedAt: new Date(),
          },
        })
        result.restored++
        logger.info(
          { levelId },
          'levelSync: delisted level reappeared on RobTop; un-delisted'
        )
      } else if (res.status === 'not_found') {
        result.stillGone++
      } else {
        result.unreachable++
      }
    } catch (err) {
      result.unreachable++
      logger.error(
        { levelId, err },
        'levelSync: error reverifying delisted level'
      )
      Sentry.captureException(err)
    }
  }

  await writeCursor('reverify', ids[ids.length - 1]!)
  logger.info({ ...result }, 'levelSync: reverify slice complete')
  return result
}
