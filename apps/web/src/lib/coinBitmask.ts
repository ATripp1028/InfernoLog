// A level's collected user coins are stored as a bitmask: bit `i` means
// "collected coin i + 1". Three surfaces read or write it — the coin picker,
// the spreadsheet importer, and the exporter — so the arithmetic lives here
// rather than being re-derived (and re-off-by-one'd) in each.

/**
 * Whether coin `index` (0-based) is collected in `mask`.
 *
 * A null mask means the row never said, which is not the same as "collected
 * none" — callers that distinguish the two should check for null first.
 */
export function coinIsCollected(
  mask: number | null | undefined,
  index: number
): boolean {
  if (mask == null) return false
  return (mask & (1 << index)) !== 0
}

/**
 * `mask` with coin `index` (0-based) flipped.
 */
export function toggleCoin(mask: number, index: number): number {
  return mask ^ (1 << index)
}

/**
 * Folds per-coin flags (coin 1 first) into a mask.
 *
 * Returns `null` when every flag is null — a spreadsheet row that mentions no
 * coin column at all is saying nothing about coins, whereas one that says
 * `false` everywhere is asserting none were collected.
 */
export function coinMaskFromFlags(
  flags: readonly (boolean | null | undefined)[]
): number | null {
  if (flags.every((f) => f == null)) return null
  return flags.reduce<number>(
    (mask, flag, i) => (flag ? mask | (1 << i) : mask),
    0
  )
}
