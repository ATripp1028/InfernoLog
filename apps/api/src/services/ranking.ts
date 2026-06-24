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
import { OFFICIAL_LEVELS_BY_ID } from '../data/officialLevels'
import type { PlaceRankingInput, ReorderRankingInput } from '@infernolog/core'

type Tx = Prisma.TransactionClient

// Gap below which a bisect would lose precision → renormalise to integers.
const REBALANCE_GAP = new Prisma.Decimal('0.0001')

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

  const bisect = (): Prisma.Decimal => {
    if (above && below) return above.plus(below).dividedBy(2)
    if (above) return above.minus(1) // dropped at the bottom (easiest)
    if (below) return below.plus(1) // dropped at the top (hardest)
    return new Prisma.Decimal(1) // first entry in an empty ranking
  }

  if (above && below && above.minus(below).lt(REBALANCE_GAP)) {
    await rebalance(tx, userId)
    above = aboveId ? await neighbourIndex(tx, userId, aboveId) : null
    below = belowId ? await neighbourIndex(tx, userId, belowId) : null
  }
  return bisect()
}

// ─────────────────────────────────────────────
// Reads / serialization
// ─────────────────────────────────────────────

// Level identity columns for a ranking row (LevelListSummarySchema) plus
// hasPendingUpdate, which drives the pending-data dot. Kept in sync with the
// list page's levelListSelect.
const levelSelect = {
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
  hasPendingUpdate: true,
} satisfies Prisma.LevelSelect

// The completion update's fields the ranking row needs: attempts (shown next to
// the badge) and the list references (for the badge).
const completionSelect = {
  where: { isCompletion: true },
  take: 1,
  select: {
    attempts: true,
    listReferences: { select: { listSource: true, tierOrRank: true } },
  },
} satisfies Prisma.LevelProgress$progressUpdatesArgs

type LevelRow = Prisma.LevelGetPayload<{ select: typeof levelSelect }>
type CompletionRefs = Prisma.ProgressUpdateGetPayload<{
  select: (typeof completionSelect)['select']
}>[]

// Single badge per row. AREDL gives an exact rank, so it leads for extreme
// demons (the levels AREDL actually ranks); GDDL leads otherwise since it
// covers every demon. NLW / OTHER are kept as data on the completion but never
// surface here. See RANKING_SYSTEM.md / schemas.ts.
function deriveBadge(updates: CompletionRefs, inGameDifficulty: string | null) {
  const refs = updates[0]?.listReferences ?? []
  const gddl = refs.find((r) => r.listSource === 'GDDL')
  const aredl = refs.find((r) => r.listSource === 'AREDL')
  const isExtreme = (inGameDifficulty ?? '').toLowerCase().includes('extreme')
  const order = isExtreme ? [aredl, gddl] : [gddl, aredl]
  for (const ref of order) {
    if (ref) return { listSource: ref.listSource, tierOrRank: ref.tierOrRank }
  }
  return null
}

// Attempts from the completion update (null when not logged).
function completionAttempts(updates: CompletionRefs): number | null {
  return updates[0]?.attempts ?? null
}

// Official levels (ids 1–38) aren't served by RobTop; their version + coin
// count come from our data file, matching the list page's treatment.
function mapLevel(level: Omit<LevelRow, 'hasPendingUpdate'>) {
  const official = OFFICIAL_LEVELS_BY_ID.get(level.inGameId)
  return official
    ? { ...level, gameVersion: official.gameVersion, coins: official.coins }
    : level
}

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
    const { hasPendingUpdate, ...level } = row.levelProgress.level
    return {
      rank: i + 1,
      levelProgressId: row.levelProgress.id,
      rankingIndex: row.rankingIndex.toNumber(),
      level: mapLevel(level),
      hasPendingUpdate,
      attempts: completionAttempts(row.levelProgress.progressUpdates),
      badge: deriveBadge(
        row.levelProgress.progressUpdates,
        level.inGameDifficulty
      ),
    }
  })

  const unplaced = unplacedRows.map((row) => {
    const { hasPendingUpdate, ...level } = row.level
    return {
      levelProgressId: row.id,
      level: mapLevel(level),
      hasPendingUpdate,
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
