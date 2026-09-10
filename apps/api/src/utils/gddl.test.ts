import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  verifyGddlApiKey,
  roundGddlTier,
  fetchGddlTier,
  fetchGddlLevel,
  rescaleGddlEnjoyment,
  fetchGddlUserInfo,
  fetchAllGddlSubmissions,
  fetchGddlList,
  addGddlListEntry,
  removeGddlListEntry,
  submitGddlRecord,
  GddlError,
  GddlInvalidKeyError,
  GddlUnavailableError,
} from './gddl'

// The public level lookup goes through the shared token bucket, which is
// Postgres-backed. Granted by default here; the deny path gets its own test.
const mockAcquire = vi.fn(async () => true)
const mockThrottled = vi.fn<(ms?: number) => Promise<void>>()
vi.mock('./gddlRateLimit', () => ({
  acquireGddlSlot: () => mockAcquire(),
  reportGddlThrottled: (ms?: number) => mockThrottled(ms),
}))

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
    text: async () => JSON.stringify(body),
  } as Response
}

/** The parsed body of the most recent fetch call. */
function lastRequestBody(): Record<string, unknown> {
  const init = mockFetch.mock.lastCall?.[1] as RequestInit
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

beforeEach(() => {
  mockFetch.mockReset()
  mockAcquire.mockReset()
  mockAcquire.mockResolvedValue(true)
  mockThrottled.mockReset()
})

// ─── fetchGddlUserInfo ────────────────────────────────────────────────────────

describe('fetchGddlUserInfo', () => {
  it('returns id and name on 200', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { ID: 42, Name: 'Riot' }))
    await expect(fetchGddlUserInfo('key')).resolves.toEqual({
      id: 42,
      name: 'Riot',
    })
  })

  it('throws GddlInvalidKeyError on 401', async () => {
    mockFetch.mockResolvedValueOnce(resp(401, {}))
    await expect(fetchGddlUserInfo('bad-key')).rejects.toBeInstanceOf(
      GddlInvalidKeyError
    )
  })

  it('throws GddlInvalidKeyError on 403', async () => {
    mockFetch.mockResolvedValueOnce(resp(403, {}))
    await expect(fetchGddlUserInfo('bad-key')).rejects.toBeInstanceOf(
      GddlInvalidKeyError
    )
  })

  it('throws GddlUnavailableError on 500', async () => {
    mockFetch.mockResolvedValueOnce(resp(500, {}))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })

  it('throws GddlUnavailableError on 503', async () => {
    mockFetch.mockResolvedValueOnce(resp(503, {}))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })

  it('throws GddlUnavailableError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })

  it('throws GddlUnavailableError on abort (timeout)', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })

  it('throws GddlInvalidKeyError when response is missing ID or Name', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { ID: 42 })) // missing Name
    await expect(fetchGddlUserInfo('key')).rejects.toBeInstanceOf(
      GddlInvalidKeyError
    )
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
    const page0 = Array.from({ length: 25 }, (_, i) => ({
      ...SUBMISSION,
      ID: i,
    }))
    const page1 = [{ ...SUBMISSION, ID: 25 }]
    mockFetch
      .mockResolvedValueOnce(
        resp(200, { total: 26, limit: 25, page: 0, submissions: page0 })
      )
      .mockResolvedValueOnce(
        resp(200, { total: 26, limit: 25, page: 1, submissions: page1 })
      )
    const result = await fetchAllGddlSubmissions('key', 17251)
    expect(result).toHaveLength(26)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('stops after a full page that happens to equal the limit exactly', async () => {
    // An exactly-full last page still triggers a second request; the empty page after stops it.
    const page0 = Array.from({ length: 25 }, (_, i) => ({
      ...SUBMISSION,
      ID: i,
    }))
    mockFetch
      .mockResolvedValueOnce(
        resp(200, { total: 25, limit: 25, page: 0, submissions: page0 })
      )
      .mockResolvedValueOnce(
        resp(200, { total: 25, limit: 25, page: 1, submissions: [] })
      )
    const result = await fetchAllGddlSubmissions('key', 17251)
    expect(result).toHaveLength(25)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws GddlUnavailableError on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(resp(503, {}))
    await expect(fetchAllGddlSubmissions('key', 17251)).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })

  it('throws GddlUnavailableError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(fetchAllGddlSubmissions('key', 17251)).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })

  it('throws GddlUnavailableError when response shape is unexpected', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { not: 'expected' }))
    await expect(fetchAllGddlSubmissions('key', 17251)).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })
})

// ─── verifyGddlApiKey ─────────────────────────────────────────────────────────

describe('verifyGddlApiKey', () => {
  it('returns the account name on 200 and sends the key as a bearer token', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { Name: 'Riot' }))
    await expect(verifyGddlApiKey('secret-key')).resolves.toEqual({
      name: 'Riot',
    })

    const init = mockFetch.mock.lastCall?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer secret-key'
    )
  })

  it.each([401, 403, 429, 500])(
    'throws GddlInvalidKeyError on %i — any non-2xx is treated as a bad key',
    async (status) => {
      mockFetch.mockResolvedValueOnce(resp(status, {}))
      await expect(verifyGddlApiKey('key')).rejects.toBeInstanceOf(
        GddlInvalidKeyError
      )
    }
  )

  it('throws GddlInvalidKeyError when Name is absent or empty', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, {}))
    await expect(verifyGddlApiKey('key')).rejects.toBeInstanceOf(
      GddlInvalidKeyError
    )

    mockFetch.mockResolvedValueOnce(resp(200, { Name: '' }))
    await expect(verifyGddlApiKey('key')).rejects.toBeInstanceOf(
      GddlInvalidKeyError
    )
  })

  it('propagates a network failure rather than reporting a bad key', async () => {
    // Unlike a non-2xx, an unreachable GDDL must NOT read as "your key is
    // invalid" — that would wrongly prompt the user to re-enter a good key.
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(verifyGddlApiKey('key')).rejects.not.toBeInstanceOf(
      GddlInvalidKeyError
    )
  })
})

// ─── roundGddlTier ────────────────────────────────────────────────────────────

describe('roundGddlTier', () => {
  it('rounds to the nearest whole tier', () => {
    expect(roundGddlTier(18.43)).toBe(18)
    expect(roundGddlTier(18.5)).toBe(19)
    expect(roundGddlTier(18.99)).toBe(19)
    expect(roundGddlTier(7)).toBe(7)
    expect(roundGddlTier(0)).toBe(0)
  })
})

// ─── fetchGddlTier ────────────────────────────────────────────────────────────

// ─── fetchGddlLevel / fetchGddlTier ──────────────────────────────────────────

// A GDDL /levels/{id} payload, trimmed to the fields we read.
function gddlLevel(overrides: Record<string, unknown> = {}) {
  return {
    ID: 26681070,
    Rating: 29.798008534850645,
    Enjoyment: 4.954022988505747,
    Showcase: 'Dfm_LegCN9Q',
    Meta: { seconds: 121.03047324788065, objects: 23156 },
    ...overrides,
  }
}

describe('fetchGddlLevel', () => {
  it('normalizes a full payload and hits the PLURAL levels endpoint', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, gddlLevel()))

    await expect(fetchGddlLevel('26681070')).resolves.toEqual({
      tier: 30,
      // 4.954 → nearest tenth (5.0) → EDEL's 0-100 scale.
      enjoyment: 50,
      // A bare video id upstream; a usable URL by the time it leaves here.
      showcaseUrl: 'https://www.youtube.com/watch?v=Dfm_LegCN9Q',
      seconds: 121,
      objectCount: 23156,
    })

    const url = String(mockFetch.mock.lastCall?.[0])
    expect(url).toContain('/levels/26681070')
    // The singular /level/{id} spelling 404s for every id in existence, which
    // is exactly how the old tier lookup managed to return null forever.
    expect(url).not.toMatch(/\/level\/\d/)
  })

  it('sends no Authorization header — this is public list data', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, gddlLevel()))
    await fetchGddlLevel('26681070')
    const init = mockFetch.mock.lastCall?.[1] as RequestInit
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  it('percent-encodes the level id into the path', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, {}))
    await fetchGddlLevel('a b/c')
    expect(String(mockFetch.mock.lastCall?.[0])).toContain('a%20b%2Fc')
  })

  // GDDL answers a level it does not carry with HTTP 200 and an EMPTY BODY, not
  // a 404. Reading that as a failure would keep every un-indexed level
  // permanently due for a re-check.
  it('returns null for the empty-object not-found', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, {}))
    await expect(fetchGddlLevel('880794')).resolves.toBeNull()
  })

  it('returns null when the body is about a different level', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, gddlLevel({ ID: 99 })))
    await expect(fetchGddlLevel('26681070')).resolves.toBeNull()
  })

  it('tolerates a missing rating, enjoyment, showcase and length', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(
        200,
        gddlLevel({
          Rating: null,
          Enjoyment: null,
          Showcase: null,
          Meta: null,
        })
      )
    )

    await expect(fetchGddlLevel('26681070')).resolves.toEqual({
      tier: null,
      enjoyment: null,
      showcaseUrl: null,
      seconds: null,
      objectCount: null,
    })
  })

  it.each([
    ['too short', 'abc'],
    ['too long', 'Dfm_LegCN9Q_extra'],
    ['not a video id at all', 'https://example.com/x'],
  ])('rejects a %s showcase rather than building a bogus URL', async (_l, id) => {
    mockFetch.mockResolvedValueOnce(resp(200, gddlLevel({ Showcase: id })))

    await expect(
      fetchGddlLevel('26681070').then((r) => r?.showcaseUrl)
    ).resolves.toBeNull()
  })

  it('opens the shared cooldown on a 429 and reports no opinion', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'retry-after' ? '30' : null) },
      json: async () => ({}),
    } as unknown as Response)

    await expect(fetchGddlLevel('26681070')).resolves.toBeUndefined()
    expect(mockThrottled).toHaveBeenCalledWith(30_000)
  })

  it('falls back to the default cooldown when Retry-After is unusable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({}),
    } as unknown as Response)

    await fetchGddlLevel('26681070')
    expect(mockThrottled).toHaveBeenCalledWith(undefined)
  })

  // A denied slot must never wait and never look like a not-found: it is "no
  // opinion this pass", so the merge leaves GDDL's columns alone.
  it('returns undefined without calling out when the limiter denies a slot', async () => {
    mockAcquire.mockResolvedValue(false)

    await expect(fetchGddlLevel('26681070')).resolves.toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['a 404', () => mockFetch.mockResolvedValueOnce(resp(404, {}))],
    ['a 500', () => mockFetch.mockResolvedValueOnce(resp(500, {}))],
    ['a network error', () => mockFetch.mockRejectedValueOnce(new TypeError())],
    [
      'an unexpected shape',
      () => mockFetch.mockResolvedValueOnce(resp(200, ['nope'])),
    ],
    [
      'malformed JSON',
      () =>
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('bad json')
          },
        } as unknown as Response),
    ],
  ])('resolves undefined (never throws) on %s', async (_label, arrange) => {
    arrange()
    await expect(fetchGddlLevel('26681070')).resolves.toBeUndefined()
  })
})

describe('fetchGddlTier', () => {
  it('returns the rounded tier from Rating', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, gddlLevel({ ID: 12345, Rating: 18.43 })))
    await expect(fetchGddlTier('12345')).resolves.toBe(18)
  })

  it.each([
    ['a not-found', () => mockFetch.mockResolvedValueOnce(resp(200, {}))],
    ['a 500', () => mockFetch.mockResolvedValueOnce(resp(500, {}))],
    ['a network error', () => mockFetch.mockRejectedValueOnce(new TypeError())],
    [
      'a missing rating',
      () =>
        mockFetch.mockResolvedValueOnce(
          resp(200, gddlLevel({ ID: 12345, Rating: null }))
        ),
    ],
    [
      'a non-numeric rating',
      () =>
        mockFetch.mockResolvedValueOnce(
          resp(200, gddlLevel({ ID: 12345, Rating: 'hard' }))
        ),
    ],
    [
      'a non-finite rating',
      () =>
        mockFetch.mockResolvedValueOnce(
          resp(200, gddlLevel({ ID: 12345, Rating: Infinity }))
        ),
    ],
  ])('resolves null (never throws) on %s', async (_label, arrange) => {
    arrange()
    await expect(fetchGddlTier('12345')).resolves.toBeNull()
  })
})

// ─── fetchGddlList ────────────────────────────────────────────────────────────

describe('fetchGddlList', () => {
  it('maps levelID entries to string ids', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, [{ levelID: 12345 }, { levelID: 67890 }])
    )
    await expect(fetchGddlList('key', 17251, 'favorites')).resolves.toEqual([
      '12345',
      '67890',
    ])
  })

  it('falls back to ID and levelId spellings', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, [{ ID: 1 }, { levelId: 2 }]))
    await expect(fetchGddlList('key', 17251, 'favorites')).resolves.toEqual([
      '1',
      '2',
    ])
  })

  it('drops entries with no usable id instead of emitting nulls', async () => {
    mockFetch.mockResolvedValueOnce(
      resp(200, [{ levelID: 1 }, null, { nope: true }, { levelID: '2' }, 7])
    )
    // The string '2' is dropped too — only numeric ids are accepted.
    await expect(fetchGddlList('key', 17251, 'favorites')).resolves.toEqual([
      '1',
    ])
  })

  it('returns [] when the body is not an array', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, { not: 'an array' }))
    await expect(fetchGddlList('key', 17251, 'favorites')).resolves.toEqual([])
  })

  it('targets the list named in the argument', async () => {
    mockFetch.mockResolvedValueOnce(resp(200, []))
    await fetchGddlList('key', 17251, 'least-favorites')
    expect(String(mockFetch.mock.lastCall?.[0])).toContain(
      '/user/17251/least-favorites'
    )
  })

  it('throws GddlUnavailableError on a non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(resp(503, {}))
    await expect(
      fetchGddlList('key', 17251, 'favorites')
    ).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('throws GddlUnavailableError on a network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(
      fetchGddlList('key', 17251, 'favorites')
    ).rejects.toBeInstanceOf(GddlUnavailableError)
  })
})

// ─── addGddlListEntry / removeGddlListEntry ───────────────────────────────────

describe.each([
  ['addGddlListEntry', addGddlListEntry, 'POST'],
  ['removeGddlListEntry', removeGddlListEntry, 'DELETE'],
] as const)('%s', (_name, fn, method) => {
  it(`resolves on 2xx and sends ${method} with an integer levelId`, async () => {
    mockFetch.mockResolvedValueOnce(resp(200, {}))
    await expect(
      fn('key', 17251, 'favorites', '12345')
    ).resolves.toBeUndefined()

    const init = mockFetch.mock.lastCall?.[1] as RequestInit
    expect(init.method).toBe(method)
    // GDDL rejects a string here — the id must cross the wire as a number.
    expect(lastRequestBody()).toEqual({ levelId: 12345 })
  })

  it('throws GddlError on a non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(resp(500, {}))
    await expect(fn('key', 17251, 'favorites', '12345')).rejects.toBeInstanceOf(
      GddlError
    )
  })

  it('throws GddlUnavailableError on a network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(fn('key', 17251, 'favorites', '12345')).rejects.toBeInstanceOf(
      GddlUnavailableError
    )
  })
})

// ─── submitGddlRecord ─────────────────────────────────────────────────────────

const RECORD = {
  levelId: '12345',
  videoUrl: null,
  attempts: null,
  fps: null,
  enjoyment: null,
  gddlTier: null,
}

/** submitGddlRecord resolves the GDDL user id first; queue that response. */
function mockUserInfoThen(submissionResponse: Response) {
  mockFetch
    .mockResolvedValueOnce(resp(200, { ID: 17251, Name: 'Riot' }))
    .mockResolvedValueOnce(submissionResponse)
}

describe('submitGddlRecord', () => {
  it('resolves accepted:true when GDDL accepts the record', async () => {
    mockUserInfoThen(resp(200, { accepted: true }))
    await expect(submitGddlRecord('key', RECORD)).resolves.toEqual({
      accepted: true,
    })
  })

  it('reports accepted:false for anything other than a literal true', async () => {
    mockUserInfoThen(resp(200, { accepted: 'yes' }))
    await expect(submitGddlRecord('key', RECORD)).resolves.toEqual({
      accepted: false,
    })
  })

  it('sends the required fields with defaults for isSolo/device', async () => {
    mockUserInfoThen(resp(200, { accepted: true }))
    await submitGddlRecord('key', RECORD)

    expect(lastRequestBody()).toEqual({
      levelID: 12345,
      userID: 17251,
      isProofPrivate: false,
      progress: 100,
      isSolo: true,
      device: 'pc',
      status: 'beaten',
    })
  })

  it('omits optional fields that are null rather than sending nulls', async () => {
    mockUserInfoThen(resp(200, { accepted: true }))
    await submitGddlRecord('key', RECORD)

    const body = lastRequestBody()
    for (const key of [
      'attempts',
      'refreshRate',
      'enjoyment',
      'rating',
      'proof',
    ])
      expect(body).not.toHaveProperty(key)
  })

  it('maps the optional fields onto GDDL names and scales enjoyment to 0-10', async () => {
    mockUserInfoThen(resp(200, { accepted: true }))
    await submitGddlRecord('key', {
      levelId: '12345',
      videoUrl: 'https://youtu.be/abc',
      attempts: 4021,
      fps: 240,
      // Ratings are stored 0-100 internally; GDDL wants 0-10.
      enjoyment: 85,
      gddlTier: 18,
      isSolo: false,
      device: 'mobile',
    })

    expect(lastRequestBody()).toEqual({
      levelID: 12345,
      userID: 17251,
      isProofPrivate: false,
      progress: 100,
      isSolo: false,
      device: 'mobile',
      attempts: 4021,
      refreshRate: 240,
      enjoyment: 9, // 85 / 10, rounded
      rating: 18,
      proof: 'https://youtu.be/abc',
      status: 'beaten',
    })
  })

  it('keeps a zero enjoyment and a zero tier — they are values, not absences', async () => {
    mockUserInfoThen(resp(200, { accepted: true }))
    await submitGddlRecord('key', { ...RECORD, enjoyment: 0, gddlTier: 0 })

    const body = lastRequestBody()
    expect(body.enjoyment).toBe(0)
    expect(body.rating).toBe(0)
  })

  it('throws GddlError on a non-2xx submission', async () => {
    mockUserInfoThen(resp(422, { error: 'duplicate' }))
    await expect(submitGddlRecord('key', RECORD)).rejects.toBeInstanceOf(
      GddlError
    )
  })

  it('propagates the user-info failure without attempting a submission', async () => {
    mockFetch.mockResolvedValueOnce(resp(401, {}))
    await expect(submitGddlRecord('key', RECORD)).rejects.toBeInstanceOf(
      GddlInvalidKeyError
    )
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

// ─── request timeouts ─────────────────────────────────────────────────────────

describe('request timeouts', () => {
  /**
   * A fetch that never settles until its abort signal fires — which is what
   * lets these tests prove the timeout actually aborts the request, rather
   * than only that a timer was scheduled.
   */
  function hangUntilAborted() {
    mockFetch.mockImplementation((_url?: string, init?: RequestInit) => {
      const signal = init?.signal
      // The runner also invokes registered mocks with no arguments during
      // cleanup. Those have no signal to hang on, and hanging there would
      // stall the hook rather than the request under test.
      if (!signal) return Promise.resolve(resp(200, {}))
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })
    })
  }

  /** Runs `call`, pushing the fake clock past any timeout it scheduled. */
  async function runPastTimeout<T>(call: () => Promise<T>): Promise<T> {
    const promise = call()
    // Swallow here so the rejection is never momentarily unhandled while the
    // clock advances; the caller still asserts on `promise`.
    promise.catch(() => {})
    await vi.advanceTimersByTimeAsync(30_000)
    return promise
  }

  beforeEach(() => {
    vi.useFakeTimers()
    hangUntilAborted()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts a hung key verification', async () => {
    await expect(
      runPastTimeout(() => verifyGddlApiKey('key'))
    ).rejects.toThrow()
  })

  it('aborts a hung tier lookup and resolves null', async () => {
    // Never throws — the tier autofill must not block the logging flow.
    await expect(
      runPastTimeout(() => fetchGddlTier('12345'))
    ).resolves.toBeNull()
  })

  it('aborts a hung user-info lookup', async () => {
    await expect(
      runPastTimeout(() => fetchGddlUserInfo('key'))
    ).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('aborts a hung submissions fetch', async () => {
    await expect(
      runPastTimeout(() => fetchAllGddlSubmissions('key', 17251))
    ).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('aborts a hung list fetch', async () => {
    await expect(
      runPastTimeout(() => fetchGddlList('key', 17251, 'favorites'))
    ).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it.each([
    ['addGddlListEntry', addGddlListEntry],
    ['removeGddlListEntry', removeGddlListEntry],
  ] as const)('aborts a hung %s', async (_name, fn) => {
    await expect(
      runPastTimeout(() => fn('key', 17251, 'favorites', '12345'))
    ).rejects.toBeInstanceOf(GddlUnavailableError)
  })

  it('aborts a hung record submission', async () => {
    // The user-info lookup resolves first; only the submission itself hangs.
    const hanging = mockFetch.getMockImplementation()!
    mockFetch
      .mockImplementationOnce(async () =>
        resp(200, { ID: 17251, Name: 'Riot' })
      )
      .mockImplementation(hanging)

    await expect(
      runPastTimeout(() => submitGddlRecord('key', RECORD))
    ).rejects.toThrow()
  })
})

// ─── rescaleGddlEnjoyment ────────────────────────────────────────────────────

describe('rescaleGddlEnjoyment', () => {
  it.each([
    // Round to the nearest tenth of a GDDL point, then onto EDEL's 0-100.
    [4.954022988505747, 50],
    [4.94, 49],
    [4.95, 50],
    [7.123456, 71],
    [0, 0],
    [10, 100],
  ])('rescales %s to %s', (raw, expected) => {
    expect(rescaleGddlEnjoyment(raw)).toBe(expected)
  })

  // The two sources share one column and one card, so a GDDL value must not be
  // distinguishable from an EDEL one by carrying extra decimal places.
  it('always lands on a whole number', () => {
    for (const raw of [1.23456, 6.6666, 9.99999, 0.04]) {
      expect(Number.isInteger(rescaleGddlEnjoyment(raw))).toBe(true)
    }
  })

  // The 0-10 range is upstream's promise, not ours; a badge reading "137"
  // would be worse than a slightly wrong one.
  it('clamps a value outside the documented scale', () => {
    expect(rescaleGddlEnjoyment(13.7)).toBe(100)
    expect(rescaleGddlEnjoyment(-2)).toBe(0)
  })
})
