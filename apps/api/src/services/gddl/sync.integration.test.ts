/**
 * Integration tests for syncGddlSubmissions. All Prisma calls hit the local
 * test database (started by globalSetup). GDDL and RobTop HTTP calls are
 * mocked so the tests run without network access.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTestPrisma,
  seedUser,
  seedLevel,
  truncateAll,
} from '../../test/utils'
import type { GddlSubmission } from '../../utils/gddl'

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../utils/gddl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/gddl')>()
  return {
    ...actual,
    fetchGddlUserInfo: vi.fn(async () => ({ id: 17251, name: 'TestUser' })),
    fetchAllGddlSubmissions: vi.fn(async () => [] as GddlSubmission[]),
  }
})

vi.mock('../../utils/robtop', () => ({
  fetchRobtopLevel: vi.fn(async () => null),
}))

vi.mock('../importExport/import', () => ({
  enqueueSeedIds: vi.fn(async () => {}),
}))

// Import after vi.mock so that gddlSync picks up the mocked modules.
const { syncGddlSubmissions } = await import('../gddl/sync')
const { fetchAllGddlSubmissions } = await import('../../utils/gddl')
const { enqueueSeedIds } = await import('../importExport/import')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = getTestPrisma()
const mockFetchAll = fetchAllGddlSubmissions as unknown as ReturnType<
  typeof vi.fn
>
const mockEnqueueSeedIds = enqueueSeedIds as unknown as ReturnType<typeof vi.fn>

function makeSubmission(
  overrides: Partial<GddlSubmission> = {}
): GddlSubmission {
  return {
    ID: 1,
    Rating: 8,
    Enjoyment: 7,
    Proof: 'https://youtube.com/watch?v=abc',
    DateAdded: '2024-06-01T00:00:00.000Z',
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
        Song: { Name: 'Interlude' },
        Publisher: null,
      },
    },
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── tests ────────────────────────────────────────────────────────────────────

describe('syncGddlSubmissions', () => {
  it('creates a completion for a level already in the DB', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, {
      inGameId: '12345',
      inGameDifficulty: 'Extreme Demon',
    })
    mockFetchAll.mockResolvedValueOnce([makeSubmission()])

    const result = await syncGddlSubmissions(user.id, 'api-key')

    expect(result).toEqual({ created: 1, enriched: 0, skipped: 0, errors: [] })

    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '12345' } },
      include: { progressUpdates: true },
    })
    expect(lp.status).toBe('COMPLETED')
    const pu = lp.progressUpdates[0]!
    expect(pu.kind).toBe('COMPLETION')
    expect(pu.enjoyment).toBe(70) // 7 × 10
    expect(pu.videoUrl).toBe('https://youtube.com/watch?v=abc')
    // GDDL's "Rating" is the level's tier — stored as userGddlTier on LevelProgress.
    expect(lp.userGddlTier).toBe(8)
  })

  it('creates the level from GDDL metadata when RobTop is unavailable', async () => {
    const user = await seedUser(prisma)
    // No level seeded; RobTop mock returns null → falls back to GDDL Meta.Name.
    mockFetchAll.mockResolvedValueOnce([makeSubmission()])

    const result = await syncGddlSubmissions(user.id, 'api-key')

    expect(result.created).toBe(1)
    expect(result.errors).toHaveLength(0)

    const level = await prisma.level.findUnique({
      where: { inGameId: '12345' },
    })
    expect(level?.name).toBe('DeathMoon')
    expect(level?.dataSource).toBe('manual')
    expect(level?.verified).toBe(false)

    // The freshly-created stub is enqueued for async RobTop enrichment rather
    // than being left stranded until the next weekly sync.
    expect(mockEnqueueSeedIds).toHaveBeenCalledWith(['12345'])
  })

  it('re-enqueues a stub left behind by a prior import instead of treating it as already seeded', async () => {
    const user = await seedUser(prisma)
    // Simulates a level a previous GDDL import created when RobTop was
    // unreachable — it exists in the DB but was never actually enriched.
    await seedLevel(prisma, {
      inGameId: '12345',
      dataSource: 'manual',
      verified: false,
    })
    mockFetchAll.mockResolvedValueOnce([makeSubmission()])

    const result = await syncGddlSubmissions(user.id, 'api-key')

    expect(result.created).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockEnqueueSeedIds).toHaveBeenCalledWith(['12345'])
  })

  it('does not enqueue an already-verified level', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, {
      inGameId: '12345',
      inGameDifficulty: 'Extreme Demon',
    })
    mockFetchAll.mockResolvedValueOnce([makeSubmission()])

    await syncGddlSubmissions(user.id, 'api-key')

    expect(mockEnqueueSeedIds).not.toHaveBeenCalled()
  })

  it('maps GDDL official level IDs to GD in-game IDs', async () => {
    const user = await seedUser(prisma)
    // GDDL stores Clubstep as ID 1, but GD's real in-game ID is 14.
    await seedLevel(prisma, {
      inGameId: '14',
      name: 'Clubstep',
      inGameDifficulty: 'Hard Demon',
    })
    mockFetchAll.mockResolvedValueOnce([
      makeSubmission({ Level: { ID: 1 } as GddlSubmission['Level'] }),
    ])

    const result = await syncGddlSubmissions(user.id, 'api-key')

    expect(result.created).toBe(1)
    // Progress must be for level '14', not '1'.
    const lp = await prisma.levelProgress.findUnique({
      where: { userId_levelId: { userId: user.id, levelId: '14' } },
    })
    expect(lp).not.toBeNull()
    const wrongLp = await prisma.levelProgress.findUnique({
      where: { userId_levelId: { userId: user.id, levelId: '1' } },
    })
    expect(wrongLp).toBeNull()
  })

  it('enriches an existing completion, filling only null fields', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '12345' })

    // Pre-existing completion with no date, enjoyment, or video.
    const lp = await prisma.levelProgress.create({
      data: {
        userId: user.id,
        levelId: '12345',
        status: 'COMPLETED',
        visibility: 'PUBLIC',
      },
      select: { id: true },
    })
    const pu = await prisma.progressUpdate.create({
      data: {
        levelProgressId: lp.id,
        kind: 'COMPLETION',
        date: null,
        enjoyment: null,
        videoUrl: null,
      },
      select: { id: true },
    })

    mockFetchAll.mockResolvedValueOnce([makeSubmission()])
    const result = await syncGddlSubmissions(user.id, 'api-key')

    expect(result).toEqual({ created: 0, enriched: 1, skipped: 0, errors: [] })

    const updated = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: pu.id },
    })
    expect(updated.enjoyment).toBe(70)
    expect(updated.videoUrl).toBe('https://youtube.com/watch?v=abc')
  })

  it('does not overwrite already-populated fields during enrichment', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '12345' })

    const lp = await prisma.levelProgress.create({
      data: {
        userId: user.id,
        levelId: '12345',
        status: 'COMPLETED',
        visibility: 'PUBLIC',
      },
      select: { id: true },
    })
    const pu = await prisma.progressUpdate.create({
      data: {
        levelProgressId: lp.id,
        kind: 'COMPLETION',
        date: new Date('2023-01-01'), // already set — must not be overwritten
        enjoyment: 50,
        videoUrl: 'https://original.video',
      },
      select: { id: true },
    })
    mockFetchAll.mockResolvedValueOnce([makeSubmission()])
    const result = await syncGddlSubmissions(user.id, 'api-key')

    expect(result).toEqual({ created: 0, enriched: 0, skipped: 1, errors: [] })

    const unchanged = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: pu.id },
    })
    expect(unchanged.enjoyment).toBe(50) // unchanged
    expect(unchanged.videoUrl).toBe('https://original.video')
  })

  it('records a per-submission error and continues processing remaining submissions', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '12345' })

    const bad = makeSubmission({
      Level: {
        ID: 0, // 0 → level ID '0'; RobTop returns null; GDDL Meta.Name is empty → throws
        Rating: 5,
        Enjoyment: 5,
        Meta: {
          Name: '',
          Difficulty: 'Hard Demon',
          Length: 3,
          Rarity: 1,
          IsTwoPlayer: false,
          Song: { Name: '' },
          Publisher: null,
        },
      },
    })
    const good = makeSubmission() // levelId '12345' exists in DB

    mockFetchAll.mockResolvedValueOnce([bad, good])
    const result = await syncGddlSubmissions(user.id, 'api-key')

    expect(result.created).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.levelId).toBe('0')
  })

  it('propagates GddlUnavailableError when the submissions fetch fails', async () => {
    const user = await seedUser(prisma)
    const { GddlUnavailableError } =
      (await import('../../utils/gddl')) as typeof import('../../utils/gddl')
    mockFetchAll.mockRejectedValueOnce(
      new GddlUnavailableError('GDDL returned 503')
    )

    await expect(
      syncGddlSubmissions(user.id, 'api-key')
    ).rejects.toBeInstanceOf(GddlUnavailableError)
  })
})
