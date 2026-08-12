/**
 * Unit tests for the import batch orchestrator.
 *
 * The integration suite already covers what a batch persists. What it can't
 * easily reach are the pre-transaction phases and the per-row outcome
 * bookkeeping: name resolution failing, intra-batch supersession (two rows in
 * one sheet targeting the same event — only the last should win), and a single
 * row throwing without taking the batch down. Those all decide what the review
 * UI shows, and all fail silently if they regress. The planners, resolvers and
 * Prisma are mocked; this is about orchestration, not about what gets written.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { ImportCommitRow } from '@infernolog/core'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('../../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const {
  mockResolveByName,
  mockEnsureStubLevels,
  mockEnqueueSeedIds,
  mockFetchGddlTier,
  mockRemoveFromWantToBeat,
  mockPlanCompletion,
  mockPlanProgress,
  mockPlanDrop,
} = vi.hoisted(() => ({
  mockResolveByName: vi.fn(),
  mockEnsureStubLevels: vi.fn(),
  mockEnqueueSeedIds: vi.fn(),
  mockFetchGddlTier: vi.fn(),
  mockRemoveFromWantToBeat: vi.fn(),
  mockPlanCompletion: vi.fn(),
  mockPlanProgress: vi.fn(),
  mockPlanDrop: vi.fn(),
}))

vi.mock('./levelResolution', () => ({
  resolveByName: mockResolveByName,
  ensureStubLevels: mockEnsureStubLevels,
  enqueueSeedIds: mockEnqueueSeedIds,
}))
vi.mock('../../../utils/gddl', () => ({ fetchGddlTier: mockFetchGddlTier }))
vi.mock('../../collections', () => ({
  removeFromWantToBeat: mockRemoveFromWantToBeat,
}))
vi.mock('../../levels/robtopMapping', () => ({
  buildRobtopRefreshData: vi.fn(() => ({ verified: true })),
}))

// planEvents/planWrites are exercised by their own unit tests; here they are
// stubbed so a row's outcome is whatever the planner says it is.
vi.mock('./planEvents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./planEvents')>()
  return {
    ...actual,
    planProgress: mockPlanProgress,
    planDrop: mockPlanDrop,
  }
})
vi.mock('./planWrites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./planWrites')>()
  return { ...actual, planCompletion: mockPlanCompletion }
})

const { processImportJobBatch } = await import('./processBatch')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = 'user-1'
const JOB_ID = 'job-1'

/** The transaction client the flush runs against. */
const tx = {
  level: { update: vi.fn() },
  levelProgress: { createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  progressUpdate: {
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  ratingScore: { createMany: vi.fn(), deleteMany: vi.fn() },
  collectionEntry: { deleteMany: vi.fn() },
  importJobRow: { update: vi.fn() },
  importJob: { update: vi.fn() },
}

function row(
  type: 'completion' | 'progress' | 'dropped',
  rowIndex: number,
  data: Record<string, unknown> = {}
): ImportCommitRow {
  return { type, rowIndex, data } as unknown as ImportCommitRow
}

/** Runs a batch, wrapping each row as its own pending DB row. */
function run(rows: ImportCommitRow[]) {
  return processImportJobBatch(
    USER_ID,
    JOB_ID,
    rows.map((r) => ({
      id: `dbrow-${r.rowIndex}`,
      rowIndex: r.rowIndex,
      rawData: r,
    }))
  )
}

/** The outcome for one row index. */
function outcomeFor(
  result: Awaited<ReturnType<typeof run>>,
  rowIndex: number
) {
  return result.outcomes.find((o) => o.rowIndex === rowIndex)!
}

/** The importJobRow.update payload written for a row index. */
function persistedRow(rowIndex: number): Record<string, unknown> {
  const call = tx.importJobRow.update.mock.calls.find(
    (c) => (c[0] as { where: { id: string } }).where.id === `dbrow-${rowIndex}`
  )
  return (call![0] as { data: Record<string, unknown> }).data
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(tx))
    for (const fn of Object.values(model)) fn.mockReset().mockResolvedValue({})

  prisma.level.findMany.mockReset().mockResolvedValue([] as never)
  prisma.levelProgress.findMany.mockReset().mockResolvedValue([] as never)
  prisma.progressUpdate.findMany.mockReset().mockResolvedValue([] as never)
  prisma.collection.findFirst.mockReset().mockResolvedValue(null)
  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )

  mockResolveByName.mockReset().mockResolvedValue({ levelId: '999' })
  mockEnsureStubLevels.mockReset().mockResolvedValue([])
  mockEnqueueSeedIds.mockReset().mockResolvedValue(undefined)
  mockFetchGddlTier.mockReset().mockResolvedValue(null)
  mockRemoveFromWantToBeat.mockReset().mockResolvedValue(undefined)
  mockPlanCompletion.mockReset().mockReturnValue({ status: 'committed' })
  mockPlanProgress.mockReset().mockReturnValue({ status: 'committed' })
  mockPlanDrop.mockReset().mockReturnValue({ status: 'committed' })
})

// ─── name resolution ─────────────────────────────────────────────────────────

describe('processImportJobBatch — name resolution', () => {
  it('resolves a name-only row and plans it against the resolved id', async () => {
    mockResolveByName.mockResolvedValue({ levelId: '999' })

    const result = await run([row('completion', 0, { levelName: 'DeathMoon' })])

    expect(outcomeFor(result, 0).status).toBe('committed')
    expect(mockPlanCompletion.mock.lastCall?.[1]).toBe('999')
  })

  it('does not resolve a row that already has a level id', async () => {
    await run([row('completion', 0, { levelId: '12345' })])

    expect(mockResolveByName).not.toHaveBeenCalled()
  })

  it('passes the creator and difficulty through as disambiguators', async () => {
    await run([
      row('completion', 0, {
        levelName: 'DeathMoon',
        creator: 'Riot',
        inGameDifficulty: 'Extreme Demon',
      }),
    ])

    expect(mockResolveByName).toHaveBeenCalledWith(
      'DeathMoon',
      'Riot',
      'Extreme Demon'
    )
  })

  it('fails an ambiguous row with an actionable reason', async () => {
    mockResolveByName.mockResolvedValue('ambiguous')

    const result = await run([row('completion', 0, { levelName: 'DeathMoon' })])

    expect(outcomeFor(result, 0)).toMatchObject({ status: 'failed' })
    expect(outcomeFor(result, 0).reason).toContain('Ambiguous')
    expect(mockPlanCompletion).not.toHaveBeenCalled()
  })

  it('fails an unresolvable row', async () => {
    mockResolveByName.mockResolvedValue(null)

    const result = await run([row('completion', 0, { levelName: 'Nope' })])

    expect(outcomeFor(result, 0)).toMatchObject({ status: 'failed' })
    expect(outcomeFor(result, 0).reason).toContain('Level not found')
  })

  it('fails a row carrying neither an id nor a name', async () => {
    const result = await run([row('completion', 0, {})])

    expect(outcomeFor(result, 0)).toMatchObject({
      status: 'failed',
      reason: 'No level_id or level_name provided',
    })
  })

  it('lets the rest of the batch through when one row fails to resolve', async () => {
    mockResolveByName.mockResolvedValue(null)

    const result = await run([
      row('completion', 0, { levelName: 'Nope' }),
      row('completion', 1, { levelId: '12345' }),
    ])

    expect(outcomeFor(result, 0).status).toBe('failed')
    expect(outcomeFor(result, 1).status).toBe('committed')
  })

  it('enriches a freshly stubbed level with the RobTop data it resolved', async () => {
    // Saves the seed worker a round-trip for name-resolved levels.
    mockResolveByName.mockResolvedValue({
      levelId: '999',
      robtopLevel: { inGameDifficulty: 'Extreme Demon', coins: 3 },
    })
    mockEnsureStubLevels.mockResolvedValue(['999'])

    await run([row('completion', 0, { levelName: 'DeathMoon' })])

    expect(tx.level.update).toHaveBeenCalledWith({
      where: { inGameId: '999' },
      data: { verified: true },
    })
    // Already enriched, so it drops out of the seed queue.
    expect(mockEnqueueSeedIds).not.toHaveBeenCalled()
  })

  it('still queues stubs it could not enrich', async () => {
    mockEnsureStubLevels.mockResolvedValue(['12345'])

    await run([row('completion', 0, { levelId: '12345' })])

    expect(mockEnqueueSeedIds).toHaveBeenCalledWith(['12345'])
  })

  it('survives a failure to queue the stubs', async () => {
    // The rows are already written; enrichment is best-effort.
    mockEnsureStubLevels.mockResolvedValue(['12345'])
    mockEnqueueSeedIds.mockRejectedValue(new Error('sqs down'))

    const result = await run([row('completion', 0, { levelId: '12345' })])

    expect(outcomeFor(result, 0).status).toBe('committed')
  })
})

// ─── intra-batch supersession ────────────────────────────────────────────────

describe('processImportJobBatch — supersession within one batch', () => {
  it('keeps only the last row targeting one progress id', async () => {
    // Two edits of the same entry in one sheet: applying both would make the
    // first a wasted write whose outcome contradicts the second.
    const result = await run([
      row('progress', 0, { levelId: '1', progressId: 'pu-1', notes: 'first' }),
      row('progress', 1, { levelId: '1', progressId: 'pu-1', notes: 'second' }),
    ])

    expect(outcomeFor(result, 0)).toMatchObject({ status: 'skipped' })
    expect(outcomeFor(result, 0).reason).toContain('Superseded')
    expect(outcomeFor(result, 1).status).toBe('committed')
    expect(mockPlanProgress).toHaveBeenCalledTimes(1)
  })

  it('keeps only the last row sharing a derived key on one level', async () => {
    const shared = { levelId: '1', date: '2026-08-12', percentage: 35 }

    const result = await run([
      row('progress', 0, shared),
      row('progress', 1, shared),
    ])

    expect(outcomeFor(result, 0).status).toBe('skipped')
    expect(outcomeFor(result, 1).status).toBe('committed')
  })

  it('does not supersede rows whose derived keys differ', async () => {
    const result = await run([
      row('progress', 0, { levelId: '1', date: '2026-08-12', percentage: 35 }),
      row('progress', 1, { levelId: '1', date: '2026-08-13', percentage: 40 }),
    ])

    expect(outcomeFor(result, 0).status).toBe('committed')
    expect(outcomeFor(result, 1).status).toBe('committed')
  })

  it('does not supersede the same key across different levels', async () => {
    const shared = { date: '2026-08-12', percentage: 35 }

    const result = await run([
      row('progress', 0, { ...shared, levelId: '1' }),
      row('progress', 1, { ...shared, levelId: '2' }),
    ])

    expect(outcomeFor(result, 0).status).toBe('committed')
    expect(outcomeFor(result, 1).status).toBe('committed')
  })

  it('does not supersede keyless rows', async () => {
    // No date/percentage/run data means nothing to match on, so two blank
    // rows are two separate events.
    const result = await run([
      row('progress', 0, { levelId: '1' }),
      row('progress', 1, { levelId: '1' }),
    ])

    expect(outcomeFor(result, 0).status).toBe('committed')
    expect(outcomeFor(result, 1).status).toBe('committed')
  })

  it('applies the same rule to drops', async () => {
    const result = await run([
      row('dropped', 0, { levelId: '1', dropId: 'pu-1' }),
      row('dropped', 1, { levelId: '1', dropId: 'pu-1' }),
    ])

    expect(outcomeFor(result, 0).status).toBe('skipped')
    expect(outcomeFor(result, 1).status).toBe('committed')
  })

  it('keeps only the last completion for a level', async () => {
    // A level has at most one completion, so two rows can't both apply.
    const result = await run([
      row('completion', 0, { levelId: '1' }),
      row('completion', 1, { levelId: '1' }),
    ])

    expect(outcomeFor(result, 0).status).toBe('skipped')
    expect(outcomeFor(result, 1).status).toBe('committed')
    expect(mockPlanCompletion).toHaveBeenCalledTimes(1)
  })
})

// ─── per-row failure isolation ───────────────────────────────────────────────

describe('processImportJobBatch — a row that throws', () => {
  it('fails that row alone and keeps the batch going', async () => {
    mockPlanCompletion
      .mockImplementationOnce(() => {
        throw new Error('planner exploded')
      })
      .mockReturnValue({ status: 'committed' })

    const result = await run([
      row('completion', 0, { levelId: '1' }),
      row('completion', 1, { levelId: '2' }),
    ])

    expect(outcomeFor(result, 0)).toMatchObject({
      status: 'failed',
      reason: 'planner exploded',
    })
    expect(outcomeFor(result, 1).status).toBe('committed')
  })

  it('records a non-Error throw as an unknown error', async () => {
    mockPlanCompletion.mockImplementation(() => {
      throw 'a string'
    })

    const result = await run([row('completion', 0, { levelId: '1' })])

    expect(outcomeFor(result, 0)).toMatchObject({
      status: 'failed',
      reason: 'Unknown error',
    })
  })
})

// ─── outcome bookkeeping ─────────────────────────────────────────────────────

describe('processImportJobBatch — recording outcomes', () => {
  it('writes each row’s status back with its identifiers', async () => {
    await run([row('completion', 0, { levelId: '1', levelName: 'DeathMoon' })])

    expect(persistedRow(0)).toMatchObject({
      status: 'committed',
      levelName: 'DeathMoon',
      identifier: '1',
    })
  })

  it('surfaces an issue message for a failed row', async () => {
    mockResolveByName.mockResolvedValue(null)

    await run([row('completion', 0, { levelName: 'Nope' })])

    expect(persistedRow(0).issueMessage).toContain('Level not found')
  })

  it('surfaces an issue message for a flagged committed row', async () => {
    mockPlanProgress.mockReturnValue({
      status: 'committed',
      reason: 'Possible duplicate',
      flagged: true,
    })

    await run([row('progress', 0, { levelId: '1' })])

    expect(persistedRow(0).issueMessage).toBe('Possible duplicate')
  })

  it('leaves a routine skip unflagged so it does not ask for review', async () => {
    // A plain skip covers expected outcomes — an explicit drop resolution, an
    // exact-duplicate re-import, supersession — none needing a second look.
    mockPlanProgress.mockReturnValue({
      status: 'skipped',
      reason: 'Duplicate of an existing entry',
    })

    await run([row('progress', 0, { levelId: '1' })])

    expect(persistedRow(0).issueMessage).toBeNull()
  })

  it('advances the job’s processed count by the batch size', async () => {
    await run([
      row('completion', 0, { levelId: '1' }),
      row('completion', 1, { levelId: '2' }),
    ])

    expect(tx.importJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { processedRows: { increment: 2 } },
    })
  })

  it('flushes everything in one transaction', async () => {
    await run([row('completion', 0, { levelId: '1' })])

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

// ─── GDDL tier prefetch ──────────────────────────────────────────────────────

describe('processImportJobBatch — GDDL tier autofill', () => {
  it('fetches a tier for a completion that did not supply one', async () => {
    mockFetchGddlTier.mockResolvedValue(18)

    await run([row('completion', 0, { levelId: '12345' })])

    expect(mockFetchGddlTier).toHaveBeenCalledWith('12345')
  })

  it('does not fetch when the sheet already gave a tier', async () => {
    await run([row('completion', 0, { levelId: '12345', userGddlTier: 18 })])

    expect(mockFetchGddlTier).not.toHaveBeenCalled()
  })

  it('does not fetch for progress or drop rows', async () => {
    // Only completions carry a GDDL tier.
    await run([
      row('progress', 0, { levelId: '1' }),
      row('dropped', 1, { levelId: '2' }),
    ])

    expect(mockFetchGddlTier).not.toHaveBeenCalled()
  })
})
