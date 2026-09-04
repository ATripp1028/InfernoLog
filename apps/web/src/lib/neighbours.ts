// Shared by both hand-arranged orderings — the demon list (hardest first) and
// the MANUAL rating ranking (best first). The math is the same either way; only
// what "above" means differs, and that is the caller's business.

/**
 * The two neighbour ids the place/reorder endpoints expect:
 *   aboveId — the row shown directly above (harder, higher index)
 *   belowId — the row shown directly below (easier, lower index)
 */
export interface Neighbours {
  aboveId?: string
  belowId?: string
}

/**
 * Translate a position in the displayed (best/hardest first) ordered list into the
 * neighbour ids for an API write. `ids` is the FINAL ordering — already
 * including the moved/placed item at `index`. Omitting a neighbour signals the
 * top (no aboveId) or bottom (no belowId) of the list, matching the server.
 */
export function neighboursAround(ids: string[], index: number): Neighbours {
  const above = ids[index - 1]
  const below = ids[index + 1]
  return {
    ...(above ? { aboveId: above } : {}),
    ...(below ? { belowId: below } : {}),
  }
}
