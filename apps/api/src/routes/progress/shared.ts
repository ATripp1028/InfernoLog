// Helpers shared across the progress route files.

// Prisma returns Decimal columns as Decimal instances; the wire shape uses
// plain numbers. Integration tests can hand back plain numbers too, so both
// branches are real.
export type DecimalLike = { toNumber(): number }

export const toNum = (v: DecimalLike | number | null): number | null =>
  v === null ? null : typeof v === 'number' ? v : v.toNumber()
