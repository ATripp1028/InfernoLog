// Level search results can include rows that are greyed out (already logged,
// already added, already beaten). When trimming to a display cap, greyed-out
// rows shouldn't crowd out ones the user can actually act on.
export const LEVEL_SEARCH_RESULTS_CAP = 8

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
