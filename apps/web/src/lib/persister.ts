const CACHE_KEY = 'infernolog:query-cache'
const ONE_DAY = 1000 * 60 * 60 * 24

export const MAX_AGE = ONE_DAY

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
