/**
 * Unit tests for the delisted-reverify slice.
 *
 * This is the pass that notices a delisted level has been reuploaded. The
 * distinction that matters is between GD answering "no such level" (still gone
 * — leave it delisted) and GD being unreachable (says nothing about the level,
 * so it must NOT be counted as confirmation). Conflating them is what would
 * make an outage look like mass confirmation of deletions. Prisma and the
 * RobTop client are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import * as Sentry from '@sentry/aws-serverless'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/aws-serverless', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockFetchResult } = vi.hoisted(() => ({ mockFetchResult: vi.fn() }))
vi.mock('../../utils/robtop', () => ({
  fetchRobtopLevel: vi.fn(),
  fetchRobtopLevelResult: mockFetchResult,
}))
vi.mock('./robtopMapping', () => ({
  buildRobtopCreateData: vi.fn(),
  buildRobtopRefreshData: vi.fn(() => ({})),
}))

const { runDelistedReverifySlice } = await import('./sync')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const mockCaptureException = vi.mocked(Sentry.captureException)

/** Seeds the slice with the given delisted level ids. */
function slice(ids: string[]) {
  prisma.level.findMany.mockResolvedValue(
    ids.map((inGameId) => ({ inGameId })) as never
  )
}

/** Runs with no pacing delay so the test doesn't wait on real timers. */
function run(size = 20) {
  return runDelistedReverifySlice(size, 0)
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.levelSyncCursor.findUnique.mockReset().mockResolvedValue(null)
  prisma.levelSyncCursor.upsert.mockReset().mockResolvedValue({} as never)
  prisma.level.findMany.mockReset().mockResolvedValue([] as never)
  prisma.level.update.mockReset().mockResolvedValue({} as never)
  mockFetchResult.mockReset().mockResolvedValue({ status: 'not_found' })
})

// ─── the empty slice ─────────────────────────────────────────────────────────

describe('runDelistedReverifySlice — nothing to do', () => {
  it('returns an empty result without calling GD', async () => {
    const result = await run()

    expect(result.processed).toBe(0)
    expect(mockFetchResult).not.toHaveBeenCalled()
  })

  it('does not advance the cursor when the slice was empty', async () => {
    // Advancing past nothing would skip levels on the next run.
    await run()

    expect(prisma.levelSyncCursor.upsert).not.toHaveBeenCalled()
  })
})

// ─── outcomes ────────────────────────────────────────────────────────────────

describe('runDelistedReverifySlice — outcomes', () => {
  it('un-delists a level that has reappeared', async () => {
    slice(['12345'])
    mockFetchResult.mockResolvedValue({
      status: 'found',
      level: { name: 'DeathMoon' },
    })

    const result = await run()

    expect(prisma.level.update).toHaveBeenCalledWith({
      where: { inGameId: '12345' },
      data: {
        delistedAt: null,
        missingSince: null,
        lastCheckedAt: expect.any(Date),
      },
    })
    expect(result.restored).toBe(1)
  })

  it('counts a confirmed absence as still gone, without writing', async () => {
    slice(['12345'])
    mockFetchResult.mockResolvedValue({ status: 'not_found' })

    const result = await run()

    expect(result.stillGone).toBe(1)
    expect(result.restored).toBe(0)
    expect(prisma.level.update).not.toHaveBeenCalled()
  })

  it('counts an unreachable check separately from a confirmed absence', async () => {
    // An outage says nothing about whether the level exists — treating it as
    // confirmation would read as mass deletion.
    slice(['12345'])
    mockFetchResult.mockResolvedValue({ status: 'unreachable' })

    const result = await run()

    expect(result.unreachable).toBe(1)
    expect(result.stillGone).toBe(0)
    expect(prisma.level.update).not.toHaveBeenCalled()
  })

  it('processes every id in the slice', async () => {
    slice(['1', '2', '3'])

    const result = await run()

    expect(result.processed).toBe(3)
    expect(mockFetchResult).toHaveBeenCalledTimes(3)
  })

  it('advances the cursor to the last id it handled', async () => {
    slice(['1', '2', '3'])

    await run()

    expect(prisma.levelSyncCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reverify' },
        create: { id: 'reverify', lastInGameId: '3' },
      })
    )
  })
})

// ─── failures ────────────────────────────────────────────────────────────────

describe('runDelistedReverifySlice — failures', () => {
  it('counts a thrown check as unreachable and keeps going', async () => {
    slice(['1', '2'])
    mockFetchResult
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ status: 'not_found' })

    const result = await run()

    expect(result.unreachable).toBe(1)
    expect(result.stillGone).toBe(1)
    expect(mockCaptureException).toHaveBeenCalled()
  })

  it('still advances the cursor after a failure', async () => {
    // Otherwise a permanently-broken level would block the slice forever.
    slice(['1', '2'])
    mockFetchResult.mockRejectedValue(new Error('boom'))

    await run()

    expect(prisma.levelSyncCursor.upsert).toHaveBeenCalled()
  })
})
