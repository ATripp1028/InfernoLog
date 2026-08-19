/**
 * Unit tests for spreadsheet name → level resolution.
 *
 * The rule this file exists to protect: resolving to the WRONG level is worse
 * than failing to resolve. Difficulty is a hard filter, creator is only a
 * tiebreaker, and neither the DB nor the RobTop path may fall back to an
 * unfiltered guess. Prisma, RobTop and SQS are mocked; no DB, no network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type {
  RobtopLevel,
  RobtopSearchOptions,
  RobtopSearchResult,
} from '../../../utils/robtop'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../../utils/prisma', () => ({ default: prismaMock }))

// Typed with the real signature so `mock.lastCall[1]` (the search options) is
// reachable — an argless mock type makes the args tuple empty.
const mockSearchRobtopByName = vi.hoisted(() =>
  vi.fn<
    (
      name: string,
      options?: RobtopSearchOptions
    ) => Promise<RobtopSearchResult[]>
  >()
)
vi.mock('../../../utils/robtop', () => ({
  searchRobtopByName: mockSearchRobtopByName,
}))

const { mockSqsSend } = vi.hoisted(() => ({ mockSqsSend: vi.fn() }))
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: class {
    send = mockSqsSend
  },
  SendMessageBatchCommand: class {
    constructor(public input: SqsBatchInput) {}
  },
}))

const { resolveByName, resolveNamesBatch, ensureStubLevels, enqueueSeedIds } =
  await import('./levelResolution')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

type SqsBatchInput = {
  QueueUrl: string
  Entries: { Id: string; MessageBody: string }[]
}

/** A `levels` row as the resolution queries select it. */
function dbLevel(
  inGameId: string,
  overrides: {
    name?: string
    creator?: string | null
    diff?: string | null
    stars?: number | null
  } = {}
) {
  return {
    inGameId,
    name: overrides.name ?? 'DeathMoon',
    creator: overrides.creator ?? null,
    inGameDifficulty: overrides.diff === undefined ? null : overrides.diff,
    stars: overrides.stars ?? null,
  }
}

/** A RobTop search hit. Only the fields the resolver reads are populated. */
function rtLevel(
  levelId: string,
  overrides: {
    name?: string
    creator?: string | null
    diff?: string | null
    stars?: number | null
  } = {}
): RobtopSearchResult {
  return {
    levelId,
    level: {
      name: overrides.name ?? 'DeathMoon',
      creator: overrides.creator ?? null,
      inGameDifficulty: overrides.diff === undefined ? null : overrides.diff,
      stars: overrides.stars ?? null,
    } as unknown as RobtopLevel,
  }
}

/** The `where`/`select` of the most recent level.findMany call. */
function lastFindManyArgs() {
  return prisma.level.findMany.mock.lastCall?.[0] as {
    where: { OR?: { name: { equals: string } }[]; name?: { equals: string } }
  }
}

/** The options passed to the most recent RobTop search. */
function lastSearchOptions(): RobtopSearchOptions {
  return mockSearchRobtopByName.mock.lastCall?.[1] ?? {}
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.level.findMany.mockReset().mockResolvedValue([] as never)
  mockSearchRobtopByName.mockReset().mockResolvedValue([])
  mockSqsSend.mockReset().mockResolvedValue({})
  vi.unstubAllEnvs()
})

// ─── resolveByName: DB path ──────────────────────────────────────────────────

describe('resolveByName — cache lookup', () => {
  it('resolves a unique cache hit without touching RobTop', async () => {
    prisma.level.findMany.mockResolvedValue([dbLevel('12345')] as never)

    await expect(resolveByName('DeathMoon')).resolves.toEqual({
      levelId: '12345',
    })
    expect(mockSearchRobtopByName).not.toHaveBeenCalled()
  })

  it('queries the cache case-insensitively by name', async () => {
    await resolveByName('deathmoon')
    expect(lastFindManyArgs().where).toMatchObject({
      name: { equals: 'deathmoon', mode: 'insensitive' },
    })
  })

  it('returns "ambiguous" for multiple hits with nothing to disambiguate on', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1'),
      dbLevel('2'),
    ] as never)

    await expect(resolveByName('DeathMoon')).resolves.toBe('ambiguous')
    expect(mockSearchRobtopByName).not.toHaveBeenCalled()
  })
})

// ─── resolveByName: creator tiebreaking ──────────────────────────────────────

describe('resolveByName — creator is a lenient tiebreaker', () => {
  it('narrows multiple hits to one by substring creator match', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { creator: 'Riot' }),
      dbLevel('2', { creator: 'Michigun' }),
    ] as never)

    await expect(resolveByName('DeathMoon', 'michi')).resolves.toEqual({
      levelId: '2',
    })
  })

  it('matches the creator case-insensitively', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { creator: 'Riot' }),
      dbLevel('2', { creator: 'Michigun' }),
    ] as never)

    await expect(resolveByName('DeathMoon', 'MICHIGUN')).resolves.toEqual({
      levelId: '2',
    })
  })

  it('stays ambiguous when the creator matches none of the candidates', async () => {
    // The column is fuzzy and often blank, so a non-match discards the hint
    // rather than the candidates — it must not resolve to an arbitrary one.
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { creator: 'Riot' }),
      dbLevel('2', { creator: 'Michigun' }),
    ] as never)

    await expect(resolveByName('DeathMoon', 'Nobody')).resolves.toBe(
      'ambiguous'
    )
  })

  it('does not use the creator to reject a single candidate', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { creator: 'Riot' }),
    ] as never)

    await expect(resolveByName('DeathMoon', 'SomeoneElse')).resolves.toEqual({
      levelId: '1',
    })
  })
})

// ─── resolveByName: difficulty is a hard filter ──────────────────────────────

describe('resolveByName — difficulty is a hard filter', () => {
  it('treats a bare tier and a suffixed tier as the same thing', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: 'Extreme Demon' }),
    ] as never)

    await expect(resolveByName('DeathMoon', null, 'Extreme')).resolves.toEqual({
      levelId: '1',
    })
    await expect(
      resolveByName('DeathMoon', null, 'extreme demon')
    ).resolves.toEqual({ levelId: '1' })
  })

  it('rejects a wrong-tier cache hit and falls through to RobTop', async () => {
    // The single-candidate case is the dangerous one: without the hard filter
    // this would resolve an Easy Demon row onto an Extreme Demon level.
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: 'Easy Demon' }),
    ] as never)

    await resolveByName('DeathMoon', null, 'Extreme Demon')
    expect(mockSearchRobtopByName).toHaveBeenCalled()
  })

  it('rejects a non-demon cache hit — InfernoLog only tracks demons', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: 'Insane' }),
    ] as never)

    await resolveByName('DeathMoon', null, 'Insane Demon')
    expect(mockSearchRobtopByName).toHaveBeenCalled()
  })

  it('gives an un-enriched stub (null difficulty) the benefit of the doubt', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: null }),
    ] as never)

    await expect(
      resolveByName('DeathMoon', null, 'Extreme Demon')
    ).resolves.toEqual({ levelId: '1' })
  })

  it('narrows multiple hits down to the matching tier', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: 'Easy Demon' }),
      dbLevel('2', { diff: 'Extreme Demon' }),
    ] as never)

    await expect(
      resolveByName('DeathMoon', null, 'Extreme Demon')
    ).resolves.toEqual({ levelId: '2' })
  })

  it.each([['not a difficulty'], [''], ['12']])(
    'ignores an unrecognized difficulty (%s) instead of filtering everything out',
    async (diff) => {
      prisma.level.findMany.mockResolvedValue([
        dbLevel('1', { diff: 'Easy Demon' }),
      ] as never)

      await expect(resolveByName('DeathMoon', null, diff)).resolves.toEqual({
        levelId: '1',
      })
    }
  )

  // "Auto"/"Normal"/"Harder" can't name a demon tier, so they read as non-demon
  // faces and DO filter — a sheet saying "Harder" must not land on a demon.
  it.each([['Auto'], ['Normal'], ['Harder']])(
    'excludes a demon candidate for the non-demon face %s',
    async (diff) => {
      prisma.level.findMany.mockResolvedValue([
        dbLevel('1', { diff: 'Easy Demon' }),
      ] as never)
      mockSearchRobtopByName.mockResolvedValue([])

      await expect(resolveByName('DeathMoon', null, diff)).resolves.toBeNull()
    }
  )

  // A face pins a BAND, not a count, so both counts in it must match.
  it.each([[4], [5]])(
    'matches a %s-star candidate against the face "Hard"',
    async (stars) => {
      prisma.level.findMany.mockResolvedValue([
        dbLevel('1', { diff: null, stars }),
      ] as never)

      await expect(
        resolveByName('DeathMoon', null, 'hard stars')
      ).resolves.toEqual({ levelId: '1' })
    }
  )

  // ...and an exact count must not match its band-mate.
  it('does not match a 5-star candidate against an exact 4', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: null, stars: 5 }),
    ] as never)
    mockSearchRobtopByName.mockResolvedValue([])

    await expect(resolveByName('DeathMoon', null, '4')).resolves.toBeNull()
  })

  // RobTop's own main levels get bespoke star awards that ignore the bands
  // (Dry Out is 4 stars but Normal), so neither field may veto the other there.
  it('accepts an official level whose label contradicts its star count', async () => {
    prisma.level.findMany.mockResolvedValue([
      // id 4 is Dry Out in data/officialLevels.ts: 4 stars, labelled Normal.
      dbLevel('4', { name: 'Dry Out', diff: 'Normal', stars: 4 }),
    ] as never)

    await expect(resolveByName('Dry Out', null, 'Normal')).resolves.toEqual({
      levelId: '4',
    })
  })

  it('still lets an official level match on its exact star count', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('4', { name: 'Dry Out', diff: 'Normal', stars: 4 }),
    ] as never)

    await expect(resolveByName('Dry Out', null, '4')).resolves.toEqual({
      levelId: '4',
    })
  })

  it('keeps the count authoritative for an ordinary level', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('9876543', { diff: 'Normal', stars: 4 }),
    ] as never)
    mockSearchRobtopByName.mockResolvedValue([])

    await expect(
      resolveByName('DeathMoon', null, 'Normal')
    ).resolves.toBeNull()
  })

  // A candidate with only a label is still testable, since the label's band
  // either contains the requested count or doesn't.
  it('rules a label-only candidate in or out by its band', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: 'Hard', stars: null }),
    ] as never)
    await expect(resolveByName('DeathMoon', null, '4')).resolves.toEqual({
      levelId: '1',
    })

    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { diff: 'Hard', stars: null }),
    ] as never)
    mockSearchRobtopByName.mockResolvedValue([])
    await expect(resolveByName('DeathMoon', null, '8')).resolves.toBeNull()
  })
})

// ─── resolveByName: RobTop fallback ──────────────────────────────────────────

describe('resolveByName — RobTop fallback', () => {
  it('returns the RobTop level alongside the id on a unique match', async () => {
    mockSearchRobtopByName.mockResolvedValue([rtLevel('99')])

    await expect(resolveByName('DeathMoon')).resolves.toEqual({
      levelId: '99',
      robtopLevel: expect.objectContaining({ name: 'DeathMoon' }),
    })
  })

  it('scopes the search by demon tier when the difficulty is known', async () => {
    await resolveByName('DeathMoon', null, 'Extreme Demon')
    expect(lastSearchOptions()).toEqual({ diff: '-2', demonFilter: '5' })
  })

  it.each([
    ['Easy', '1'],
    ['Medium', '2'],
    ['Hard', '3'],
    ['Insane', '4'],
    ['Extreme', '5'],
  ])('maps %s Demon to demonFilter %s', async (tier, filter) => {
    await resolveByName('DeathMoon', null, `${tier} Demon`)
    expect(lastSearchOptions()).toEqual({ diff: '-2', demonFilter: filter })
  })

  it('sends no difficulty scoping for an unrecognized value', async () => {
    await resolveByName('DeathMoon', null, 'Nonsense')
    expect(lastSearchOptions()).toEqual({})
  })

  // Non-demons are scoped by GD's own diff bucket, which is numbered separately
  // from the star count (Auto is 1 star but diff -3) and covers a whole band.
  it('scopes a non-demon star count to its GD diff bucket', async () => {
    await resolveByName('DeathMoon', null, '5')
    expect(lastSearchOptions()).toEqual({ diff: '3' }) // 5 stars = Hard

    await resolveByName('DeathMoon', null, '1')
    expect(lastSearchOptions()).toEqual({ diff: '-3' }) // 1 star = Auto
  })

  // Both counts in a band are the same GD query — the bucket is per-face.
  it('sends the same bucket for either count in a band', async () => {
    await resolveByName('DeathMoon', null, '4')
    const forFour = lastSearchOptions()
    await resolveByName('DeathMoon', null, '5')
    expect(lastSearchOptions()).toEqual(forFour)
  })

  // "Auto"/"Normal"/"Harder" can't be demon tiers, so they read as faces.
  it('reads an unambiguous non-demon face as its own bucket', async () => {
    await resolveByName('DeathMoon', null, 'Harder')
    expect(lastSearchOptions()).toEqual({ diff: '4' })
  })

  // "Easy" is both a demon tier and a 2-star face; the demon reading wins, per
  // the documented sheet convention.
  it('still reads a bare shared tier name as the demon tier', async () => {
    await resolveByName('DeathMoon', null, 'Easy')
    expect(lastSearchOptions()).toEqual({ diff: '-2', demonFilter: '1' })
  })

  it('discards keyword hits whose name is not an exact match', async () => {
    // The search is keyword-based, so "DeathMoon" also returns "DeathMoon V2".
    mockSearchRobtopByName.mockResolvedValue([
      rtLevel('98', { name: 'DeathMoon V2' }),
      rtLevel('97', { name: 'Not DeathMoon' }),
    ])

    await expect(resolveByName('DeathMoon')).resolves.toBeNull()
  })

  it('compares names trimmed and case-insensitively', async () => {
    // RobTop stores some names with stray surrounding whitespace.
    mockSearchRobtopByName.mockResolvedValue([
      rtLevel('99', { name: '  deathmoon ' }),
    ])

    await expect(resolveByName(' DeathMoon ')).resolves.toMatchObject({
      levelId: '99',
    })
  })

  it('re-applies the difficulty filter to the search results', async () => {
    // GD's own filter is not fully trustworthy, so the tier is re-checked.
    mockSearchRobtopByName.mockResolvedValue([
      rtLevel('99', { diff: 'Easy Demon' }),
    ])

    await expect(
      resolveByName('DeathMoon', null, 'Extreme Demon')
    ).resolves.toBeNull()
  })

  it('returns "ambiguous" for several equally good exact-name matches', async () => {
    mockSearchRobtopByName.mockResolvedValue([rtLevel('98'), rtLevel('99')])
    await expect(resolveByName('DeathMoon')).resolves.toBe('ambiguous')
  })

  it('breaks a tie on creator', async () => {
    mockSearchRobtopByName.mockResolvedValue([
      rtLevel('98', { creator: 'Riot' }),
      rtLevel('99', { creator: 'Michigun' }),
    ])

    await expect(resolveByName('DeathMoon', 'michi')).resolves.toMatchObject({
      levelId: '99',
    })
  })

  it('returns null when the search finds nothing', async () => {
    mockSearchRobtopByName.mockResolvedValue([])
    await expect(resolveByName('DeathMoon')).resolves.toBeNull()
  })
})

// ─── resolveNamesBatch ───────────────────────────────────────────────────────

describe('resolveNamesBatch', () => {
  it('returns results positionally aligned with the inputs', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { name: 'Alpha' }),
      dbLevel('2', { name: 'Beta' }),
    ] as never)
    mockSearchRobtopByName.mockResolvedValue([])

    await expect(
      resolveNamesBatch([
        { name: 'Beta' },
        { name: 'Unknown' },
        { name: 'Alpha' },
      ])
    ).resolves.toEqual([{ levelId: '2' }, null, { levelId: '1' }])
  })

  it('queries each distinct name once, however often it repeats', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { name: 'Alpha' }),
    ] as never)

    await resolveNamesBatch([
      { name: 'Alpha' },
      { name: 'alpha' },
      { name: ' Alpha ' },
    ])

    expect(prisma.level.findMany).toHaveBeenCalledTimes(1)
    expect(lastFindManyArgs().where.OR).toHaveLength(1)
  })

  it('resolves every occurrence of a repeated name', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { name: 'Alpha' }),
    ] as never)

    await expect(
      resolveNamesBatch([{ name: 'Alpha' }, { name: 'ALPHA' }])
    ).resolves.toEqual([{ levelId: '1' }, { levelId: '1' }])
  })

  it('chunks the lookup at 200 distinct names', async () => {
    const inputs = Array.from({ length: 201 }, (_, i) => ({ name: `L${i}` }))
    await resolveNamesBatch(inputs)

    expect(prisma.level.findMany).toHaveBeenCalledTimes(2)
    const first = prisma.level.findMany.mock.calls[0]![0] as {
      where: { OR: unknown[] }
    }
    expect(first.where.OR).toHaveLength(200)
    expect(lastFindManyArgs().where.OR).toHaveLength(1)
  })

  it('applies the same creator and difficulty rules as the single-name path', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { name: 'Alpha', diff: 'Easy Demon', creator: 'Riot' }),
      dbLevel('2', {
        name: 'Alpha',
        diff: 'Extreme Demon',
        creator: 'Michigun',
      }),
    ] as never)

    await expect(
      resolveNamesBatch([
        { name: 'Alpha', inGameDifficulty: 'Extreme Demon' },
        { name: 'Alpha', creator: 'riot' },
        { name: 'Alpha' },
      ])
    ).resolves.toEqual([{ levelId: '2' }, { levelId: '1' }, 'ambiguous'])
  })

  it('falls back to RobTop only for the cache misses', async () => {
    prisma.level.findMany.mockResolvedValue([
      dbLevel('1', { name: 'Alpha' }),
    ] as never)
    mockSearchRobtopByName.mockResolvedValue([rtLevel('99', { name: 'Beta' })])

    await expect(
      resolveNamesBatch([{ name: 'Alpha' }, { name: 'Beta' }])
    ).resolves.toEqual([
      { levelId: '1' },
      { levelId: '99', robtopLevel: expect.objectContaining({ name: 'Beta' }) },
    ])
    expect(mockSearchRobtopByName).toHaveBeenCalledTimes(1)
    expect(mockSearchRobtopByName).toHaveBeenCalledWith('Beta', {})
  })

  it('handles an empty input list without querying', async () => {
    await expect(resolveNamesBatch([])).resolves.toEqual([])
    expect(prisma.level.findMany).not.toHaveBeenCalled()
  })
})

// ─── ensureStubLevels ────────────────────────────────────────────────────────

describe('ensureStubLevels', () => {
  /** A minimal transaction client exposing just the level delegate. */
  function tx() {
    return {
      level: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
  }

  it('returns [] and issues no queries for an empty id list', async () => {
    const t = tx()
    await expect(ensureStubLevels(t as never, [])).resolves.toEqual([])
    expect(t.level.findMany).not.toHaveBeenCalled()
    expect(t.level.createMany).not.toHaveBeenCalled()
  })

  it('creates only the ids that are missing, and returns just those', async () => {
    const t = tx()
    t.level.findMany.mockResolvedValue([{ inGameId: '1' }])

    await expect(
      ensureStubLevels(t as never, ['1', '2', '3'])
    ).resolves.toEqual(['2', '3'])
    expect(t.level.createMany).toHaveBeenCalledWith({
      data: [
        { inGameId: '2', dataSource: 'manual', verified: false },
        { inGameId: '3', dataSource: 'manual', verified: false },
      ],
      skipDuplicates: true,
    })
  })

  it('writes nothing when every id already exists', async () => {
    const t = tx()
    t.level.findMany.mockResolvedValue([{ inGameId: '1' }, { inGameId: '2' }])

    await expect(ensureStubLevels(t as never, ['1', '2'])).resolves.toEqual([])
    expect(t.level.createMany).not.toHaveBeenCalled()
  })

  it('marks stubs unverified and manual so the seed worker picks them up', async () => {
    const t = tx()
    await ensureStubLevels(t as never, ['7'])

    const { data } = t.level.createMany.mock.calls[0]![0] as {
      data: { dataSource: string; verified: boolean }[]
    }
    expect(data).toEqual([
      { inGameId: '7', dataSource: 'manual', verified: false },
    ])
  })
})

// ─── enqueueSeedIds ──────────────────────────────────────────────────────────

describe('enqueueSeedIds', () => {
  /** All SendMessageBatchCommand inputs sent, in order. */
  function sentBatches(): SqsBatchInput[] {
    return mockSqsSend.mock.calls.map(
      (call) => (call[0] as { input: SqsBatchInput }).input
    )
  }

  it('is a no-op when LEVEL_SEED_QUEUE_URL is unset', async () => {
    // Degraded but not broken: stubs stay unenriched until the next sync.
    // Stubbed explicitly so the test does not depend on the ambient env.
    vi.stubEnv('LEVEL_SEED_QUEUE_URL', undefined)
    await enqueueSeedIds(['1', '2'])
    expect(mockSqsSend).not.toHaveBeenCalled()
  })

  it('is a no-op for an empty id list', async () => {
    vi.stubEnv('LEVEL_SEED_QUEUE_URL', 'https://sqs.test/queue')
    await enqueueSeedIds([])
    expect(mockSqsSend).not.toHaveBeenCalled()
  })

  it('packs 8 ids per message and targets the configured queue', async () => {
    vi.stubEnv('LEVEL_SEED_QUEUE_URL', 'https://sqs.test/queue')
    const ids = Array.from({ length: 20 }, (_, i) => String(i))

    await enqueueSeedIds(ids)

    const batches = sentBatches()
    expect(batches).toHaveLength(1)
    expect(batches[0]!.QueueUrl).toBe('https://sqs.test/queue')

    const entries = batches[0]!.Entries
    expect(entries).toHaveLength(3) // 8 + 8 + 4
    const bodies = entries.map(
      (e) => (JSON.parse(e.MessageBody) as { levelIds: string[] }).levelIds
    )
    expect(bodies.map((b) => b.length)).toEqual([8, 8, 4])
    expect(bodies.flat()).toEqual(ids)
  })

  it('splits into multiple sends past 10 messages per batch', async () => {
    vi.stubEnv('LEVEL_SEED_QUEUE_URL', 'https://sqs.test/queue')
    // 88 ids ⇒ 11 messages ⇒ one full send of 10 plus a send of 1.
    const ids = Array.from({ length: 88 }, (_, i) => String(i))

    await enqueueSeedIds(ids)

    const batches = sentBatches()
    expect(batches.map((b) => b.Entries.length)).toEqual([10, 1])
  })

  it('gives every entry within a send a unique Id', async () => {
    vi.stubEnv('LEVEL_SEED_QUEUE_URL', 'https://sqs.test/queue')
    const ids = Array.from({ length: 88 }, (_, i) => String(i))

    await enqueueSeedIds(ids)

    for (const batch of sentBatches()) {
      const entryIds = batch.Entries.map((e) => e.Id)
      expect(new Set(entryIds).size).toBe(entryIds.length)
    }
  })

  it('loses no ids across the split', async () => {
    vi.stubEnv('LEVEL_SEED_QUEUE_URL', 'https://sqs.test/queue')
    const ids = Array.from({ length: 88 }, (_, i) => String(i))

    await enqueueSeedIds(ids)

    const seen = sentBatches().flatMap((b) =>
      b.Entries.flatMap(
        (e) => (JSON.parse(e.MessageBody) as { levelIds: string[] }).levelIds
      )
    )
    expect(seen).toEqual(ids)
  })
})
