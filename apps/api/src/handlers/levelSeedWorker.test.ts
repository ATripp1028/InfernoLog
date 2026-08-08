/**
 * Unit tests for the level-seed worker's failure handling — specifically that
 * it only ever treats a level as permanently unseedable when GD actually says
 * so, and defers every transient failure to SQS redrive. Conflating those two
 * is what stranded the 2026-07-21 GDDL import as permanent stubs, so it is
 * worth pinning down. Prisma and RobTop are mocked; no DB, no network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { RobtopFetchResult, RobtopLevel } from '../utils/robtop'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/aws-serverless', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockFetch = vi.fn<(levelId: string) => Promise<RobtopFetchResult>>()
vi.mock('../utils/robtop', () => ({ fetchRobtopLevelResult: mockFetch }))

const { handler } = await import('./levelSeedWorker')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

// Only the fields robtopLevelFields reads are needed; the update payload is
// asserted by shape, not value.
const ROBTOP_LEVEL = {
  name: 'DeathMoon',
  length: 'Long',
  coins: 3,
  featureScore: 1000,
  platformer: false,
} as unknown as RobtopLevel

function event(levelIds: string[]) {
  return { Records: [{ body: JSON.stringify({ levelIds }) }] }
}

// Runs the handler to completion when it will hit the retry backoff, pushing
// the fake clock past both sleeps instead of waiting them out. Returns the
// settled promise for the caller to assert on.
function runUnreachable(levelIds: string[]): Promise<void> {
  const promise = handler(event(levelIds))
  // Swallow here so the rejection is never momentarily unhandled while we
  // advance the clock; the caller still asserts on `promise`.
  promise.catch(() => {})
  return vi.advanceTimersByTimeAsync(10_000).then(() => promise)
}

beforeEach(() => {
  vi.clearAllMocks()
  // The worker's retry backoff really sleeps 1s then 3s; the unreachable cases
  // drive it with `runUnreachable` below rather than waiting 4s apiece.
  vi.useFakeTimers()
  prisma.level.findUnique.mockResolvedValue(null as never)
  prisma.level.update.mockResolvedValue({} as never)
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── tests ───────────────────────────────────────────────────────────────────

describe('levelSeedWorker', () => {
  it('enriches a stub when RobTop returns the level', async () => {
    mockFetch.mockResolvedValue({ status: 'found', level: ROBTOP_LEVEL })

    await handler(event(['12345']))

    expect(prisma.level.update).toHaveBeenCalledTimes(1)
    const arg = prisma.level.update.mock.calls[0]![0]
    expect(arg.where).toEqual({ inGameId: '12345' })
    expect(arg.data).toMatchObject({
      length: 'Long',
      coins: 3,
      featureScore: 1000,
      dataSource: 'robtop_autofill',
      verified: true,
    })
  })

  it('retains the stub without retrying when GD has no such level', async () => {
    mockFetch.mockResolvedValue({ status: 'not_found' })

    await expect(handler(event(['12345']))).resolves.toBeUndefined()

    // Terminal on the first answer — no point asking three times, and no
    // redrive: the id will never resolve.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(prisma.level.update).not.toHaveBeenCalled()
  })

  it('fails the batch so SQS redrives it when RobTop is unreachable', async () => {
    mockFetch.mockResolvedValue({ status: 'unreachable' })

    await expect(runUnreachable(['12345'])).rejects.toThrow(/unreachable/i)

    // Exhausts the in-invocation retries first, then hands off to SQS.
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(prisma.level.update).not.toHaveBeenCalled()
  })

  it('commits the levels it did resolve before failing the batch', async () => {
    mockFetch.mockImplementation(async (levelId) =>
      levelId === '111'
        ? { status: 'found', level: ROBTOP_LEVEL }
        : { status: 'unreachable' }
    )

    await expect(runUnreachable(['111', '222'])).rejects.toThrow(/222/)

    // The successful write stands; the redrive re-attempts only what's still
    // outstanding, since the handler skips already-verified rows.
    expect(prisma.level.update).toHaveBeenCalledTimes(1)
    expect(prisma.level.update.mock.calls[0]![0].where).toEqual({
      inGameId: '111',
    })
  })

  it('skips a level another consumer already enriched', async () => {
    prisma.level.findUnique.mockResolvedValue({ verified: true } as never)

    await handler(event(['12345']))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(prisma.level.update).not.toHaveBeenCalled()
  })
})
