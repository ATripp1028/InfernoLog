import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchGddlUserInfo,
  fetchAllGddlSubmissions,
  GddlInvalidKeyError,
  GddlUnavailableError,
} from './gddl'

// ─── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => mockFetch.mockReset())

// ─── fetchGddlUserInfo ────────────────────────────────────────────────────────

describe('fetchGddlUserInfo', () => {
  it('returns id and name on 200', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { ID: 42, Name: 'Riot' }))
    await expect(fetchGddlUserInfo('key')).resolves.toEqual({ id: 42, name: 'Riot' })
  })

  it('throws GddlInvalidKeyError on 401', async () => {
    mockFetch.mockResolvedValueOnce(resp(401, {}))
    await expect(fetchGddlUserInfo('bad-key')).rejects.toBeInstanceOf(GddlInvalidKeyError)
  })

  it('throws GddlInvalidKeyError on 403', async () => {
    mockFetch.mockResolvedValueOnce(resp(403, {}))
    await expect(fetchGddlUserInfo('bad-key')).rejects.toBeInstanceOf(GddlInvalidKeyError)
  })

  it('throws GddlUnavailableError on 500', async () => {
    mockFetch.mockResolvedValueOnce(resp(500, {}))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('throws GddlUnavailableError on 503', async () => {
    mockFetch.mockResolvedValueOnce(resp(503, {}))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('throws GddlUnavailableError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('throws GddlUnavailableError on abort (timeout)', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('throws GddlInvalidKeyError when response is missing ID or Name', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { ID: 42 })) // missing Name
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(GddlInvalidKeyError)
  })
})

// ─── fetchAllGddlSubmissions ──────────────────────────────────────────────────

const SUBMISSION = {
  ID: 1,
  Rating: 8,
  Enjoyment: 7,
  Proof: 'https://youtube.com/watch?v=abc',
  DateAdded: '2024-06-01T00:00:00Z',
  Level: {
    ID: 12345,
    Rating: 8,
    Enjoyment: 7,
    Meta: {
      Name: 'DeathMoon',
      Difficulty: 'Extreme Demon',
      Length: 5,
      Rarity: 1,
      IsTwoPlayer: false,
      Song: { Name: 'Song' },
      Publisher: null,
    },
  },
}

describe('fetchAllGddlSubmissions', () => {
  it('returns all submissions from a single short page', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, { total: 1, limit: 25, page: 0, submissions: [SUBMISSION] })
    )
    const result = await fetchAllGddlSubmissions('key', 17251)
    expect(result).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('paginates until a page shorter than the limit', async () => {
    const page0 = Array.from({ length: 25 }, (_, i) => ({ ...SUBMISSION, ID: i }))
    const page1 = [{ ...SUBMISSION, ID: 25 }]
    mockFetch
      .mockResolvedValueOnce(resp(200, { total: 26, limit: 25, page: 0, submissions: page0 }))
      .mockResolvedValueOnce(resp(200, { total: 26, limit: 25, page: 1, submissions: page1 }))
    const result = await fetchAllGddlSubmissions('key', 17251)
    expect(result).toHaveLength(26)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('stops after a full page that happens to equal the limit exactly', async () => {
    // An exactly-full last page still triggers a second request; the empty page after stops it.
    const page0 = Array.from({ length: 25 }, (_, i) => ({ ...SUBMISSION, ID: i }))
    mockFetch
      .mockResolvedValueOnce(resp(200, { total: 25, limit: 25, page: 0, submissions: page0 }))
      .mockResolvedValueOnce(resp(200, { total: 25, limit: 25, page: 1, submissions: [] }))
    const result = await fetchAllGddlSubmissions('key', 17251)
    expect(result).toHaveLength(25)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws GddlUnavailableError on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(resp(503, {}))
    await expect(fetchAllGddlSubmissions('key', 17251)).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('throws GddlUnavailableError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(fetchAllGddlSubmissions('key', 17251)).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('throws GddlUnavailableError when response shape is unexpected', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { not: 'expected' }))
    await expect(fetchAllGddlSubmissions('key', 17251)).rejects.toBeInstanceOf(GddlUnavailableError)
  })
})
