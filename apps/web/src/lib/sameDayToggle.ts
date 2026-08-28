// The worst-fail "same day" toggle's storage convention, shared by the
// logging flow (which writes it) and the level page's edit-level modal
// (which has to recognise it when reopening an entry).

/**
 * "Same day" toggle produces a worst-fail instant exactly one second before
 * the completion/drop instant (bare dates with no time just match exactly) —
 * used to pre-check the toggle when reopening an entry saved that way.
 */
export function isSameDayToggleOn(
  anchorDateRaw: string | null,
  anchorTimezone: string | null,
  worstFailDateRaw: string | null,
  worstFailTimezone: string | null
): boolean {
  if (anchorDateRaw == null || worstFailDateRaw == null) return false
  // The toggle always writes matching timezones for both fields (see
  // sessionDateFields/worstFailDateFields in payload.ts) — a mismatched pair
  // was never produced by the toggle itself (imported/legacy data, most
  // likely), so it can't be "same day toggle on" regardless of timestamps.
  if (anchorTimezone !== worstFailTimezone) return false
  if (anchorTimezone == null) return anchorDateRaw === worstFailDateRaw
  return (
    new Date(worstFailDateRaw).getTime() ===
    new Date(anchorDateRaw).getTime() - 1000
  )
}
