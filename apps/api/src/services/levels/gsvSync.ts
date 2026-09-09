// Shared "check the Global Stats Viewer, persist the result to the levels
// cache" step, used by the /resolve path, the RobTop sync job, and the
// backfill script so the write behavior stays identical everywhere.
//
// Write behavior:
//   - found  → gddlTier / aredlRank / sheetTier / showcaseUrl (each may be
//              null), objectCount only when GSV supplied one, gsvCheckedAt = now()
//   - none   → gsvCheckedAt = now() only (GSV answered 404: it doesn't index
//              this level). Existing values are left alone.
//   - failed → nothing written; gsvCheckedAt stays null so it retries later
//
// Never throws — a broken GSV must never turn into a 500 or a failed batch.

import type { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { fetchGlobalStatsViewerLevel } from '../../utils/globalStatsViewer'
import { logger } from '../../utils/logger'

/**
 * The outcome of one GSV check, so callers (the sync loop) can tally results.
 *   'found'  → GSV has the level; its placements were cached
 *   'none'   → GSV answered but doesn't index this level (cached as checked)
 *   'failed' → the call itself failed; nothing written, will retry
 */
export type GsvCheckOutcome = 'found' | 'none' | 'failed'

/**
 * What a gated check did. Adds 'skipped' to {@link GsvCheckOutcome} for a level
 * that wasn't due, isn't rated, or is delisted — no HTTP call was made, which
 * is what lets the batch helper below pace only between real requests.
 */
export type GsvGatedOutcome = GsvCheckOutcome | 'skipped'

/**
 * Re-check cadence. List placements move — GDDL tiers especially — so this is
 * far shorter than the Song File Hub window. In practice it is rarely the
 * binding constraint: how fast the sync's round-robin walks the cache is (see
 * runGsvSyncSlice below). A level whose check never SUCCEEDED (gsvCheckedAt
 * null) is exempt and stays due every run.
 */
export const GSV_RECHECK_DAYS = 7

/**
 * Whether a level is due for a GSV check: never successfully checked, or last
 * checked longer ago than the re-check cadence.
 */
export function gsvCheckDue(gsvCheckedAt: Date | null): boolean {
  if (gsvCheckedAt === null) return true
  const cutoff = new Date(Date.now() - GSV_RECHECK_DAYS * 24 * 60 * 60 * 1000)
  return gsvCheckedAt < cutoff
}

/**
 * Fetches GSV for a level and persists the outcome. The caller owns the gating
 * decision (skip if delisted / unrated / already checked recently); this runs
 * the check unconditionally and writes the result.
 */
export async function checkAndPersistGsv(
  levelId: string
): Promise<GsvCheckOutcome> {
  const result = await fetchGlobalStatsViewerLevel(levelId)

  // Call failed (network/timeout/5xx) — leave gsvCheckedAt null so the sync
  // job's retry filter picks it up again. Write nothing.
  if (result === undefined) return 'failed'

  const now = new Date()

  // Checked, not indexed — a valid cacheable result. Deliberately does NOT
  // clear existing placements: a level dropping out of GSV's index is far more
  // likely to be an upstream gap than a real de-listing from all three lists.
  if (result === null) {
    await prisma.level.update({
      where: { inGameId: levelId },
      data: { gsvCheckedAt: now },
    })
    return 'none'
  }

  const data: Prisma.LevelUncheckedUpdateInput = {
    gddlTier: result.gddlTier,
    aredlRank: result.aredlRank,
    sheetTier: result.sheetTier,
    showcaseUrl: result.showcaseUrl,
    gsvCheckedAt: now,
  }

  // GSV's object count supersedes RobTop's (which is 65535 over the object
  // limit and 0/null on older levels) — but only when GSV actually has one.
  // Writing a null here would erase the RobTop value for no gain.
  if (result.objectCount !== null) data.objectCount = result.objectCount

  await prisma.level.update({ where: { inGameId: levelId }, data })
  return 'found'
}

/**
 * Gated variant for the /resolve path: runs the check only for a level that is
 * due, rated, and not delisted. Best-effort; never throws.
 *
 * The `isRated` gate matters — GSV indexes rated levels only, so an unrated
 * level would 404 on every pass forever. One that later gets rated is picked up
 * anyway, because its gsvCheckedAt ages past the re-check cadence.
 */
export async function checkGsvIfDue(levelId: string): Promise<GsvGatedOutcome> {
  try {
    const row = await prisma.level.findUnique({
      where: { inGameId: levelId },
      select: { isRated: true, gsvCheckedAt: true, delistedAt: true },
    })
    if (!row) return 'skipped'
    if (row.delistedAt !== null || !row.isRated) return 'skipped'
    if (!gsvCheckDue(row.gsvCheckedAt)) return 'skipped'
    return await checkAndPersistGsv(levelId)
  } catch (err) {
    // Swallow everything so a caller can never fail on the GSV step.
    // gsvCheckedAt is left null so the sync job retries.
    logger.warn({ levelId, err }, 'checkGsvIfDue: failed (non-fatal)')
    return 'failed'
  }
}

// Pacing between GSV calls in a batch. GSV publishes no rate limit and answers
// in well under a second, but it is community infrastructure — the same reason
// the SFH and RobTop paths pace.
const SEED_PACE_MS = 150

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs the gated GSV check across levels that were just seeded from RobTop, so
 * a newly-cached level carries its community-list placements immediately
 * instead of waiting for the cron rotation to reach it.
 *
 * **Call this AFTER any transaction has committed, never inside one** — these
 * are outbound HTTP calls, and holding a Postgres transaction open across them
 * is how a bulk import turns into lock contention.
 *
 * Paced, but only between calls that actually went out: a batch of levels that
 * were already checked costs one indexed read each and no delay at all, which
 * is what keeps a re-import of a known library fast.
 *
 * Never throws — seeding must not fail because GSV is having a bad day.
 */
export async function checkGsvForSeededLevels(
  levelIds: readonly string[]
): Promise<void> {
  let called = false
  for (const levelId of levelIds) {
    if (called) await sleep(SEED_PACE_MS)
    const outcome = await checkGsvIfDue(levelId)
    called = outcome !== 'skipped'
  }
}
