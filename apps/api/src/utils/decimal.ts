// Prisma returns Decimal columns as Decimal instances; every wire shape uses
// plain numbers. This is the single conversion used at each serialization
// boundary.

/** Anything Decimal-shaped — structurally what Prisma's `Decimal` provides. */
export type DecimalLike = { toNumber(): number }

/**
 * Converts a Prisma `Decimal` to a plain number for the wire shape, preserving
 * null.
 *
 * The `number` branch is real, not defensive: the integration tests hand back
 * plain numbers for these fields, and some paths compute a value rather than
 * reading it from Prisma.
 */
export const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()
