// Prisma returns Decimal columns as Decimal instances; every wire shape uses
// plain numbers. This is the single conversion used at each serialization
// boundary.
//
// The `number` branch is real, not defensive: the integration tests hand back
// plain numbers for the same fields, and some code paths compute a value rather
// than reading it from Prisma.

export type DecimalLike = { toNumber(): number }

export const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()
