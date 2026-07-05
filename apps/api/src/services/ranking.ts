// Classic-ranking service — the personal difficulty-ordering page.
//
// Reads (getClassicRanking) and the three placement writes (place / reorder /
// unplace) live here; routes/ranking.ts stays a thin HTTP shell, mirroring the
// logging.ts ↔ services/progress.ts split.
//
// Ordering: ClassicRanking.rankingIndex is a fractional index — lower = easier,
// higher = harder — so the displayed list is rankingIndex DESC (#1 = hardest).
// Inserts bisect the gap between the two neighbours the client drops between;
// when that gap closes past REBALANCE_GAP the whole list is renormalised to
// integers first. See RANKING_SYSTEM.md.

import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { bisectIndices, gapTooTight } from '../utils/fractionalIndex'
import {
  levelSelect,
  completionSelect,
  deriveBadge,
  completionAttempts,
  mapLevel,
} from './levelRow'
import type { PlaceRankingInput, ReorderRankingInput } from '@infernolog/core'

type Tx = Prisma.TransactionClient

// 400 — caller-fixable (e.g. placing a non-demon, neighbours out of order).
export class RankingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RankingError'
  }
}

// 404 — the targeted entry doesn't exist for this user.
export class RankingNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RankingNotFoundError'
  }
}

// ─────────────────────────────────────────────
// Fractional indexing
// ─────────────────────────────────────────────

// A neighbour's current index, asserting it is one of the user's placed
// entries. Used to anchor a bisect.
async function neighbourIndex(
  tx: Tx,
  userId: string,
  levelProgressId: string
): Promise<Prisma.Decimal> {
  const row = await tx.classicRanking.findFirst({
    where: { userId, levelProgressId },
    select: { rankingIndex: true },
  })
  if (!row) {
    throw new RankingError(
      `Neighbour ${levelProgressId} is not a placed ranking entry`
    )
  }
  return row.rankingIndex
}

// Renormalise the user's whole classic ranking to evenly spaced integers
// (1 = easiest … N = hardest), preserving the current order. Runs inside the
// caller's transaction so no read ever observes a half-rebalanced set.
async function rebalance(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.classicRanking.findMany({
    where: { userId },
    orderBy: { rankingIndex: 'asc' },
    select: { id: true },
  })
  // Sequential updates — a rare path over a small N. Position (1-based,
  // ascending) becomes the new index, resetting every gap to a full integer.
  let position = 1
  for (const row of rows) {
    await tx.classicRanking.update({
      where: { id: row.id },
      data: { rankingIndex: new Prisma.Decimal(position) },
    })
    position++
  }
}

// The index for a drop between `aboveId` (harder, higher index) and `belowId`
// (easier, lower index). Either may be absent: no aboveId → top of the list,
// no belowId → bottom, neither → first entry in an empty ranking. Rebalances
// and recomputes when the neighbour gap is too tight to bisect.
async function computeIndex(
  tx: Tx,
  userId: string,
  aboveId: string | undefined,
  belowId: string | undefined
): Promise<Prisma.Decimal> {
  let above = aboveId ? await neighbourIndex(tx, userId, aboveId) : null
  let below = belowId ? await neighbourIndex(tx, userId, belowId) : null

  if (above && below && above.lte(below)) {
    throw new RankingError('aboveId must rank harder than belowId')
  }

  // In ranking terms the displayed "above" neighbour holds the HIGHER index
  // (rankingIndex DESC), so it maps to bisectIndices' `higher` bound.
  if (gapTooTight(below, above)) {
    await rebalance(tx, userId)
    above = aboveId ? await neighbourIndex(tx, userId, aboveId) : null
    below = belowId ? await neighbourIndex(tx, userId, belowId) : null
  }
  return bisectIndices(below, above)
}

// ─────────────────────────────────────────────
// Reads / serialization
// ─────────────────────────────────────────────

// Row serialization (levelSelect / completionSelect / deriveBadge /
// completionAttempts / mapLevel) is shared with collections — see levelRow.ts.

export async function getClassicRanking(userId: string) {
  const [placedRows, unplacedRows] = await Promise.all([
    prisma.classicRanking.findMany({
      where: { userId },
      orderBy: { rankingIndex: 'desc' },
      select: {
        rankingIndex: true,
        levelProgress: {
          select: {
            id: true,
            level: { select: levelSelect },
            progressUpdates: completionSelect,
          },
        },
      },
    }),
    prisma.levelProgress.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        classicRanking: { is: null },
        level: { levelType: 'CLASSIC', isDemon: true },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        level: { select: levelSelect },
        progressUpdates: completionSelect,
      },
    }),
  ])

  const placed = placedRows.map((row, i) => {
    const level = row.levelProgress.level
    return {
      rank: i + 1,
      levelProgressId: row.levelProgress.id,
      rankingIndex: row.rankingIndex.toNumber(),
      level: mapLevel(level),
      attempts: completionAttempts(row.levelProgress.progressUpdates),
      badge: deriveBadge(
        row.levelProgress.progressUpdates,
        level.inGameDifficulty
      ),
    }
  })

  const unplaced = unplacedRows.map((row) => {
    const level = row.level
    return {
      levelProgressId: row.id,
      level: mapLevel(level),
      attempts: completionAttempts(row.progressUpdates),
      badge: deriveBadge(row.progressUpdates, level.inGameDifficulty),
    }
  })

  return { placed, unplaced }
}

// ─────────────────────────────────────────────
// Writes — each returns the freshly serialized ranking so the client needn't
// follow up with a GET (the standard "return the whole record" response).
// ─────────────────────────────────────────────

// PLACE — an unplaced completion enters the ranking. Validates the entry is the
// caller's COMPLETED classic demon and not already placed.
export async function placeCompletion(
  userId: string,
  input: PlaceRankingInput
) {
  await prisma.$transaction(async (tx) => {
    const lp = await tx.levelProgress.findFirst({
      where: { id: input.levelProgressId, userId },
      select: {
        status: true,
        classicRanking: { select: { id: true } },
        level: { select: { levelType: true, isDemon: true } },
      },
    })
    if (!lp) throw new RankingNotFoundError('Level progress not found')
    if (lp.classicRanking)
      throw new RankingError('This completion is already placed')
    if (lp.status !== 'COMPLETED')
      throw new RankingError('Only completions can be placed in the ranking')
    if (lp.level.levelType !== 'CLASSIC')
      throw new RankingError(
        'Only classic levels appear in the classic ranking'
      )
    if (!lp.level.isDemon)
      throw new RankingError(
        'Non-demon levels are excluded from the difficulty ranking'
      )

    const rankingIndex = await computeIndex(
      tx,
      userId,
      input.aboveId,
      input.belowId
    )
    await tx.classicRanking.create({
      data: { userId, levelProgressId: input.levelProgressId, rankingIndex },
    })
  })
  return getClassicRanking(userId)
}

// REORDER — move an already-placed entry between new neighbours.
export async function reorderEntry(
  userId: string,
  levelProgressId: string,
  input: ReorderRankingInput
) {
  if (input.aboveId === levelProgressId || input.belowId === levelProgressId) {
    throw new RankingError('An entry cannot be its own neighbour')
  }
  await prisma.$transaction(async (tx) => {
    const existing = await tx.classicRanking.findFirst({
      where: { userId, levelProgressId },
      select: { id: true },
    })
    if (!existing) throw new RankingNotFoundError('Ranking entry not found')

    const rankingIndex = await computeIndex(
      tx,
      userId,
      input.aboveId,
      input.belowId
    )
    await tx.classicRanking.update({
      where: { id: existing.id },
      data: { rankingIndex },
    })
  })
  return getClassicRanking(userId)
}

// UNPLACE — remove an entry from the ranking; it returns to the Unplaced panel.
// The completion itself is untouched (only the ClassicRanking row is deleted).
export async function unplaceEntry(userId: string, levelProgressId: string) {
  const existing = await prisma.classicRanking.findFirst({
    where: { userId, levelProgressId },
    select: { id: true },
  })
  if (!existing) throw new RankingNotFoundError('Ranking entry not found')
  await prisma.classicRanking.delete({ where: { id: existing.id } })
  return getClassicRanking(userId)
}
