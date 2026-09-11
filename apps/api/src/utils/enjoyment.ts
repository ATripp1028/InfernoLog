// The one storage rule every community enjoyment figure follows, whichever list
// it came from.
//
// EDEL tracks its scores to many decimal places (59.39285714) and displays them
// on 0-100 to at most two. Both sources are stored exactly that way — EDEL's
// natively, GDDL's after rescaling from its own 0-10 — so the single `enjoyment`
// column holds one kind of number regardless of origin, and nothing about a
// value's precision gives away which list it came from.

/**
 * Rounds an enjoyment figure already on the 0-100 scale to two decimal places,
 * clamped to that range.
 *
 * Clamped because the scale is each upstream's promise rather than ours; a
 * stat card reading "137" would be worse than a slightly wrong one. The column
 * is Decimal(5,2) and would round on insert anyway — this does it first so the
 * value a client returns is the value that gets stored.
 *
 * @param value - An enjoyment figure on 0-100.
 */
export function roundEnjoyment(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100))
}
