import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchGlobalStatsViewerLevel } from './globalStatsViewer'

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

// A GSV /v3/levels/{id} payload, trimmed to the fields we read. `lists` and the
// rest are overridable per test.
function gsvLevel(overrides: Record<string, unknown> = {}) {
  return {
    level_id: 86407629,
    level_name: 'Tidal Wave',
    creator: { user_id: 16348545, name: 'OniLinkGD' },
    // 12 is GSV's Extreme Demon; 11 is Insane Demon.
    difficulty: 12,
    showcase_url: null,
    length: { seconds: 121, display: '2:01' },
    stats: {
      object_count: 220116,
      downloads: 31696213,
      likes: 681674,
      dislikes: null,
    },
    additional_info: {
      lists: [
        {
          name: 'AREDL',
          value: 5,
          label: '#5',
          url: 'https://aredl.net/list/86407629',
        },
        { name: 'SHEET', value: 20, label: '20', url: null },
        { name: 'GDDL', value: 39.0, label: '39.0', url: null },
      ],
      coins: 0,
      exists: true,
    },
    has_showcase: false,
    ...overrides,
  }
}

beforeEach(() => mockFetch.mockReset())

describe('fetchGlobalStatsViewerLevel', () => {
  it('normalizes a full payload and hits the level-scoped v3 endpoint', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, gsvLevel()))

    await expect(fetchGlobalStatsViewerLevel('86407629')).resolves.toEqual({
      gddlTier: 39,
      aredlRank: 5,
      sheetTier: 20,
      showcaseUrl: null,
      objectCount: 220116,
      durationSeconds: 121,
    })

    const url = mockFetch.mock.calls[0]?.[0] as string
    expect(url).toContain('/v3/levels/86407629')
  })

  it('rounds the GDDL decimal to the canonical whole number', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(
        200,
        gsvLevel({
          additional_info: {
            lists: [{ name: 'GDDL', value: 23.98, label: '23.98', url: null }],
          },
        })
      )
    )

    const result = await fetchGlobalStatsViewerLevel('10565740')
    expect(result).toMatchObject({ gddlTier: 24, aredlRank: null })
  })

  it('keeps sheet tier 0 — the "Fuck" tier is a real placement, not an absence', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(
        200,
        gsvLevel({
          additional_info: {
            lists: [{ name: 'SHEET', value: 0, label: '0', url: null }],
          },
        })
      )
    )

    const result = await fetchGlobalStatsViewerLevel('123')
    expect(result?.sheetTier).toBe(0)
  })

  it('returns nulls for an empty lists array rather than dropping the level', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(
        200,
        gsvLevel({
          showcase_url: 'https://www.youtube.com/watch?v=jPqVXbKNoLk',
          additional_info: { lists: [] },
        })
      )
    )

    await expect(fetchGlobalStatsViewerLevel('1')).resolves.toEqual({
      gddlTier: null,
      aredlRank: null,
      sheetTier: null,
      showcaseUrl: 'https://www.youtube.com/watch?v=jPqVXbKNoLk',
      objectCount: 220116,
      durationSeconds: 121,
    })
  })

  // GSV reports sheet tiers 1-21 and never 0, so the spreadsheets' bottom
  // "Fuck" tier is invisible here — an unplaced level and a bottom-tier one look
  // identical. This used to be resolved by INFERRING tier 0 for any extreme
  // demon with no SHEET entry, which reached ~355 levels for a tier that holds
  // 24. AREDL states the tier by name, so a missing entry now means what it
  // says and the merge takes the tier from there.
  it.each([
    ['an extreme demon', 12],
    ['an insane demon', 11],
    ['a non-demon', 2],
  ])('leaves a missing sheet entry missing for %s', async (_label, difficulty) => {
    mockFetch.mockResolvedValueOnce(
      resp(200, gsvLevel({ difficulty, additional_info: { lists: [] } }))
    )

    await expect(
      fetchGlobalStatsViewerLevel('123').then((r) => r?.sheetTier)
    ).resolves.toBeNull()
  })

  it('tolerates a missing length without failing the whole record', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, gsvLevel({ length: null })))

    const result = await fetchGlobalStatsViewerLevel('86407629')
    expect(result?.durationSeconds).toBeNull()
    expect(result?.gddlTier).toBe(39)
  })

  it('tolerates a missing object count without failing the whole record', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, gsvLevel({ stats: { object_count: null } }))
    )

    const result = await fetchGlobalStatsViewerLevel('86407629')
    expect(result?.objectCount).toBeNull()
    expect(result?.gddlTier).toBe(39)
  })

  it('returns null on 404 — GSV answered, it just does not index the level', async () => {
    mockFetch.mockResolvedValueOnce(resp(404, { reason: 'Level not found.' }))

    await expect(fetchGlobalStatsViewerLevel('999999999')).resolves.toBeNull()
  })

  it('returns undefined on a non-404 error response', async () => {
    mockFetch.mockResolvedValueOnce(resp(500, { error: 'boom' }))

    await expect(
      fetchGlobalStatsViewerLevel('86407629')
    ).resolves.toBeUndefined()
  })

  it('returns undefined for an unexpected response shape', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, ['not', 'an', 'object']))

    await expect(
      fetchGlobalStatsViewerLevel('86407629')
    ).resolves.toBeUndefined()
  })

  it('returns undefined when the request itself fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'))

    await expect(
      fetchGlobalStatsViewerLevel('86407629')
    ).resolves.toBeUndefined()
  })
})
