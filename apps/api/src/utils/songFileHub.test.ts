import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSongFileHubNong } from './songFileHub'

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

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

// A full SFH /songs element. Overrides let each test tweak downloads etc.
function sfhSong(overrides: Record<string, unknown> = {}) {
  return {
    _id: '64f54c6ceba5efcdadf78b01',
    name: 'Slaughterhouse',
    songURL: 'https://youtu.be/UWNvLgl0M60',
    songName: 'CRIM3S - Lost (XVA Remix)',
    ytVideoID: 'YrTauLnDVdw',
    songID: '945695',
    state: 'rated',
    downloadUrl:
      'https://api.songfilehub.com/song/64f54c6ceba5efcdadf78b01?download=true&name=945695',
    urlHash: '93f61fc1ddfa',
    filetype: 'mp3',
    downloads: 1767103,
    levelID: '27690100',
    imageHash: { low: -908314093, high: 561151209, unsigned: false },
    ...overrides,
  }
}

beforeEach(() => mockFetch.mockReset())

describe('fetchSongFileHubNong', () => {
  it('returns the normalized result for a single rated match', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, [sfhSong()]))

    await expect(fetchSongFileHubNong('27690100')).resolves.toEqual({
      sfhId: '64f54c6ceba5efcdadf78b01',
      sfhSongName: 'CRIM3S - Lost (XVA Remix)',
      sfhYoutubeUrl: 'https://youtu.be/UWNvLgl0M60',
      sfhYoutubeVideoId: 'YrTauLnDVdw',
      sfhDownloadUrl:
        'https://api.songfilehub.com/song/64f54c6ceba5efcdadf78b01?download=true&name=945695',
      sfhFileType: 'mp3',
      sfhDownloads: 1767103,
    })

    // Level-scoped query, defaulting to the rated catalog.
    const url = mockFetch.mock.calls[0]?.[0] as string
    expect(url).toContain('levelID=27690100')
    expect(url).toContain('states=rated')
  })

  it('queries the unrated catalog when state=unrated', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, [sfhSong({ state: 'unrated' })]))

    const result = await fetchSongFileHubNong('27690100', 'unrated')
    expect(result?.sfhId).toBe('64f54c6ceba5efcdadf78b01')

    const url = mockFetch.mock.calls[0]?.[0] as string
    expect(url).toContain('states=unrated')
  })

  it('picks the highest-downloads entry when multiple results appear', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, [
        sfhSong({ _id: 'low', songID: '111', downloads: 10 }),
        sfhSong({ _id: 'high', songID: '222', downloads: 9999 }),
        sfhSong({ _id: 'mid', songID: '333', downloads: 500 }),
      ])
    )

    const result = await fetchSongFileHubNong('27690100')
    expect(result?.sfhId).toBe('high')
    expect(result?.sfhDownloads).toBe(9999)
  })

  it('returns null when the array is empty (checked, no NONG)', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, []))
    await expect(fetchSongFileHubNong('123')).resolves.toBeNull()
  })

  it('returns undefined on a non-2xx response (retryable failure)', async () => {
    mockFetch.mockResolvedValueOnce(resp(503, {}))
    await expect(fetchSongFileHubNong('123')).resolves.toBeUndefined()
  })

  it('returns undefined on a network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(fetchSongFileHubNong('123')).resolves.toBeUndefined()
  })

  it('returns undefined on a timeout/abort', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(fetchSongFileHubNong('123')).resolves.toBeUndefined()
  })

  it('returns undefined when the response is not an array', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { error: 'nope' }))
    await expect(fetchSongFileHubNong('123')).resolves.toBeUndefined()
  })
})
