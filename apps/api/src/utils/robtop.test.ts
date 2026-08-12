import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRobtopLevel,
  fetchRobtopLevelResult,
  parseAllFromGetGJLevels21,
  parseGetGJLevels21,
  searchRobtopByName,
  searchRobtopByNameResult,
} from './robtop'
import { acquireRobtopSlot, reportRobtopThrottled } from './robtopRateLimit'

// The rate limiter reads/writes shared state (DynamoDB in production), and the
// logger is noise here. DEFAULT_COOLDOWN_MS is re-exported from the real module
// because robtop.ts uses it as the 429 fallback value we assert on.
vi.mock('./robtopRateLimit', () => ({
  acquireRobtopSlot: vi.fn(),
  reportRobtopThrottled: vi.fn(),
  DEFAULT_COOLDOWN_MS: 60_000,
}))
vi.mock('./logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockAcquireSlot = vi.mocked(acquireRobtopSlot)
const mockReportThrottled = vi.mocked(reportRobtopThrottled)
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

/** A getGJLevels21 response body. `headers` only needs `retry-after`. */
function robtopResp(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as Response
}

/** The URLSearchParams the most recent fetch call posted. */
function lastRequestParams(): URLSearchParams {
  const init = mockFetch.mock.lastCall?.[1] as RequestInit
  return init.body as URLSearchParams
}

beforeEach(() => {
  mockFetch.mockReset()
  mockAcquireSlot.mockReset().mockResolvedValue(true)
  mockReportThrottled.mockReset().mockResolvedValue(undefined)
})

// Real getGJLevels21 response for a "bloodbath" search (5 levels). We query by
// id (type=10) which returns a single level, but the parser always takes the
// first — so this richer fixture exercises the creator/song joins too.
const BLOODBATH_RESPONSE =
  '1:10565740:2:Bloodbath:5:3:6:503085:8:10:9:50:10:170836653:12:0:13:21:14:5484858:17:1:43:6:25::18:10:19:3206:42:0:45:24746:3:V2hvc2UgYmxvb2Qgd2lsbCBiZSBzcGlsdCBpbiB0aGUgQmxvb2RiYXRoPyBXaG8gd2lsbCB0aGUgdmljdG9ycyBiZT8gSG93IG1hbnkgd2lsbCBzdXJ2aXZlPyBHb29kIGx1Y2suLi4=:15:3:30:7679228:31:0:37:0:38:0:39:0:46:1:47:2:35:467339|1:21761387:2:Bloodbath Z:5:1:6:3277407:8:10:9:20:10:20195372:12:0:13:20:14:446688:17:1:43:4:25::18:10:19:6328:42:0:45:0:3:UmVtYWtlIG9mIEJCLCBidXQgU2hvcnRlciBhbmQgbXVjaCBlYXNpZXIgWEQgTW9yZSBvZiBhIGdhbWVwbGF5IGxldmVsISAgSnVzdCBhIGZ1biBlYXN5IGRlbW9uLiBWZXJpZmllZCBCeSBYaW9kYXplciEgRW5qb3kgOkQ=:15:3:30:0:31:0:37:3:38:1:39:10:46:1:47:2:35:223469|1:64968478:2:Bloodbath but no:5:1:6:19747356:8:10:9:50:10:6967991:12:0:13:21:14:283065:17::43:6:25::18:8:19:19849:42:0:45:23233:3:Qmxvb2RiYXRoLCBJdCdzIG5vdCBldmVuIHRoaXM=:15:3:30:0:31:0:37:0:38:1:39:8:46:1:47:2:35:706340|1:75795864:2:Bloodbath:5:3:6:12348083:8:10:9:40:10:856380:12:0:13:22:14:20292:17::43:5:25::18:7:19:24643:42:0:45:55985:3:VGhhbmtzIHRvIGV2ZXJ5b25lIGluIG15IGRpc2NvcmQgc2VydmVyIHRoYXQgY29udHJpYnV0ZWQ=:15:3:30:75393195:31:0:37:0:38:1:39:6:46:1:47:2:35:513064|1:32256905:2:Bloodbath noclip:5:1:6:17869201:8:10:9:40:10:256320:12:0:13:21:14:1916:17::43:5:25::18:0:19:0:42:0:45:13997:3::15:3:30:10565740:31:0:37:0:38:0:39:8:46:1:47:2:35:467339#503085:Riot:37415|3277407:Zyzyx:88354|12348083:KNOEPPEL:3009121|17869201:CoolManGame2:5599333|19747356:Texic:6152129#1~|~223469~|~2~|~ParagonX9 - HyperioxX~|~3~|~31~|~4~|~ParagonX9~|~5~|~3.77~|~6~|~~|~10~|~-~|~16~|~~|~7~|~~|~8~|~1~:~1~|~467339~|~2~|~At the Speed of Light~|~3~|~52~|~4~|~Dimrain47~|~5~|~9.56~|~6~|~~|~10~|~https%3A%2F%2Fgeometrydashcontent.b-cdn.net%2Fsongs%2F467339.mp3~|~16~|~~|~7~|~~|~8~|~1~:~1~|~513064~|~2~|~EnV - Uprise~|~3~|~149~|~4~|~Envy~|~5~|~8.71~|~6~|~~|~10~|~http%3A%2F%2Faudio.ngfiles.com%2F513000%2F513064_EnV---Uprise.mp3~|~16~|~~|~7~|~UCaRqE7rKwJl1BvMRU4FFVJQ~|~8~|~1~:~1~|~706340~|~2~|~-At the Speed of Light- (8 bit Remix)~|~3~|~46724~|~4~|~ThaPredator~|~5~|~4.78~|~6~|~~|~10~|~-~|~16~|~~|~7~|~~|~8~|~1#5:0:10#2a869972e889b08ab70a94c3f84560b2f12d2aed'

describe('parseGetGJLevels21', () => {
  it('parses the first level with creator + custom song joined in', () => {
    const level = parseGetGJLevels21(BLOODBATH_RESPONSE)
    expect(level).not.toBeNull()
    if (!level) return

    expect(level.name).toBe('Bloodbath')
    expect(level.isDemon).toBe(true)
    expect(level.inGameDifficulty).toBe('Extreme Demon')
    expect(level.partialDiff).toBe('demon-extreme')
    expect(level.isRated).toBe(true)
    expect(level.stars).toBe(10)
    expect(level.platformer).toBe(false)
    expect(level.length).toBe('Long')

    // Creator joined from the creators section (503085:Riot:37415).
    expect(level.creator).toBe('Riot')
    expect(level.creatorPlayerId).toBe('503085')
    expect(level.creatorAccountId).toBe('37415')

    // Custom song joined from the songs section (id 467339).
    expect(level.songId).toBe('467339')
    expect(level.officialSongId).toBeNull()
    expect(level.songName).toBe('At the Speed of Light')
    expect(level.songAuthor).toBe('Dimrain47')
    expect(level.songSize).toBe(9.56)
    expect(level.songLink).toBe(
      'https://geometrydashcontent.b-cdn.net/songs/467339.mp3'
    )

    // Stats + flags.
    expect(level.downloads).toBe(170836653)
    expect(level.likes).toBe(5484858)
    expect(level.featured).toBe(true)
    expect(level.featureScore).toBe(3206)
    expect(level.epicValue).toBe(0)
    expect(level.objectCount).toBe(24746)
    expect(level.coins).toBe(0)
    expect(level.copiedFromId).toBe('7679228')
    expect(level.levelVersion).toBe(3)
    expect(level.gameVersion).toBe('2.1')

    // base64 description decoded.
    expect(level.description).toBe(
      'Whose blood will be spilt in the Bloodbath? Who will the victors be? How many will survive? Good luck...'
    )
  })

  it('returns null for the "-1" not-found sentinel and empty bodies', () => {
    expect(parseGetGJLevels21('-1')).toBeNull()
    expect(parseGetGJLevels21('')).toBeNull()
    expect(parseGetGJLevels21('  \n')).toBeNull()
  })

  it('resolves official-song name/author from the static table', () => {
    // A non-demon, official-song (Deadlocked = index 19) level: key 35 (custom
    // song) is 0, key 12 (official song) is 19, denom 10 / numerator 30 = Hard.
    const response =
      '1:999:2:Official Song Level:5:1:6:42:8:10:9:30:13:22:18:9:35:0:12:19:15:5:42:1#42:Tester:7#1~|~~|~2~|~#1:0:10#hash'
    const level = parseGetGJLevels21(response)
    expect(level).not.toBeNull()
    if (!level) return

    expect(level.inGameDifficulty).toBe('Hard')
    expect(level.isDemon).toBe(false)
    expect(level.songId).toBeNull()
    expect(level.officialSongId).toBe(19)
    expect(level.songName).toBe('Deadlocked')
    expect(level.songAuthor).toBe('F-777')
    // length 5 ⇒ platformer; epic 1 ⇒ featured glow source.
    expect(level.platformer).toBe(true)
    expect(level.epicValue).toBe(1)
    expect(level.creator).toBe('Tester')
  })

  it('parses an unrated, community-voted level (denom 10 / num 50, no stars)', () => {
    // Sakupen Circles shape: rated difficulty face (Insane) from community votes
    // but stars=0 → unrated. Not a demon (demon flag absent).
    const response =
      '1:10887708:2:Sakupen circles:5:1:6:12345:8:10:9:50:13:21:18:0:15:3:35:0:12:0#12345:Cyclic:999#1~|~~|~2~|~#1:0:10#hash'
    const level = parseGetGJLevels21(response, '10887708')
    expect(level).not.toBeNull()
    if (!level) return

    expect(level.inGameDifficulty).toBe('Insane')
    expect(level.partialDiff).toBe('insane')
    expect(level.isRated).toBe(false)
    expect(level.isDemon).toBe(false)
    expect(level.stars).toBe(0)
    expect(level.creator).toBe('Cyclic')
  })

  it('selects the exact id from a multi-result search (not just the first)', () => {
    // type=0 search can return name-matched levels; the wanted id must win.
    const response =
      '1:111:2:Other:6:1:8:0:9:0:18:0:15:1|1:222:2:Wanted:6:2:8:10:9:30:18:5:15:2#1:A:10|2:B:20#1~|~~|~2~|~#2:0:10#hash'
    const wanted = parseGetGJLevels21(response, '222')
    expect(wanted?.name).toBe('Wanted')
    expect(wanted?.inGameDifficulty).toBe('Hard')
    expect(wanted?.isRated).toBe(true)

    // Without a wantId, the first level is returned.
    expect(parseGetGJLevels21(response)?.name).toBe('Other')
  })
})

// A minimal two-level response used by the fetch/search tests.
const TWO_LEVELS =
  '1:111:2:Alpha:5:1:6:1:8:10:9:30:13:22:18:5:15:2:35:0:12:0|1:222:2:Beta:5:1:6:2:8:10:9:50:13:21:18:10:15:3:35:0:12:0#1:A:10|2:B:20#1~|~~|~2~|~#2:0:10#hash'

// ─── parseAllFromGetGJLevels21 ────────────────────────────────────────────────

describe('parseAllFromGetGJLevels21', () => {
  it('returns every level in the response, in order', () => {
    const all = parseAllFromGetGJLevels21(TWO_LEVELS)
    expect(all.map((r) => r.levelId)).toEqual(['111', '222'])
    expect(all.map((r) => r.level.name)).toEqual(['Alpha', 'Beta'])
  })

  it('returns [] for the "-1" sentinel, empty bodies, and garbage', () => {
    expect(parseAllFromGetGJLevels21('-1')).toEqual([])
    expect(parseAllFromGetGJLevels21('')).toEqual([])
    expect(parseAllFromGetGJLevels21('   ')).toEqual([])
    expect(parseAllFromGetGJLevels21('not a robtop response')).toEqual([])
  })

  it('skips entries with no level id rather than emitting a bad row', () => {
    const all = parseAllFromGetGJLevels21(
      '2:NoId:5:1|1:222:2:Beta:5:1:8:10:9:50:13:21:18:10:15:3#1:A:10#1~|~~|~2~|~#1:0:10#hash'
    )
    expect(all.map((r) => r.levelId)).toEqual(['222'])
  })
})

// ─── fetchRobtopLevelResult ───────────────────────────────────────────────────

describe('fetchRobtopLevelResult', () => {
  it('returns the matching level as "found"', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    const result = await fetchRobtopLevelResult('222')
    expect(result).toEqual({
      status: 'found',
      level: expect.objectContaining({ name: 'Beta' }),
    })
  })

  it('posts type=0 with the id as the search string and an empty User-Agent', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    await fetchRobtopLevelResult('222')

    const [url, init] = mockFetch.mock.lastCall as [string, RequestInit]
    expect(url).toContain('/getGJLevels21.php')
    expect(init.method).toBe('POST')
    // An empty UA is required — Cloudflare returns HTTP 1020 otherwise.
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('')

    const params = lastRequestParams()
    // type=0 (search), NOT type=10 — type=10 omits unrated levels.
    expect(params.get('type')).toBe('0')
    expect(params.get('str')).toBe('222')
    expect(params.get('secret')).toBe('Wmfd2893gb7')
  })

  it('returns "not_found" for the "-1" body — the id does not exist', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, '-1'))
    await expect(fetchRobtopLevelResult('999')).resolves.toEqual({
      status: 'not_found',
    })
  })

  // CHARACTERIZATION TEST — documents current behaviour, which looks wrong.
  // parseGetGJLevels21 falls back to `all[0]` when `wantId` matches nothing, so
  // a search for an id GD does not have returns some OTHER name-matched level
  // marked 'found'. Callers cache that under the requested id. If the fallback
  // is tightened to return null on a wantId miss, this test should flip to
  // expecting { status: 'not_found' }.
  it('returns the first result as "found" when the requested id is absent', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    const result = await fetchRobtopLevelResult('999')
    expect(result).toEqual({
      status: 'found',
      level: expect.objectContaining({ name: 'Alpha' }),
    })
  })

  it('returns "unreachable" without fetching when the rate limiter denies a slot', async () => {
    mockAcquireSlot.mockResolvedValue(false)
    await expect(fetchRobtopLevelResult('222')).resolves.toEqual({
      status: 'unreachable',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns "unreachable" on a non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(500, ''))
    await expect(fetchRobtopLevelResult('222')).resolves.toEqual({
      status: 'unreachable',
    })
  })

  it('returns "unreachable" on a network error or timeout', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(fetchRobtopLevelResult('222')).resolves.toEqual({
      status: 'unreachable',
    })

    mockFetch.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(fetchRobtopLevelResult('222')).resolves.toEqual({
      status: 'unreachable',
    })
  })

  describe('429 shared cooldown', () => {
    it('opens a cooldown from a delta-seconds Retry-After', async () => {
      mockFetch.mockResolvedValueOnce(
        robtopResp(429, '', { 'retry-after': '120' })
      )
      await fetchRobtopLevelResult('222')
      expect(mockReportThrottled).toHaveBeenCalledWith(120_000)
    })

    it('opens a cooldown from an HTTP-date Retry-After', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))
      mockFetch.mockResolvedValueOnce(
        robtopResp(429, '', { 'retry-after': 'Wed, 12 Aug 2026 00:02:00 GMT' })
      )
      await fetchRobtopLevelResult('222')
      expect(mockReportThrottled).toHaveBeenCalledWith(120_000)
      vi.useRealTimers()
    })

    it('clamps an already-past HTTP-date to zero rather than going negative', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))
      mockFetch.mockResolvedValueOnce(
        robtopResp(429, '', { 'retry-after': 'Wed, 12 Aug 2026 00:00:00 GMT' })
      )
      await fetchRobtopLevelResult('222')
      expect(mockReportThrottled).toHaveBeenCalledWith(0)
      vi.useRealTimers()
    })

    it.each([
      ['absent', {}],
      ['unparseable', { 'retry-after': 'soon' }],
    ])('falls back to the default cooldown when Retry-After is %s', async (
      _label,
      headers
    ) => {
      mockFetch.mockResolvedValueOnce(robtopResp(429, '', headers))
      await fetchRobtopLevelResult('222')
      expect(mockReportThrottled).toHaveBeenCalledWith(60_000)
    })

    it('still reports unreachable when recording the cooldown fails', async () => {
      // Best-effort: a cooldown write failure must not change what we return.
      mockReportThrottled.mockRejectedValueOnce(new Error('dynamo down'))
      mockFetch.mockResolvedValueOnce(
        robtopResp(429, '', { 'retry-after': '30' })
      )
      await expect(fetchRobtopLevelResult('222')).resolves.toEqual({
        status: 'unreachable',
      })
    })

    it('does not open a cooldown for non-429 failures', async () => {
      mockFetch.mockResolvedValueOnce(robtopResp(503, ''))
      await fetchRobtopLevelResult('222')
      expect(mockReportThrottled).not.toHaveBeenCalled()
    })
  })
})

// ─── fetchRobtopLevel ─────────────────────────────────────────────────────────

describe('fetchRobtopLevel', () => {
  it('returns the level when found', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    const level = await fetchRobtopLevel('222')
    expect(level?.name).toBe('Beta')
  })

  it('collapses both not_found and unreachable to null', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, '-1'))
    await expect(fetchRobtopLevel('999')).resolves.toBeNull()

    mockFetch.mockResolvedValueOnce(robtopResp(500, ''))
    await expect(fetchRobtopLevel('222')).resolves.toBeNull()
  })
})

// ─── searchRobtopByNameResult ─────────────────────────────────────────────────

describe('searchRobtopByNameResult', () => {
  it('returns every match on success', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    const outcome = await searchRobtopByNameResult('bloodbath')
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.results.map((r) => r.levelId)).toEqual(['111', '222'])
  })

  it('distinguishes a genuine empty result from a failed call', async () => {
    // GD answered, it just has nothing — ok with [], not unreachable.
    mockFetch.mockResolvedValueOnce(robtopResp(200, '-1'))
    await expect(searchRobtopByNameResult('nothing')).resolves.toEqual({
      status: 'ok',
      results: [],
    })
  })

  it('defaults to type=0 and count=10', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    await searchRobtopByNameResult('bloodbath')

    const params = lastRequestParams()
    expect(params.get('type')).toBe('0')
    expect(params.get('str')).toBe('bloodbath')
    expect(params.get('count')).toBe('10')
    // Unset filters must be absent, not empty — GD treats '' as a real filter.
    expect(params.get('diff')).toBeNull()
    expect(params.get('demonFilter')).toBeNull()
  })

  it('forwards diff, demonFilter and an overridden type', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    await searchRobtopByNameResult('', {
      type: '1',
      diff: '-2',
      demonFilter: '5',
    })

    const params = lastRequestParams()
    expect(params.get('type')).toBe('1')
    expect(params.get('str')).toBe('')
    expect(params.get('diff')).toBe('-2')
    expect(params.get('demonFilter')).toBe('5')
  })

  it('applies extraParams last so page filters win over diff/demonFilter', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    await searchRobtopByNameResult('x', {
      diff: '-2',
      extraParams: { diff: '-1', len: '3', featured: '1' },
    })

    const params = lastRequestParams()
    expect(params.get('diff')).toBe('-1')
    expect(params.get('len')).toBe('3')
    expect(params.get('featured')).toBe('1')
  })

  it('returns "unreachable" when the rate limiter denies a slot', async () => {
    mockAcquireSlot.mockResolvedValue(false)
    await expect(searchRobtopByNameResult('x')).resolves.toEqual({
      status: 'unreachable',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns "unreachable" on a non-OK response or a network error', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(503, ''))
    await expect(searchRobtopByNameResult('x')).resolves.toEqual({
      status: 'unreachable',
    })

    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(searchRobtopByNameResult('x')).resolves.toEqual({
      status: 'unreachable',
    })
  })

  it('opens the shared cooldown on a 429, same as the by-id fetch', async () => {
    mockFetch.mockResolvedValueOnce(
      robtopResp(429, '', { 'retry-after': '45' })
    )
    await expect(searchRobtopByNameResult('x')).resolves.toEqual({
      status: 'unreachable',
    })
    expect(mockReportThrottled).toHaveBeenCalledWith(45_000)
  })

  it('survives a failed cooldown write on a 429', async () => {
    mockReportThrottled.mockRejectedValueOnce(new Error('dynamo down'))
    mockFetch.mockResolvedValueOnce(robtopResp(429, ''))
    await expect(searchRobtopByNameResult('x')).resolves.toEqual({
      status: 'unreachable',
    })
  })
})

// ─── searchRobtopByName ───────────────────────────────────────────────────────

describe('searchRobtopByName', () => {
  it('returns the matches on success', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(200, TWO_LEVELS))
    const results = await searchRobtopByName('bloodbath')
    expect(results.map((r) => r.levelId)).toEqual(['111', '222'])
  })

  it('flattens unreachable to an empty array', async () => {
    mockFetch.mockResolvedValueOnce(robtopResp(503, ''))
    await expect(searchRobtopByName('x')).resolves.toEqual([])
  })
})

// ─── request timeouts ─────────────────────────────────────────────────────────

describe('request timeouts', () => {
  /**
   * A fetch that never settles until its abort signal fires, so these tests
   * prove the timeout actually aborts the request rather than only that a
   * timer was scheduled.
   */
  function hangUntilAborted() {
    mockFetch.mockImplementation((_url?: string, init?: RequestInit) => {
      const signal = init?.signal
      // The runner also invokes registered mocks with no arguments during
      // cleanup; hanging there would stall the hook, not the request.
      if (!signal) return Promise.resolve(robtopResp(200, '-1'))
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

  it('reports a hung by-id fetch as unreachable', async () => {
    await expect(
      runPastTimeout(() => fetchRobtopLevelResult('222'))
    ).resolves.toEqual({ status: 'unreachable' })
  })

  it('reports a hung name search as unreachable', async () => {
    await expect(runPastTimeout(() => searchRobtopByNameResult('x'))).resolves.toEqual(
      { status: 'unreachable' }
    )
  })
})
