import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAredlLevel, fetchAredlList } from './aredl'

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

// An AREDL /levels/{id} payload, trimmed to the fields we read.
function aredlLevel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a2671a91-21b2-4771-9b5d-98eec52733e7',
    position: 216,
    name: 'Cobwebs',
    status: 'MainList',
    level_id: 82172844,
    edel_enjoyment: 59.39285714,
    is_edel_pending: false,
    gddl_tier: 33.029411764705884,
    nlw_tier: 'Inexorable',
    verifications: [
      {
        video_url: 'https://www.youtube.com/watch?v=bgZ85rCaEGY',
        hide_video: false,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => mockFetch.mockReset())

describe('fetchAredlLevel', () => {
  it('normalizes a full payload and hits the level endpoint', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, aredlLevel()))

    await expect(fetchAredlLevel('82172844')).resolves.toEqual({
      position: 216,
      status: 'MainList',
      enjoyment: 59.39285714,
      enjoymentPending: false,
      // "Inexorable" is index 12 on the shared ladder.
      sheetTier: 12,
      showcaseUrl: 'https://www.youtube.com/watch?v=bgZ85rCaEGY',
    })

    const url = mockFetch.mock.calls[0]?.[0] as string
    expect(url).toContain('/v2/api/aredl/levels/82172844')
  })

  // The whole reason the id-echo guard exists. AREDL resolves the path segment
  // as either a level id OR a list position, so `128` returns HTTP 200 for the
  // level at position 128 — a different level entirely, in a well-formed body.
  it('rejects a 200 that is about a different level', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, aredlLevel({ level_id: 132751236, position: 128 }))
    )

    await expect(fetchAredlLevel('128')).resolves.toBeNull()
  })

  it('maps an unknown tier name to null rather than throwing', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, aredlLevel({ nlw_tier: 'Renamed Tier' }))
    )

    await expect(
      fetchAredlLevel('82172844').then((r) => r?.sheetTier)
    ).resolves.toBeNull()
  })

  // Listworthy levels carry no nlw_tier — AREDL's names stop at Merciless (14),
  // so GSV remains the only source of 15-21.
  it('maps a null tier name to null', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, aredlLevel({ nlw_tier: null })))

    await expect(
      fetchAredlLevel('82172844').then((r) => r?.sheetTier)
    ).resolves.toBeNull()
  })

  it('reports the bottom "Fuck" tier, which GSV can never state', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, aredlLevel({ nlw_tier: 'Fuck' })))

    await expect(
      fetchAredlLevel('82172844').then((r) => r?.sheetTier)
    ).resolves.toBe(0)
  })

  it('skips a hidden verification and takes the next usable one', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(
        200,
        aredlLevel({
          verifications: [
            { video_url: 'https://youtu.be/hidden00000', hide_video: true },
            { video_url: 'https://youtu.be/shown000000', hide_video: false },
          ],
        })
      )
    )

    await expect(
      fetchAredlLevel('82172844').then((r) => r?.showcaseUrl)
    ).resolves.toBe('https://youtu.be/shown000000')
  })

  it('returns a null showcase when every verification is hidden', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(
        200,
        aredlLevel({
          verifications: [
            { video_url: 'https://youtu.be/hidden00000', hide_video: true },
          ],
        })
      )
    )

    await expect(
      fetchAredlLevel('82172844').then((r) => r?.showcaseUrl)
    ).resolves.toBeNull()
  })

  it('returns null on 404 — AREDL answered, the level is just not placed', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(404, { message: 'Failed to resolve 503732: Record not found' })
    )

    await expect(fetchAredlLevel('503732')).resolves.toBeNull()
  })

  it('returns undefined on a non-404 error response', async () => {
    mockFetch.mockResolvedValueOnce(resp(500, { error: 'boom' }))

    await expect(fetchAredlLevel('82172844')).resolves.toBeUndefined()
  })

  it('returns undefined for an unexpected response shape', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, ['not', 'an', 'object']))

    await expect(fetchAredlLevel('82172844')).resolves.toBeUndefined()
  })

  it('returns undefined when the request itself fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    await expect(fetchAredlLevel('82172844')).resolves.toBeUndefined()
  })
})

describe('fetchAredlList', () => {
  it('keys every row by level id', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, [
        aredlLevel(),
        aredlLevel({ level_id: 127323087, position: 1, nlw_tier: null }),
      ])
    )

    const list = await fetchAredlList()
    expect(list?.size).toBe(2)
    expect(list?.get('82172844')).toMatchObject({
      position: 216,
      status: 'MainList',
      sheetTier: 12,
    })
    expect(list?.get('127323087')?.position).toBe(1)
  })

  // A two-player level is listed once per mode, and both rows carry the same
  // level id — DICHOTOMY (2P) and DICHOTOMY (Solo) share 103011600.
  it('deduplicates a repeated level id, preferring MainList then the better position', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, [
        aredlLevel({ level_id: 103011600, position: 1580, status: 'Legacy' }),
        aredlLevel({ level_id: 103011600, position: 900, status: 'MainList' }),
      ])
    )

    const list = await fetchAredlList()
    expect(list?.size).toBe(1)
    expect(list?.get('103011600')).toMatchObject({
      position: 900,
      status: 'MainList',
    })
  })

  it('keeps the stronger position when both rows share a status', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, [
        aredlLevel({ level_id: 103011600, position: 900 }),
        aredlLevel({ level_id: 103011600, position: 1200 }),
      ])
    )

    expect((await fetchAredlList())?.get('103011600')?.position).toBe(900)
  })

  it('skips a row with no usable level id', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, [aredlLevel({ level_id: null }), aredlLevel()])
    )

    expect((await fetchAredlList())?.size).toBe(1)
  })

  // An empty map would read as "AREDL is now empty" and clear every cached
  // placement, so a failure must be distinguishable from a real empty list.
  it('returns undefined rather than an empty map when the call fails', async () => {
    mockFetch.mockResolvedValueOnce(resp(500, { error: 'boom' }))
    await expect(fetchAredlList()).resolves.toBeUndefined()

    mockFetch.mockRejectedValueOnce(new Error('network down'))
    await expect(fetchAredlList()).resolves.toBeUndefined()

    mockFetch.mockResolvedValueOnce(resp(200, { not: 'an array' }))
    await expect(fetchAredlList()).resolves.toBeUndefined()
  })
})
