const PREFIX = 'il_preset_'
const MAX_AGE = 60 * 60 * 24 * 365 // 1 year
// `Secure` keeps this off plaintext HTTP. Omitted on localhost, where the dev
// server is http:// and a Secure cookie would simply never be stored.
const SECURE = location.protocol === 'https:' ? '; Secure' : ''

/**
 * The list preset this user last had selected, or `null` if none is remembered.
 *
 * Returns the literal string `default` for the built-in default view — that is
 * a real selection, distinct from having no cookie at all.
 */
export function getPresetCookie(userId: string): string | null {
  const name = PREFIX + userId
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(name + '='))
  if (!match) return null
  return decodeURIComponent(match.slice(name.length + 1))
}

/**
 * Remembers `presetId` as this user's selected list preset for a year.
 *
 * Keyed by user id so two accounts sharing a browser don't clobber each
 * other. Pass `null` to record the built-in default view.
 */
export function setPresetCookie(userId: string, presetId: string | null) {
  const name = PREFIX + userId
  const value = presetId ?? 'default'
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${MAX_AGE}; path=/; SameSite=Lax${SECURE}`
}
