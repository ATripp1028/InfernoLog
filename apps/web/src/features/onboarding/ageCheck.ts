// The minimum-age rule the sign-up gate applies.
//
// Extracted from AgeGate so the boundary can be exercised without rendering
// the form; the rest of that component is JSX.

/** The minimum age to hold an InfernoLog account. */
export const MIN_AGE = 13

/**
 * Whole years between two dates, counting a birthday that has not yet come
 * round this year as the previous age.
 *
 * `today` is a parameter rather than read from the clock so the boundary is
 * testable and the caller decides what "now" means.
 */
export function calculateAge(birthDate: Date, today: Date): number {
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--
  }
  return age
}

/**
 * Whether a birthdate clears {@link MIN_AGE}.
 *
 * The gate runs BEFORE Google OAuth starts, because Cognito creates a
 * federated identity on the callback regardless of path — gating afterwards
 * would mean a child's data had already round-tripped through Cognito.
 */
export function isOldEnough(birthDate: Date, today: Date): boolean {
  return calculateAge(birthDate, today) >= MIN_AGE
}

/**
 * Parses an `<input type="date">` value ('YYYY-MM-DD') as a LOCAL calendar date.
 *
 * `new Date('2013-03-15')` parses the bare date form as UTC midnight, which in
 * any negative-UTC zone reads back as the previous calendar day — and
 * {@link calculateAge} compares it against a local `new Date()`. That
 * one-day slip is enough to admit someone exactly one day short of
 * {@link MIN_AGE}, so the value is split by hand instead.
 *
 * @returns An invalid Date for anything that is not a 'YYYY-MM-DD' value, which
 * {@link isOldEnough} rejects (NaN comparisons are false).
 */
export function parseBirthDateInput(value: string): Date {
  const parts = value.split('-')
  if (parts.length !== 3) return new Date(NaN)
  const [year, month, day] = parts.map(Number)
  if (year == null || month == null || day == null) return new Date(NaN)
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  )
    return new Date(NaN)
  return new Date(year, month - 1, day)
}
