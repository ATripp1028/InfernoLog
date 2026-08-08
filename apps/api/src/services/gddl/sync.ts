import type { GddlSyncResult } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { buildRobtopCreateData } from '../levels/robtopMapping'
import {
  fetchGddlUserInfo,
  fetchAllGddlSubmissions,
  roundGddlTier,
  type GddlSubmission,
} from '../../utils/gddl'
import { fetchRobtopLevelResult } from '../../utils/robtop'
import { findOrCreateLevelProgress } from '../progress'
import { removeFromWantToBeat } from '../collections'
import { enqueueSeedIds } from '../importExport/import'
import { logger } from '../../utils/logger'
import * as Sentry from '@sentry/aws-serverless'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

// Consecutive "RobTop unreachable" lookups after which this run stops calling
// RobTop entirely. Mirrors the level sync's circuit breaker, and matters more
// here than the count suggests: a 429 opens a SHARED cooldown that makes
// acquireRobtopSlot return false INSTANTLY for 60s–5min, so an uninterrupted
// run would tear through every remaining submission at full speed, stubbing
// each one. Tripping early caps that blast radius.
//
// Unlike the level sync we do NOT abort the run — the submissions themselves
// are the user's own data and don't need RobTop. We just stop asking for level
// metadata and let the seed worker collect it later.
const ROBTOP_BREAKER_STREAK = 5

// A run ending with at least this many levels still awaiting a RobTop snapshot
// is an incident, not routine: it means a bulk import hit a throttle and the
// cache is now full of stubs that only the seed queue can repair. Surfaced to
// Sentry so it pages instead of being found weeks later by a user noticing
// blank level data (which is exactly how the 2026-07-21 batch was found).
const STUB_BACKLOG_ALERT = 10

// GDDL uses sequential IDs 1–3 for the three official demon main levels rather
// than GD's real in-game IDs. Map to the canonical GD level IDs so submissions
// for these levels resolve to the correct entry in InfernoLog's levels cache.
const GDDL_OFFICIAL_LEVEL_ID_MAP: Record<string, string> = {
  '1': '14', // Clubstep
  '2': '18', // Theory of Everything 2
  '3': '20', // Deadlocked
}

interface LevelLookupResult {
  inGameDifficulty: string | null
  // True when this call left behind (or found) a row that still needs a RobTop
  // snapshot AND retrying is worth it. Caller enqueues these for the seed
  // worker so a repeat import doesn't leave stubs stranded forever (see the
  // `existing` short-circuit below, which otherwise treats any row as "already
  // handled" regardless of whether it was ever actually seeded).
  //
  // Deliberately FALSE for a level GD reports as not-found: the GDDL-metadata
  // stub is then the best row we will ever have, and re-asking for an id GD
  // doesn't have would burn a call on every sync, forever.
  needsSeed: boolean
  // True when RobTop could not be REACHED for this level (rate-limiter timeout,
  // 429 cooldown, network/timeout/parse) — as opposed to answering "no such
  // level". Says nothing about whether the level exists; drives the caller's
  // circuit breaker.
  robtopUnreachable: boolean
}

// Creates the fallback row for a level RobTop couldn't supply: GDDL's own
// metadata is all we have, so the row is a name-only stub. Throws if GDDL has
// no usable name either (caller skips the submission).
async function createGddlStub(
  tx: Tx,
  levelId: string,
  submission: GddlSubmission
): Promise<void> {
  const name = submission.Level?.Meta?.Name?.trim()
  if (!name) throw new Error('missing level name')

  await tx.level.create({
    data: {
      inGameId: levelId,
      name,
      dataSource: 'manual',
      verified: false,
    },
  })
}

// Ensures the level exists in the cache. On a cache miss, tries RobTop first,
// then falls back to the GDDL metadata. Returns the level's inGameDifficulty.
// Throws if no usable name can be found (caller skips the submission).
//
// `skipRobtop` is set once the caller's circuit breaker has tripped: RobTop is
// failing the whole run, so we go straight to the GDDL-metadata stub and let
// the seed worker fill it in later rather than paying for a call that will
// fail.
async function getOrCreateLevel(
  tx: Tx,
  levelId: string,
  submission: GddlSubmission,
  skipRobtop: boolean
): Promise<LevelLookupResult> {
  const existing = await tx.level.findUnique({
    where: { inGameId: levelId },
    select: { inGameDifficulty: true, verified: true },
  })
  if (existing) {
    // An unverified row might be a not-found stub (permanently unseedable) or
    // one left by an unreachable RobTop. Nothing on the row says which, so we
    // retry it — the seed worker is cheap and gives up on its own.
    return {
      inGameDifficulty: existing.inGameDifficulty,
      needsSeed: !existing.verified,
      robtopUnreachable: false,
    }
  }

  if (skipRobtop) {
    await createGddlStub(tx, levelId, submission)
    return {
      inGameDifficulty: null,
      needsSeed: true,
      robtopUnreachable: true,
    }
  }

  // Cache miss — try RobTop first. Uses the result-preserving fetch, NOT the
  // null-collapsing wrapper: "GD has no such level" and "we couldn't reach GD"
  // produce identical stub rows but need opposite follow-ups, and conflating
  // them is what stranded the 2026-07-21 import as permanent stubs.
  const res = await fetchRobtopLevelResult(levelId)

  if (res.status === 'found') {
    // Prefer RobTop's name; fall back to GDDL metadata if RobTop returned null
    // (happens for deleted/anonymized levels that still exist in GD's index).
    const name = res.level.name ?? submission.Level?.Meta?.Name?.trim() ?? null
    const created = await tx.level.create({
      data: buildRobtopCreateData(levelId, res.level, { name }),
      select: { inGameDifficulty: true },
    })
    return {
      inGameDifficulty: created.inGameDifficulty,
      needsSeed: false,
      robtopUnreachable: false,
    }
  }

  await createGddlStub(tx, levelId, submission)
  return {
    inGameDifficulty: null,
    // Terminal on not-found; retryable on unreachable.
    needsSeed: res.status === 'unreachable',
    robtopUnreachable: res.status === 'unreachable',
  }
}

// Maps a GDDL DateAdded string to a JS Date (date-only, stored as @db.Date).
function parseDateAdded(raw: string): Date | null {
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

// Builds the set of fields to write from a GDDL submission. Returns only the
// fields that pass their respective gate so callers can check emptiness.
interface MappedFields {
  date?: Date
  enjoyment?: number
  videoUrl?: string
}

function mapGddlFields(sub: GddlSubmission): MappedFields {
  const fields: MappedFields = {}
  const date = parseDateAdded(sub.DateAdded)
  if (date) fields.date = date
  // GDDL uses 0-10; InfernoLog stores 0-100 internally. Round since our column
  // is an integer and GDDL's enjoyment isn't guaranteed to land on a whole
  // number once scaled (e.g. 7.33 -> 73.3).
  if (sub.Enjoyment != null) fields.enjoyment = Math.round(sub.Enjoyment * 10)
  if (sub.Proof?.trim()) fields.videoUrl = sub.Proof.trim()
  return fields
}

async function createCompletion(
  tx: Tx,
  userId: string,
  levelId: string,
  inGameDifficulty: string | null,
  sub: GddlSubmission
): Promise<void> {
  const lp = await findOrCreateLevelProgress(tx, userId, levelId, 'COMPLETED')
  const fields = mapGddlFields(sub)

  await tx.progressUpdate.create({
    data: {
      levelProgressId: lp.id,
      kind: 'COMPLETION',
      inGameDifficulty,
      dateUncertain: fields.date !== undefined,
      ...fields,
    },
  })

  await tx.levelProgress.update({
    where: { id: lp.id },
    data: {
      status: 'COMPLETED',
      visibility: 'PUBLIC',
      userGddlTier: roundGddlTier(sub.Rating),
    },
  })

  // A beaten level leaves Want to Beat — same transaction as the completion.
  await removeFromWantToBeat(tx, userId, levelId)
}

async function enrichCompletion(
  tx: Tx,
  progressUpdateId: string,
  sub: GddlSubmission
): Promise<boolean> {
  // Load current null-able fields from the existing completion.
  const existing = await tx.progressUpdate.findUniqueOrThrow({
    where: { id: progressUpdateId },
    select: {
      date: true,
      enjoyment: true,
      videoUrl: true,
    },
  })

  const gddl = mapGddlFields(sub)
  const updateData: Record<string, unknown> = {}

  if (!existing.date && gddl.date) {
    updateData.date = gddl.date
    updateData.dateUncertain = true
  }
  if (existing.enjoyment == null && gddl.enjoyment != null) {
    logger.info(
      `enrichCompletion: adding enjoyment ${gddl.enjoyment} for progressUpdateId ${progressUpdateId}`
    )
    updateData.enjoyment = gddl.enjoyment
  }
  if (!existing.videoUrl && gddl.videoUrl) {
    updateData.videoUrl = gddl.videoUrl
  }

  // Find the LevelProgress that owns this update so we can write userGddlTier.
  const pu = await tx.progressUpdate.findUniqueOrThrow({
    where: { id: progressUpdateId },
    select: { levelProgressId: true },
  })

  const willWrite = Object.keys(updateData).length > 0

  if (Object.keys(updateData).length > 0) {
    await tx.progressUpdate.update({
      where: { id: progressUpdateId },
      data: updateData,
    })
  }

  await tx.levelProgress.update({
    where: { id: pu.levelProgressId },
    data: { userGddlTier: roundGddlTier(sub.Rating) },
  })

  return willWrite
}

/**
 * Imports the user's GDDL submissions as InfernoLog completions.
 *
 * Each submission is matched to a cached level (resolving it from RobTop, or
 * falling back to GDDL's own metadata, on a miss), then written as a completion
 * — enriching an existing one rather than duplicating it. Every completion
 * written removes the level from Want to Beat in the same transaction.
 * Per-submission failures are collected into `errors` instead of aborting the
 * run.
 *
 * Levels RobTop couldn't supply are stubbed from GDDL's own metadata and queued
 * for the seed worker; if RobTop turns out to be down for the run, level
 * lookups stop early (see {@link ROBTOP_BREAKER_STREAK}) and the completions
 * are written regardless — they don't depend on RobTop.
 *
 * @param userId - Internal user UUID.
 * @param gddlApiKey - The user's decrypted GDDL API key.
 * @returns Counts of created/enriched/skipped submissions plus per-row errors.
 */
export async function syncGddlSubmissions(
  userId: string,
  gddlApiKey: string
): Promise<GddlSyncResult> {
  const result: GddlSyncResult = {
    created: 0,
    enriched: 0,
    skipped: 0,
    errors: [],
  }

  const userInfo = await fetchGddlUserInfo(gddlApiKey)
  const submissions = await fetchAllGddlSubmissions(gddlApiKey, userInfo.id)
  const seedIds = new Set<string>()

  // Circuit breaker state. `robtopDown` latches for the rest of the run rather
  // than probing for recovery: a cooldown is measured in minutes, and the seed
  // queue is the designed retry path for everything we skip.
  let unreachableStreak = 0
  let robtopDown = false

  for (const sub of submissions) {
    const rawId = String(sub.Level.ID)
    const levelId = GDDL_OFFICIAL_LEVEL_ID_MAP[rawId] ?? rawId
    try {
      await prisma.$transaction(async (tx) => {
        const { inGameDifficulty, needsSeed, robtopUnreachable } =
          await getOrCreateLevel(tx, levelId, sub, robtopDown)
        if (needsSeed) seedIds.add(levelId)

        if (robtopUnreachable && !robtopDown) {
          unreachableStreak++
          if (unreachableStreak >= ROBTOP_BREAKER_STREAK) {
            robtopDown = true
            logger.warn(
              { userId, streak: unreachableStreak },
              'gddlSync: RobTop unreachable repeatedly; skipping level lookups ' +
                'for the rest of this run (stubs queued for the seed worker)'
            )
          }
        } else if (!robtopUnreachable) {
          unreachableStreak = 0
        }

        const lp = await tx.levelProgress.findUnique({
          where: { userId_levelId: { userId, levelId } },
          select: { id: true, status: true },
        })

        const existingCompletion = lp
          ? await tx.progressUpdate.findFirst({
              where: { levelProgressId: lp.id, kind: 'COMPLETION' },
              select: { id: true },
            })
          : null

        if (existingCompletion) {
          const enriched = await enrichCompletion(
            tx,
            existingCompletion.id,
            sub
          )
          if (enriched) {
            result.enriched++
          } else {
            result.skipped++
          }
        } else {
          await createCompletion(tx, userId, levelId, inGameDifficulty, sub)
          result.created++
        }
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error'
      logger.warn({ levelId }, `gddlSync: skipping submission — ${reason}`)
      result.errors.push({ levelId, reason })
    }
  }

  if (seedIds.size) {
    try {
      await enqueueSeedIds([...seedIds])
    } catch (err) {
      // The enqueue is the ONLY thing that will ever fill these stubs in — the
      // level-cache sync refreshes a handful of volatile fields and never
      // backfills extended metadata — so a failure here is a data-loss event,
      // not a nuisance. Report it rather than only logging.
      logger.error(
        { userId, seedIds: [...seedIds], err },
        'gddlSync: failed to enqueue seed IDs; stubs left unenriched'
      )
      Sentry.captureException(err)
    }
  }

  if (seedIds.size >= STUB_BACKLOG_ALERT) {
    Sentry.captureMessage(
      `gddlSync left ${seedIds.size} level(s) awaiting a RobTop snapshot ` +
        `(robtopDown=${robtopDown}) — check the level-seed queue and DLQ`,
      'warning'
    )
  }

  logger.info(
    { userId, ...result, stubsQueued: seedIds.size, robtopDown },
    'gddlSync: run complete'
  )

  return result
}
