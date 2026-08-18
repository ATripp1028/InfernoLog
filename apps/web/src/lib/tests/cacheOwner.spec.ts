import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../queryClient', () => ({
  queryClient: { clear: vi.fn() },
}))
vi.mock('../persister', () => ({
  persister: { removeClient: vi.fn(() => Promise.resolve()) },
}))

const { queryClient } = await import('../queryClient')
const { persister } = await import('../persister')
const { claimCacheOwner, releaseCacheOwner } = await import('../cacheOwner')

const OWNER_KEY = 'infernolog:cache-owner'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

const cacheWasDiscarded = () =>
  vi.mocked(queryClient.clear).mock.calls.length > 0 &&
  vi.mocked(persister.removeClient).mock.calls.length > 0

describe('claimCacheOwner', () => {
  it('keeps the cache when the same identity signs back in', async () => {
    localStorage.setItem(OWNER_KEY, 'sub-a')

    await claimCacheOwner('sub-a')

    expect(cacheWasDiscarded()).toBe(false)
    expect(localStorage.getItem(OWNER_KEY)).toBe('sub-a')
  })

  it('discards the cache when a different identity signs in', async () => {
    localStorage.setItem(OWNER_KEY, 'sub-a')

    await claimCacheOwner('sub-b')

    expect(cacheWasDiscarded()).toBe(true)
    expect(localStorage.getItem(OWNER_KEY)).toBe('sub-b')
  })

  // A cache written before this key existed has no provenance, so it has to be
  // treated as somebody else's rather than assumed to be this user's.
  it('discards an unowned cache', async () => {
    await claimCacheOwner('sub-a')

    expect(cacheWasDiscarded()).toBe(true)
    expect(localStorage.getItem(OWNER_KEY)).toBe('sub-a')
  })
})

describe('releaseCacheOwner', () => {
  it('drops both the cache and the ownership record', async () => {
    localStorage.setItem(OWNER_KEY, 'sub-a')

    await releaseCacheOwner()

    expect(cacheWasDiscarded()).toBe(true)
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })
})
