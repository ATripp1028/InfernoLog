// The username editor's two rules: what makes a name valid, and when the
// 30-day change cooldown expires.
//
// Validation delegates to packages/core's UsernameSchema rather than
// restating it. The editor used to carry its own copy of the length/charset
// checks, which had already drifted — it did not reject reserved names, so a
// Save fired before the debounced availability check returned would send
// "admin" to the server and take a rejection.

import { UsernameSchema } from '@infernolog/core'

/** Username changes are locked for this long after each one. */
export const COOLDOWN_DAYS = 30

const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000

/**
 * The first thing wrong with a username, or `null` when it is valid.
 *
 * Returns the message rather than calling a setter so the decision and the
 * reporting stay separable. Reads `issues[0].message` because a ZodError's
 * own `message` is a JSON dump of every issue, which would render as a blob
 * in the field's inline error.
 */
export function usernameError(value: string): string | null {
  const result = UsernameSchema.safeParse(value)
  return result.success
    ? null
    : (result.error.issues[0]?.message ?? 'Invalid username')
}

/**
 * When the change cooldown lifts, or `null` when it already has (or the user
 * has never changed their name).
 *
 * @param now - Injectable clock, so the boundary is testable.
 */
export function cooldownEnd(
  usernameChangedAt: string | null,
  now: number = Date.now()
): Date | null {
  if (!usernameChangedAt) return null
  const changed = new Date(usernameChangedAt).getTime()
  if (Number.isNaN(changed)) return null
  const end = changed + COOLDOWN_MS
  return now >= end ? null : new Date(end)
}
