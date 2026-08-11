// All InfernoLog-set cookies (preset selection, age-gate cooldown, ...) use
// this prefix. Deleting an account should leave no trace of them behind.
const APP_COOKIE_PREFIX = 'il_'

/**
 * Deletes every cookie InfernoLog set, identified by the `il_` prefix.
 *
 * Called on account deletion so nothing about the account survives locally —
 * the preset selection and the age-gate cooldown both live in cookies.
 */
export function clearAllAppCookies(): void {
  const names = document.cookie
    .split('; ')
    .map((c) => c.split('=')[0])
    .filter(
      (name): name is string => !!name && name.startsWith(APP_COOKIE_PREFIX)
    )

  for (const name of names) {
    document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`
  }
}
