// Fractional-index math shared by the classic ranking and collections.
//
// An ordering is stored as Decimal(20,10) indices; inserting between two rows
// bisects their gap instead of renumbering. When a gap closes past
// REBALANCE_GAP the caller renormalises the whole ordering to integers first
// (each owner keeps its own renormalisation query — only the math lives here).

import { Prisma } from '@prisma/client'

/**
 * Gap below which a bisect would lose precision → renormalise to integers.
 */
export const REBALANCE_GAP = new Prisma.Decimal('0.0001')

/**
 * The index for a drop between two neighbours, expressed index-agnostically:
 * `lower` is the neighbour with the smaller index, `higher` the larger. Either
 * may be null: no lower → step below the higher bound, no higher → step above
 * the lower bound, neither → first entry of an empty ordering.
 */
export function bisectIndices(
  lower: Prisma.Decimal | null,
  higher: Prisma.Decimal | null
): Prisma.Decimal {
  if (lower && higher) return lower.plus(higher).dividedBy(2)
  if (lower) return lower.plus(1)
  if (higher) return higher.minus(1)
  return new Prisma.Decimal(1)
}

/**
 * True when the neighbour gap is too tight to bisect safely.
 */
export function gapTooTight(
  lower: Prisma.Decimal | null,
  higher: Prisma.Decimal | null
): boolean {
  return !!lower && !!higher && higher.minus(lower).lt(REBALANCE_GAP)
}
