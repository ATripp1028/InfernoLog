const PREFIX = 'il_preset_'
const MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export function getPresetCookie(userId: string): string | null {
  const name = PREFIX + userId
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  if (!match) return null
  return decodeURIComponent(match.slice(name.length + 1))
}

export function setPresetCookie(userId: string, presetId: string | null) {
  const name = PREFIX + userId
  const value = presetId ?? 'default'
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${MAX_AGE}; path=/; SameSite=Lax`
}
