/**
 * Unit tests for the GDDL sync's two data-loss alarms.
 *
 * These exist because this exact failure has shipped twice. On 2026-07-22 the
 * worker was missing its queue env var and the reseed step silently no-op'd; on
 * 2026-08-08 that surfaced as 85 stranded stubs with no extended metadata. The
 * seed enqueue is the ONLY thing that ever fills a stub in — the level-cache
 * sync refreshes a few volatile fields and never backfills — so a failure here
 * is silent data loss, and these two alarms are the only tripwire.
 *
 * Everything external is mocked; this is about whether the alarms fire, not
 * about what the sync writes.
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

const {
  mockFetchUserInfo,
  mockFetchSubmissions,
  mockFetchRobtopResult,
  mockEnqueueSeedIds,
  mockFindOrCreateLp,
  mockRemoveFromWantToBeat,
} = vi.hoisted(() => ({
  mockFetchUserInfo: vi.fn(),
  mockFetchSubmissions: vi.fn(),
  mockFetchRobtopResult: vi.fn(),
  mockEnqueueSeedIds: vi.fn(),
  mockFindOrCreateLp: vi.fn(),
  mockRemoveFromWantToBeat: vi.fn(),
}))

vi.mock('../../utils/gddl', () => ({
  fetchGddlUserInfo: mockFetchUserInfo,
  fetchAllGddlSubmissions: mockFetchSubmissions,
  roundGddlTier: (n: number) => Math.round(n),
}))
vi.mock('../../utils/robtop', () => ({
  fetchRobtopLevelResult: mockFetchRobtopResult,
}))
vi.mock('../importExport/import', () => ({
  enqueueSeedIds: mockEnqueueSeedIds,
}))
vi.mock('../progress', () => ({
  findOrCreateLevelProgress: mockFindOrCreateLp,
}))
vi.mock('../collections', () => ({
  removeFromWantToBeat: mockRemoveFromWantToBeat,
}))
vi.mock('../levels/robtopMapping', () => ({
  buildRobtopCreateData: vi.fn((id: string) => ({ inGameId: id })),
}))

const { logger } = await import('../../utils/logger')
const { syncGddlSubmissions } = await import('./sync')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const mockCaptureException = vi.mocked(Sentry.captureException)
const mockCaptureMessage = vi.mocked(Sentry.captureMessage)

const USER_ID = 'user-1'
const API_KEY = 'gddl-key'

/** The alarm threshold in sync.ts — see STUB_BACKLOG_ALERT. */
const STUB_BACKLOG_ALERT = 10

/**
 * The transaction client the per-submission work runs against — every tx
 * method sync.ts calls. The alarms under test don't depend on what these
 * return; they just have to exist so a submission doesn't error out and get
 * counted as a skip instead of a stub.
 */
const tx = {
  level: { findUnique: vi.fn(), create: vi.fn() },
  levelProgress: { findUnique: vi.fn(), update: vi.fn() },
  progressUpdate: {
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}

/** `count` GDDL submissions, each for a distinct level id. */
function submissions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ID: i,
    Rating: 8,
    Enjoyment: 7,
    Proof: null,
    DateAdded: '2026-06-01T00:00:00Z',
    Level: { ID: 100000 + i, Rating: 8, Enjoyment: 7, Meta: { Name: `L${i}` } },
  }))
}

function run() {
  return syncGddlSubmissions(USER_ID, API_KEY)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchUserInfo.mockReset().mockResolvedValue({ id: 17251, name: 'Riot' })
  mockFetchSubmissions.mockReset().mockResolvedValue([])
  // Unreachable is what produces a stub without a RobTop snapshot — the state
  // both alarms are about.
  mockFetchRobtopResult.mockReset().mockResolvedValue({ status: 'unreachable' })
  mockEnqueueSeedIds.mockReset().mockResolvedValue(undefined)
  mockFindOrCreateLp.mockReset().mockResolvedValue({ id: 'lp-1' })
  mockRemoveFromWantToBeat.mockReset().mockResolvedValue(undefined)

  for (const model of Object.values(tx))
    for (const fn of Object.values(model)) fn.mockReset().mockResolvedValue({})
  tx.level.findUnique.mockResolvedValue(null)
  tx.levelProgress.findUnique.mockResolvedValue(null)
  tx.progressUpdate.findFirst.mockResolvedValue(null)

  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
})

// ─── the enqueue failure ─────────────────────────────────────────────────────

describe('syncGddlSubmissions — seed enqueue failure', () => {
  it('reports a failed enqueue to Sentry, not just the log', async () => {
    // Logging alone is what let the 2026-07-22 regression sit unnoticed.
    const error = new Error('sqs unavailable')
    mockFetchSubmissions.mockResolvedValue(submissions(1))
    mockEnqueueSeedIds.mockRejectedValue(error)

    await run()

    expect(mockCaptureException).toHaveBeenCalledWith(error)
    expect(logger.error).toHaveBeenCalled()
  })

  it('names the stranded level ids in the log context', async () => {
    // Without the ids the alert isn't actionable — you can't backfill what you
    // can't identify.
    mockFetchSubmissions.mockResolvedValue(submissions(2))
    mockEnqueueSeedIds.mockRejectedValue(new Error('sqs unavailable'))

    await run()

    const [context] = vi.mocked(logger.error).mock.lastCall as [
      { seedIds: string[] },
    ]
    expect(context.seedIds).toEqual(['100000', '100001'])
  })

  it('still returns a result rather than failing the whole sync', async () => {
    // The submissions were committed; the enqueue is a follow-up.
    mockFetchSubmissions.mockResolvedValue(submissions(1))
    mockEnqueueSeedIds.mockRejectedValue(new Error('sqs unavailable'))

    await expect(run()).resolves.toMatchObject({ created: 1 })
  })

  it('does not report anything when the enqueue succeeds', async () => {
    mockFetchSubmissions.mockResolvedValue(submissions(1))

    await run()

    expect(mockEnqueueSeedIds).toHaveBeenCalledWith(['100000'])
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('skips the enqueue entirely when nothing needs seeding', async () => {
    mockFetchSubmissions.mockResolvedValue([])

    await run()

    expect(mockEnqueueSeedIds).not.toHaveBeenCalled()
  })
})

// ─── the stub backlog alarm ──────────────────────────────────────────────────

describe('syncGddlSubmissions — stub backlog alarm', () => {
  it(`alerts once the run stubs ${STUB_BACKLOG_ALERT} levels without RobTop`, async () => {
    mockFetchSubmissions.mockResolvedValue(submissions(STUB_BACKLOG_ALERT))

    await run()

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('check the level-seed queue and DLQ'),
      'warning'
    )
  })

  it('stays quiet below the threshold', async () => {
    // Ordinary transient misses shouldn't page anyone.
    mockFetchSubmissions.mockResolvedValue(submissions(STUB_BACKLOG_ALERT - 1))

    await run()

    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('counts only stubs created for want of a RobTop snapshot', async () => {
    // A level RobTop answered for is fully seeded — counting it would fire the
    // alarm on a perfectly healthy run.
    mockFetchRobtopResult.mockResolvedValue({
      status: 'found',
      level: { name: 'DeathMoon', inGameDifficulty: 'Extreme Demon' },
    })
    mockFetchSubmissions.mockResolvedValue(submissions(STUB_BACKLOG_ALERT * 2))

    await run()

    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('reports the count and the queued total in the message', async () => {
    mockFetchSubmissions.mockResolvedValue(submissions(STUB_BACKLOG_ALERT))

    await run()

    const [message] = mockCaptureMessage.mock.lastCall as [string]
    expect(message).toContain(`stubbed ${STUB_BACKLOG_ALERT} level(s)`)
    expect(message).toContain('robtopDown=')
  })
})
