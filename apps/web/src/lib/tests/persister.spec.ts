import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_AGE, persister } from '../persister'

const CACHE_KEY = 'infernolog:query-cache'

beforeEach(() => {
  localStorage.clear()
})

describe('the query-cache persister', () => {
  it('writes the client under its own key', async () => {
    await persister.persistClient({ queries: [] })

    expect(localStorage.getItem(CACHE_KEY)).toBe('{"queries":[]}')
  })

  it('restores what it wrote', async () => {
    const client = { queries: [{ queryKey: ['me'], state: { data: 1 } }] }
    await persister.persistClient(client)

    await expect(persister.restoreClient()).resolves.toEqual(client)
  })

  it('restores nothing on a first launch', async () => {
    await expect(persister.restoreClient()).resolves.toBeUndefined()
  })

  // A cache that fails to parse must not stop the app from booting — an
  // interrupted write or a stale format would otherwise be a white screen.
  describe('with a corrupt payload', () => {
    beforeEach(() => {
      localStorage.setItem(CACHE_KEY, '{not json')
    })

    it('restores nothing rather than throwing', async () => {
      await expect(persister.restoreClient()).resolves.toBeUndefined()
    })

    // Left in place it would fail again on every single launch.
    it('clears the bad payload so the next launch is clean', async () => {
      await persister.restoreClient()

      expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    })
  })

  it('survives storage that throws on read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {})

    await expect(persister.restoreClient()).resolves.toBeUndefined()
  })

  it('removes the cache on demand', async () => {
    await persister.persistClient({ queries: [] })

    await persister.removeClient()

    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('overwrites rather than appending on a re-persist', async () => {
    await persister.persistClient({ queries: ['a'] })
    await persister.persistClient({ queries: ['b'] })

    await expect(persister.restoreClient()).resolves.toEqual({
      queries: ['b'],
    })
  })

  // Paired with queryClient's gcTime: a shorter gcTime would evict entries the
  // persister then restores, which reads as cache thrash on the next launch.
  it('stays valid as long as the client keeps its entries', async () => {
    const { queryClient } = await import('../queryClient')

    expect(MAX_AGE).toBe(queryClient.getDefaultOptions().queries?.gcTime)
  })
})
