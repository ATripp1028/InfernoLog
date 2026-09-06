// The completion/progress ordering rule, in one place.
//
// A completion is the end of a level's history: it records the run that beat
// the level, so nothing logged after it can be progress toward beating it.
// What a completed level CAN hold is everything logged on the way there — the
// grind that led to it — which is why the rule is stated as an ordering rather
// than as "a beaten level has no progress rows".
//
// Every write path that can put a progress entry on a completed level enforces
// it: `applyProgress` and `applyEdit` (services/progress) for the logging flow,
// and `planProgress` (services/importExport/import) for the spreadsheet import.
// They differ only in where the dates come from, so the comparison itself lives
// here rather than being restated — and drifting — at three call sites.

/**
 * Whether a progress entry would land after the level's completion.
 *
 * Both arguments are yyyy-MM-dd calendar days, the granularity the app tracks:
 * the day the user says something happened, recovered through its own timezone
 * where one was entered (`zonedDateString` / the import's `isoDate`). Never
 * compare the raw instants instead — two entries on the same day can be hours
 * apart in UTC without either being "after" the other in the sense that
 * matters here.
 *
 * Two cases deliberately return false rather than refusing:
 *
 * - **Either side undated.** There is no ordering to violate, and refusing what
 *   cannot be placed would reject real history over a blank date field.
 * - **The same day.** Grinding a level and beating it in one sitting is the
 *   ordinary case, not a violation.
 *
 * @param completionDay - The level's completion date, or null when it has no
 * completion (or one with no date).
 * @param entryDay - The progress entry's date, or null when it carries none.
 * @returns True only when both days are known and the entry falls strictly
 * after the completion — the one case every caller refuses.
 */
export function isDatedAfterCompletion(
  completionDay: string | null | undefined,
  entryDay: string | null | undefined
): boolean {
  if (!completionDay || !entryDay) return false
  return entryDay > completionDay
}
