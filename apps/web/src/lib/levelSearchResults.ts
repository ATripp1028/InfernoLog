/**
 * Level search results can include rows that are greyed out (already logged,
 * already added, already beaten). When trimming to a display cap, greyed-out
 * rows shouldn't crowd out ones the user can actually act on.
 */
export const LEVEL_SEARCH_RESULTS_CAP = 8

/**
 * Floats actionable results above greyed-out ones, then trims to `cap`.
 *
 * Stable within each group, so the server's relevance order survives among
 * rows of the same kind.
 *
 * @param isGreyedOut - Called once per result; "greyed out" means already
 * logged, already added, or already beaten — anything the user cannot act on.
 */
export function sortAndCapSearchResults<T>(
  results: T[],
  isGreyedOut: (result: T) => boolean,
  cap: number = LEVEL_SEARCH_RESULTS_CAP
): T[] {
  const valid: T[] = []
  const greyedOut: T[] = []
  for (const result of results) {
    ;(isGreyedOut(result) ? greyedOut : valid).push(result)
  }
  return [...valid, ...greyedOut].slice(0, cap)
}
