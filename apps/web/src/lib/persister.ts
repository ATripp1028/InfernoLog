const CACHE_KEY = 'infernolog:query-cache'
const ONE_DAY = 1000 * 60 * 60 * 24

/**
 * How long a persisted cache stays valid. Paired with `queryClient`'s `gcTime`.
 */
export const MAX_AGE = ONE_DAY

/**
 * Tags the persisted cache with the shape of what it holds. A restored cache
 * whose tag differs is discarded instead of used, so a query whose wire shape
 * changed is fetched fresh rather than read back in its old form.
 *
 * Change it whenever a persisted query's response changes in a way the current
 * code cannot read. Last changed when `MeData` replaced `discordId` with
 * `identities`: a cached user without that array would crash the settings page
 * before the refetch landed.
 */
export const CACHE_BUSTER = 'me-identities'

/**
 * localStorage-backed react-query persister.
 *
 * `restoreClient` swallows and clears a corrupt payload rather than throwing:
 * a cache that fails to parse must not stop the app from booting.
 */
export const persister = {
  persistClient: (client: unknown) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(client))
    return Promise.resolve()
  },
  restoreClient: () => {
    try {
      const item = localStorage.getItem(CACHE_KEY)
      return Promise.resolve(item ? JSON.parse(item) : undefined)
    } catch {
      localStorage.removeItem(CACHE_KEY)
      return Promise.resolve(undefined)
    }
  },
  removeClient: () => {
    localStorage.removeItem(CACHE_KEY)
    return Promise.resolve()
  },
}
