// Rating-ranking service — the MANUAL rating mode's ordering.
//
// The deliberate twin of services/demonList: the same fractional-index
// machinery on a different axis. The demon list orders completions by how hard
// the user found them; this orders them by how good they thought they were, and
// in MANUAL mode that POSITION is the rating — computeOverallRating returns
// null, and there is no number to fall back on.
//
// Ordering: RatingRanking.ratingIndex is a fractional index — higher = better —
// so the displayed list is ratingIndex DESC (#1 = best). Inserts bisect the gap
// between the two neighbours the client drops between; when that gap closes
// past REBALANCE_GAP the whole list is renormalised to integers first.
//
// Every write here emits an activity_log event inside its own transaction —
// placement, reorder, removal, AND the renormalisation. That is a hard
// requirement, not a convenience: a ratingIndex written without a matching
// impact row is a hole in that level's history that nothing can fill in
// afterwards, because the old value is simply gone. The sweep in
// services/invariants.integration.test.ts fails if a path forgets.

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { bisectIndices, gapTooTight } from '../../utils/fractionalIndex'
import {
  readRatingSnapshot,
  recordRankingMove,
  recordRankingRebalance,
} from '../activityLog'
import {
  levelSummarySelect,
  completionSelect,
  completionAttempts,
  mapLevel,
} from '../levels/row'
import type { PlaceRatingInput, ReorderRatingInput } from '@infernolog/core'

type Tx = Prisma.TransactionClient

/** 400 — caller-fixable (e.g. ranking an in-progress entry, neighbours out of order). */
export class RatingRankingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RatingRankingError'
  }
}

/** 404 — the targeted entry doesn't exist for this user. */
export class RatingRankingNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RatingRankingNotFoundError'
  }
}

// ─────────────────────────────────────────────
// Fractional indexing
// ─────────────────────────────────────────────

// A neighbour's current index, asserting it is one of the user's ranked
// entries. Used to anchor a bisect.
async function neighbourIndex(
  tx: Tx,
  userId: string,
  levelProgressId: string
): Promise<Prisma.Decimal> {
  const row = await tx.ratingRanking.findFirst({
    where: { userId, levelProgressId },
    select: { ratingIndex: true },
  })
  if (!row) {
    throw new RatingRankingError(
      `Neighbour ${levelProgressId} is not a ranked entry`
    )
  }
  return row.ratingIndex
}

// Renormalise the user's whole rating ranking to evenly spaced integers
// (1 = worst … N = best), preserving the current order. Runs inside the
// caller's transaction so no read ever observes a half-rebalanced set.
//
// Emits an internal-only RATING_REBALANCE event carrying every entry's new
// index. Order doesn't change, so nothing user-facing happened — but every
// index logged before this point is now in a stale coordinate system, and the
// event is what keeps a later reconstruction from comparing the two.
async function rebalance(tx: Tx, userId: string): Promise<void> {
  const before = await readRatingSnapshot(tx, userId)
  const rows = await tx.ratingRanking.findMany({
    where: { userId },
    orderBy: { ratingIndex: 'asc' },
    select: { id: true },
  })
  let position = 1
  for (const row of rows) {
    await tx.ratingRanking.update({
      where: { id: row.id },
      data: { ratingIndex: new Prisma.Decimal(position) },
    })
    position++
  }
  const after = await readRatingSnapshot(tx, userId)
  await recordRankingRebalance(tx, userId, before, after, 'RATING_REBALANCE')
}

// The index for a drop between `aboveId` (better, higher index) and `belowId`
// (worse, lower index). Either may be absent: no aboveId → top of the list,
// no belowId → bottom, neither → first entry in an empty ranking.
async function computeIndex(
  tx: Tx,
  userId: string,
  aboveId: string | undefined,
  belowId: string | undefined
): Promise<Prisma.Decimal> {
  let above = aboveId ? await neighbourIndex(tx, userId, aboveId) : null
  let below = belowId ? await neighbourIndex(tx, userId, belowId) : null

  if (above && below && above.lte(below)) {
    throw new RatingRankingError('aboveId must rank better than belowId')
  }

  // The displayed "above" neighbour holds the HIGHER index (ratingIndex DESC),
  // so it maps to bisectIndices' `higher` bound.
  if (gapTooTight(below, above)) {
    await rebalance(tx, userId)
    above = aboveId ? await neighbourIndex(tx, userId, aboveId) : null
    below = belowId ? await neighbourIndex(tx, userId, belowId) : null
  }
  return bisectIndices(below, above)
}

/**
 * The MANUAL ranking: the user's ranked completions best first, plus the
 * completions still waiting to be placed.
 *
 * @param userId - Internal user UUID from the JWT.
 */
export async function getRatingRanking(userId: string) {
  const [rankedRows, unrankedRows] = await Promise.all([
    prisma.ratingRanking.findMany({
      where: { userId },
      orderBy: { ratingIndex: 'desc' },
      select: {
        ratingIndex: true,
        levelProgress: {
          select: {
            id: true,
            level: { select: levelSummarySelect },
            progressUpdates: completionSelect,
          },
        },
      },
    }),
    prisma.levelProgress.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        ratingRanking: null,
        level: { levelType: 'CLASSIC' },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        level: { select: levelSummarySelect },
        progressUpdates: completionSelect,
      },
    }),
  ])

  return {
    ranked: rankedRows.map((row, i) => ({
      rank: i + 1,
      levelProgressId: row.levelProgress.id,
      ratingIndex: row.ratingIndex.toNumber(),
      level: mapLevel(row.levelProgress.level),
      attempts: completionAttempts(row.levelProgress.progressUpdates),
    })),
    unranked: unrankedRows.map((row) => ({
      levelProgressId: row.id,
      level: mapLevel(row.level),
      attempts: completionAttempts(row.progressUpdates),
    })),
  }
}

/**
 * PLACE — an unranked completion enters the rating ranking.
 */
export async function placeRating(userId: string, input: PlaceRatingInput) {
  await prisma.$transaction(async (tx) => {
    const lp = await tx.levelProgress.findFirst({
      where: { id: input.levelProgressId, userId },
      select: {
        status: true,
        ratingRanking: { select: { id: true } },
        level: { select: { levelType: true } },
      },
    })
    if (!lp) throw new RatingRankingNotFoundError('Level progress not found')
    if (lp.ratingRanking)
      throw new RatingRankingError('This completion is already ranked')
    if (lp.status !== 'COMPLETED')
      throw new RatingRankingError('Only completions can be ranked')
    if (lp.level.levelType !== 'CLASSIC')
      throw new RatingRankingError('Only classic levels appear in the ranking')

    // computeIndex may renormalise first, which emits its own event — so the
    // "before" snapshot is taken AFTER it, in the coordinate system the
    // placement actually lands in.
    const ratingIndex = await computeIndex(
      tx,
      userId,
      input.aboveId,
      input.belowId
    )
    const before = await readRatingSnapshot(tx, userId)
    await tx.ratingRanking.create({
      data: { userId, levelProgressId: input.levelProgressId, ratingIndex },
    })
    const after = await readRatingSnapshot(tx, userId)
    await recordRankingMove(tx, {
      userId,
      eventType: 'RATING_PLACEMENT',
      moverLevelProgressId: input.levelProgressId,
      before,
      after,
    })
  })
  return getRatingRanking(userId)
}

/**
 * REORDER — move an already-ranked entry between new neighbours.
 */
export async function reorderRating(
  userId: string,
  levelProgressId: string,
  input: ReorderRatingInput
) {
  if (input.aboveId === levelProgressId || input.belowId === levelProgressId) {
    throw new RatingRankingError('An entry cannot be its own neighbour')
  }
  await prisma.$transaction(async (tx) => {
    const existing = await tx.ratingRanking.findFirst({
      where: { userId, levelProgressId },
      select: { id: true },
    })
    if (!existing)
      throw new RatingRankingNotFoundError('Ranking entry not found')

    const ratingIndex = await computeIndex(
      tx,
      userId,
      input.aboveId,
      input.belowId
    )
    const before = await readRatingSnapshot(tx, userId)
    await tx.ratingRanking.update({
      where: { id: existing.id },
      data: { ratingIndex },
    })
    const after = await readRatingSnapshot(tx, userId)
    await recordRankingMove(tx, {
      userId,
      eventType: 'RATING_REORDER',
      moverLevelProgressId: levelProgressId,
      before,
      after,
    })
  })
  return getRatingRanking(userId)
}

/**
 * REMOVE — take an entry out of the ranking. The completion itself is untouched;
 * it returns to the unranked pile.
 */
export async function removeRating(userId: string, levelProgressId: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.ratingRanking.findFirst({
      where: { userId, levelProgressId },
      select: { id: true },
    })
    if (!existing)
      throw new RatingRankingNotFoundError('Ranking entry not found')

    const before = await readRatingSnapshot(tx, userId)
    await tx.ratingRanking.delete({ where: { id: existing.id } })
    const after = await readRatingSnapshot(tx, userId)
    await recordRankingMove(tx, {
      userId,
      eventType: 'RATING_REMOVED',
      moverLevelProgressId: levelProgressId,
      before,
      after,
    })
  })
  return getRatingRanking(userId)
}
