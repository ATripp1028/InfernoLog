// Classic-ranking service — the personal difficulty-ordering page.
//
// Reads (getClassicDemonList) and the three placement writes (place / reorder /
// unplace) live here; routes/demonList.ts stays a thin HTTP shell, mirroring the
// routes/progress/logging.ts ↔ services/progress.ts split.
//
// Ordering: ClassicDemonList.listIndex is a fractional index — lower = easier,
// higher = harder — so the displayed list is listIndex DESC (#1 = hardest).
// Inserts bisect the gap between the two neighbours the client drops between;
// when that gap closes past REBALANCE_GAP the whole list is renormalised to
// integers first. See RANKING_SYSTEM.md.
//
// Every write here emits an activity_log event (services/activityLog) inside
// its own transaction — placement, reorder, unranking, AND the renormalisation,
// which is why `rebalance` takes a userId it otherwise wouldn't need. That is a
// hard requirement, not a convenience: a listIndex written without a
// matching impact row is a hole in that level's history that nothing can fill
// in afterwards. See docs/EVENT_LOG.md.

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { bisectIndices, gapTooTight } from '../../utils/fractionalIndex'
import {
  readRankingSnapshot,
  recordRankingMove,
  recordRankingRebalance,
} from '../activityLog'
import {
  levelSummarySelect,
  completionSelect,
  deriveBadge,
  completionAttempts,
  mapLevel,
} from '../levels/row'
import type { PlaceOnDemonListInput, ReorderDemonListInput } from '@infernolog/core'

type Tx = Prisma.TransactionClient

/**
 * 400 — caller-fixable (e.g. placing an in-progress entry, neighbours out of
 * order).
 */
export class RankingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RankingError'
  }
}

/**
 * 404 — the targeted entry doesn't exist for this user.
 */
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
  const row = await tx.classicDemonList.findFirst({
    where: { userId, levelProgressId },
    select: { listIndex: true },
  })
  if (!row) {
    throw new RankingError(
      `Neighbour ${levelProgressId} is not a placed demon list entry`
    )
  }
  return row.listIndex
}

// Renormalise the user's whole classic demon list to evenly spaced integers
// (1 = easiest … N = hardest), preserving the current order. Runs inside the
// caller's transaction so no read ever observes a half-rebalanced set.
//
// Emits an internal-only DEMON_LIST_REBALANCE event carrying every entry's new
// index. Order doesn't change, so nothing user-facing happened — but every
// index logged before this point is now in a stale coordinate system, and the
// event is what keeps a later reconstruction from comparing the two.
async function rebalance(tx: Tx, userId: string): Promise<void> {
  const before = await readRankingSnapshot(tx, userId)
  const rows = await tx.classicDemonList.findMany({
    where: { userId },
    orderBy: { listIndex: 'asc' },
    select: { id: true },
  })
  // Sequential updates — a rare path over a small N. Position (1-based,
  // ascending) becomes the new index, resetting every gap to a full integer.
  let position = 1
  for (const row of rows) {
    await tx.classicDemonList.update({
      where: { id: row.id },
      data: { listIndex: new Prisma.Decimal(position) },
    })
    position++
  }
  const after = await readRankingSnapshot(tx, userId)
  await recordRankingRebalance(tx, userId, before, after)
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
  // (listIndex DESC), so it maps to bisectIndices' `higher` bound.
  if (gapTooTight(below, above)) {
    await rebalance(tx, userId)
    above = aboveId ? await neighbourIndex(tx, userId, aboveId) : null
    below = belowId ? await neighbourIndex(tx, userId, belowId) : null
  }
  return bisectIndices(below, above)
}

/**
 * The classic-ranking page: the user's placed completions in difficulty order,
 * plus the completions still waiting to be placed.
 *
 * Placed rows come back listIndex DESC, so index 0 is #1 — the hardest.
 *
 * Row serialization (levelSummarySelect / completionSelect / deriveBadge /
 * completionAttempts / mapLevel) is shared with collections — see levels/row.ts.
 *
 * @param userId - Internal user UUID from the JWT.
 */
export async function getClassicDemonList(userId: string) {
  const [placedRows, unplacedRows] = await Promise.all([
    prisma.classicDemonList.findMany({
      where: { userId },
      orderBy: { listIndex: 'desc' },
      select: {
        listIndex: true,
        levelProgress: {
          select: {
            id: true,
            userGddlTier: true,
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
        classicDemonList: { is: null },
        // Classic only — the platformer ranking is a separate list. Demon-ness
        // is deliberately NOT filtered: a non-demon completion is rankable like
        // any other (see "Scope Stance" in LOGGING_FLOW.md).
        level: { levelType: 'CLASSIC' },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userGddlTier: true,
        level: { select: levelSummarySelect },
        progressUpdates: completionSelect,
      },
    }),
  ])

  const placed = placedRows.map((row, i) => {
    const level = row.levelProgress.level
    return {
      rank: i + 1,
      levelProgressId: row.levelProgress.id,
      listIndex: row.listIndex.toNumber(),
      level: mapLevel(level),
      attempts: completionAttempts(row.levelProgress.progressUpdates),
      badge: deriveBadge(row.levelProgress.userGddlTier),
    }
  })

  const unplaced = unplacedRows.map((row) => {
    const level = row.level
    return {
      levelProgressId: row.id,
      level: mapLevel(level),
      attempts: completionAttempts(row.progressUpdates),
      badge: deriveBadge(row.userGddlTier),
    }
  })

  return { placed, unplaced }
}

// ─────────────────────────────────────────────
// Writes — each returns the freshly serialized ranking so the client needn't
// follow up with a GET (the standard "return the whole record" response).
// ─────────────────────────────────────────────

/**
 * PLACE — an unplaced completion enters the demon list. Validates the entry is one
 * of the caller's COMPLETED classic levels and not already placed. Non-demons
 * are accepted: the demon list is the user's own difficulty order, and nothing
 * about it depends on the level carrying GD's demon flag.
 */
export async function placeCompletion(
  userId: string,
  input: PlaceOnDemonListInput
) {
  await prisma.$transaction(async (tx) => {
    const lp = await tx.levelProgress.findFirst({
      where: { id: input.levelProgressId, userId },
      select: {
        status: true,
        classicDemonList: { select: { id: true } },
        level: { select: { levelType: true } },
      },
    })
    if (!lp) throw new RankingNotFoundError('Level progress not found')
    if (lp.classicDemonList)
      throw new RankingError('This completion is already placed')
    if (lp.status !== 'COMPLETED')
      throw new RankingError('Only completions can be placed in the demon list')
    if (lp.level.levelType !== 'CLASSIC')
      throw new RankingError(
        'Only classic levels appear in the classic demon list'
      )

    // computeIndex may renormalise first, which emits its own event — so the
    // "before" snapshot is taken AFTER it, in the coordinate system the
    // placement actually lands in.
    const listIndex = await computeIndex(
      tx,
      userId,
      input.aboveId,
      input.belowId
    )
    const before = await readRankingSnapshot(tx, userId)
    await tx.classicDemonList.create({
      data: { userId, levelProgressId: input.levelProgressId, listIndex },
    })
    const after = await readRankingSnapshot(tx, userId)
    await recordRankingMove(tx, {
      userId,
      eventType: 'DEMON_LIST_PLACEMENT',
      moverLevelProgressId: input.levelProgressId,
      before,
      after,
    })
  })
  return getClassicDemonList(userId)
}

/**
 * REORDER — move an already-placed entry between new neighbours.
 */
export async function reorderEntry(
  userId: string,
  levelProgressId: string,
  input: ReorderDemonListInput
) {
  if (input.aboveId === levelProgressId || input.belowId === levelProgressId) {
    throw new RankingError('An entry cannot be its own neighbour')
  }
  await prisma.$transaction(async (tx) => {
    const existing = await tx.classicDemonList.findFirst({
      where: { userId, levelProgressId },
      select: { id: true },
    })
    if (!existing) throw new RankingNotFoundError('Ranking entry not found')

    // As in placeCompletion: snapshot after any renormalisation, so before/after
    // describe the move alone.
    const listIndex = await computeIndex(
      tx,
      userId,
      input.aboveId,
      input.belowId
    )
    const before = await readRankingSnapshot(tx, userId)
    await tx.classicDemonList.update({
      where: { id: existing.id },
      data: { listIndex },
    })
    const after = await readRankingSnapshot(tx, userId)
    await recordRankingMove(tx, {
      userId,
      eventType: 'DEMON_LIST_REORDER',
      moverLevelProgressId: levelProgressId,
      before,
      after,
    })
  })
  return getClassicDemonList(userId)
}

/**
 * UNPLACE — remove an entry from the demon list; it returns to the Unplaced panel.
 * The completion itself is untouched (only the ClassicDemonList row is deleted).
 *
 * Transactional purely so the DEMON_LIST_REMOVED event commits with the delete.
 * Unranking runs the same neighbour-impact logic a placement does: the levels
 * below close the gap and one of them may cross a milestone on the way up.
 */
export async function unplaceEntry(userId: string, levelProgressId: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.classicDemonList.findFirst({
      where: { userId, levelProgressId },
      select: { id: true },
    })
    if (!existing) throw new RankingNotFoundError('Ranking entry not found')

    const before = await readRankingSnapshot(tx, userId)
    await tx.classicDemonList.delete({ where: { id: existing.id } })
    const after = await readRankingSnapshot(tx, userId)
    await recordRankingMove(tx, {
      userId,
      eventType: 'DEMON_LIST_REMOVED',
      moverLevelProgressId: levelProgressId,
      before,
      after,
    })
  })
  return getClassicDemonList(userId)
}
