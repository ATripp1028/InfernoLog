// The 2.1-vs-2.2 percentage-basis rule. Lives in lib/ rather than beside a
// logging step because modules in two features need it — the completion and
// progress steps, their logic hooks, and the level page's edit-run modal.

/** The date GD 2.2 shipped. Anything logged before it is on 2.1 percentages. */
export const GD_22_RELEASE_DATE = '2023-12-19'

/**
 * Whether a logged date predates GD 2.2.
 *
 * A pre-2.2 date pins the percentage basis to 2.1 — the version picker is
 * hidden and the draft is forced — because 2.2's time-based percentages did
 * not exist yet. Callers pass whatever the form holds, so a null/empty date
 * answers `false` (nothing to pin yet) rather than throwing.
 *
 * @param dateStr - `yyyy-MM-dd`, or any ISO string whose first ten characters
 * are the calendar date.
 */
export function isPreTwoTwo(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return dateStr.slice(0, 10) < GD_22_RELEASE_DATE
}
