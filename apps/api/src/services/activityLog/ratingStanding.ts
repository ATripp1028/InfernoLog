// The two derived RATING rows a LOG_EDIT carries: `weighted_average` and
// `rating_rank`.
//
// Neither is stored anywhere. The overall rating is computed at query time from
// the user's config plus the entry's scores, and the rating rank is not
// computed anywhere else at all — which is precisely why both have to be
// written at save time. The average could in principle be recomputed later from
// the field changes plus the config in force then; the rank could not, because
// it depends on every OTHER level's average at that instant and nothing records
// those.
//
// They are tagged `RATING` rather than a new `DERIVED` category on purpose:
// LevelProgress is expected to gain stored columns for both, at which point
// they stop being derived and become ordinary field changes — and `RATING` is
// what they would have been all along.
//
// A ranked position is only comparable inside one rating-config era. A weight
// change reshuffles every level's average and is deliberately not logged (see
// ratingConfig.ts), so every rank logged before a reweight was measured on a
// scale that no longer applies.

import { ActivityFieldCategory, Prisma } from '@prisma/client'
import {
  computeOverallRating,
  rankByRatingOrder,
  type OverallRatingConfig,
  type RatingOrderCategory,
  type RatingOrderItem,
} from '@infernolog/core'
import { toNum } from '../../utils/decimal'
import type { FieldChange } from './fieldScope'
import { serializeFieldValue } from './fieldScope'

type Tx = Prisma.TransactionClient

/** One level's derived rating figures at a single point in time. */
export interface RatingStanding {
  /** The level's overall rating, or null when the user has not rated it. */
  overallRating: number | null
  /**
   * 1-based position in the user's rating order (#1 = highest rated), or null
   * when the level is unrated — an unrated level holds no position at all.
   */
  rank: number | null
}

/**
 * Every level's overall rating and rank for one user, keyed by GD level id.
 *
 * Levels the user has not rated are present with a null `overallRating` and a
 * null `rank`; they take part in no comparison.
 */
export type RatingStandings = Map<string, RatingStanding>

// Everything the rating order is computed from. `progressUpdates` selects the
// representative update, matching what GET /v1/me/progress and the level page's
// StatGrid already use: the completion if there is one, else the most recently
// logged update. Enjoyment is logged per event, so on a completed level only
// the completion's enjoyment feeds the average — and the same update supplies
// the date the order breaks ties on.
const ratingOrderSelect = {
  levelId: true,
  simpleRating: true,
  ratingScores: { select: { categoryId: true, score: true } },
  progressUpdates: {
    orderBy: [{ kind: 'desc' }, { loggedAt: 'desc' }] as const,
    take: 1,
    select: { enjoyment: true, date: true },
  },
} satisfies Prisma.LevelProgressSelect

/**
 * Reads every level's overall rating for one user and ranks them.
 *
 * Callers take one reading immediately before their write and one immediately
 * after, both inside the same transaction, and hand the pair to
 * {@link buildRatingStandingChanges} — the same before/after snapshot shape the
 * demon list events use. Diffing two real readings is what keeps the rank honest
 * when a save moves a level past its neighbours.
 *
 * @param tx - The caller's transaction client; this must not open its own.
 * @returns Standings for every level the user has an entry for, including
 * unrated ones (null rating, null rank).
 */
export async function readRatingStandings(
  tx: Tx,
  userId: string
): Promise<RatingStandings> {
  const [user, rows] = await Promise.all([
    tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        ratingMode: true,
        includeEnjoyment: true,
        enjoymentWeight: true,
        ratingCategories: {
          select: { id: true, weight: true, sortOrder: true },
        },
      },
    }),
    tx.levelProgress.findMany({
      where: { userId },
      select: ratingOrderSelect,
    }),
  ])

  const config: OverallRatingConfig = {
    ratingMode: user.ratingMode,
    includeEnjoyment: user.includeEnjoyment,
    enjoymentWeight: toNum(user.enjoymentWeight) ?? 0,
    categoryWeights: new Map(
      user.ratingCategories.map((cat) => [cat.id, toNum(cat.weight) ?? 0])
    ),
  }

  const order: RatingOrderItem[] = rows.map((row) => {
    const update = row.progressUpdates[0] ?? null
    return {
      levelId: row.levelId,
      overallRating: computeOverallRating(config, {
        simpleRating: row.simpleRating,
        enjoyment: update?.enjoyment ?? null,
        ratingScores: row.ratingScores,
      }),
      enjoyment: update?.enjoyment ?? null,
      dateMs: update?.date?.getTime() ?? null,
      ratingScores: row.ratingScores,
    }
  })

  // Per-category scores only break ties in WEIGHTED mode. In SIMPLE mode the
  // rows can still be there — switching modes preserves them — but they carry
  // no meaning, so they must not influence the order.
  const tiebreakCategories: RatingOrderCategory[] =
    user.ratingMode === 'WEIGHTED' ? user.ratingCategories : []

  // MANUAL mode has no numbers to rank by — computeOverallRating returns null
  // for every level — so the standing comes from the order the user arranged by
  // hand. Without this branch every rank would be null and `rating_rank` would
  // silently stop recording anything for these users.
  if (user.ratingMode === 'MANUAL') {
    return readManualStandings(tx, userId, order)
  }

  const standings: RatingStandings = new Map()
  for (const { item, rank } of rankByRatingOrder(order, tiebreakCategories)) {
    standings.set(item.levelId, { overallRating: item.overallRating, rank })
  }
  return standings
}

/**
 * Standings for a MANUAL-mode user: position from `rating_ranking`, rating
 * always null.
 *
 * A level the user has not placed yet holds no position, exactly as an unrated
 * level does in the other modes — so the two shapes stay interchangeable to
 * every caller.
 */
async function readManualStandings(
  tx: Tx,
  userId: string,
  order: RatingOrderItem[]
): Promise<RatingStandings> {
  const ranked = await tx.ratingRanking.findMany({
    where: { userId },
    orderBy: { ratingIndex: 'desc' },
    select: { levelProgress: { select: { levelId: true } } },
  })

  const standings: RatingStandings = new Map()
  // Every level the user has an entry for, so unplaced ones are present with a
  // null rank rather than missing.
  for (const item of order) {
    standings.set(item.levelId, { overallRating: null, rank: null })
  }
  ranked.forEach((row, index) => {
    standings.set(row.levelProgress.levelId, {
      overallRating: null,
      rank: index + 1,
    })
  })
  return standings
}

/**
 * Diffs one level's derived rating figures into `weighted_average` and
 * `rating_rank` field-change rows.
 *
 * @param levelId - The level the LOG_EDIT is about.
 * @param before - Standings read immediately before the save's writes.
 * @param after - Standings read immediately after them.
 * @returns Up to two rows, and only for the figures that actually moved — an
 * edit that left the rating order alone contributes nothing. The two are
 * diffed independently: an enjoyment change under `includeEnjoyment: false`
 * shifts the tiebreak without touching the average, and can therefore produce a
 * rank row on its own.
 */
export function buildRatingStandingChanges(
  levelId: string,
  before: RatingStandings,
  after: RatingStandings
): FieldChange[] {
  const from = before.get(levelId)
  const to = after.get(levelId)
  const pairs: Array<[string, unknown, unknown]> = [
    [
      'weighted_average',
      from?.overallRating ?? null,
      to?.overallRating ?? null,
    ],
    ['rating_rank', from?.rank ?? null, to?.rank ?? null],
  ]

  const changes: FieldChange[] = []
  for (const [fieldName, oldRaw, newRaw] of pairs) {
    const oldValue = serializeFieldValue(oldRaw)
    const newValue = serializeFieldValue(newRaw)
    if (oldValue === newValue) continue
    changes.push({
      fieldName,
      category: ActivityFieldCategory.RATING,
      oldValue,
      newValue,
    })
  }
  return changes
}
