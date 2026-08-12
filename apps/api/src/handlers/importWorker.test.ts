/**
 * Unit tests for the spreadsheet import worker.
 *
 * This handler's whole job is surviving Lambda's time limit: it batches, it
 * checkpoints to Postgres, and it re-invokes itself rather than dying
 * mid-import. The tests pin the two ends of that — that it does re-invoke when
 * time runs short, and that the reinvoke cap actually terminates a permanently
 * stuck job instead of looping forever — plus that a crash always lands the job
 * in `failed` rather than leaving it `running` forever, which would hang the
 * frontend's poll indefinitely. Prisma, Lambda and the services are mocked.
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

vi.mock('../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/aws-serverless', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const {
  mockProcessBatch,
  mockCommitRanking,
  mockCommitCollections,
  mockCommitRatings,
  mockLambdaSend,
} = vi.hoisted(() => ({
  mockProcessBatch: vi.fn(),
  mockCommitRanking: vi.fn(),
  mockCommitCollections: vi.fn(),
  mockCommitRatings: vi.fn(),
  mockLambdaSend: vi.fn(),
}))

vi.mock('../services/importExport/import', () => ({
  processImportJobBatch: mockProcessBatch,
}))
vi.mock('../services/importExport/ranking', () => ({
  commitImportRanking: mockCommitRanking,
}))
vi.mock('../services/importExport/collections', () => ({
  commitImportCollections: mockCommitCollections,
}))
vi.mock('../services/importExport/ratings', () => ({
  commitImportRatings: mockCommitRatings,
}))
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = mockLambdaSend
  },
  InvokeCommand: class {
    constructor(
      public input: { FunctionName: string; InvocationType: string; Payload: Uint8Array }
    ) {}
  },
}))

const { handler } = await import('./importWorker')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const mockCaptureException = vi.mocked(Sentry.captureException)

const JOB_ID = 'job-1'
const USER_ID = 'user-1'
const SELF_ARN = 'arn:aws:lambda:us-east-1:1234:function:import-worker'

/** A stored ImportJob, with only the fields the worker reads. */
function job(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    userId: USER_ID,
    status: 'running',
    rankingPayload: null,
    collectionsPayload: null,
    ratingsPayload: null,
    ...overrides,
  }
}

/**
 * A Lambda context. `remaining` is returned by every
 * getRemainingTimeInMillis call — under 60s triggers the checkpoint path.
 */
function context(remaining = 300_000) {
  return {
    invokedFunctionArn: SELF_ARN,
    getRemainingTimeInMillis: () => remaining,
  }
}

/** Queues N pending-row batches, then an empty one to end the loop. */
function queueBatches(...batches: number[]) {
  for (const size of batches) {
    prisma.importJobRow.findMany.mockResolvedValueOnce(
      Array.from({ length: size }, (_, i) => ({
        id: `row-${i}`,
        rowIndex: i,
        rawData: {},
      })) as never
    )
  }
  prisma.importJobRow.findMany.mockResolvedValue([] as never)
}

/** The `data` of the most recent importJob.update. */
function lastJobUpdate(): Record<string, unknown> {
  return (prisma.importJob.update.mock.lastCall?.[0] as { data: Record<string, unknown> })
    .data
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.importJob.findUnique.mockReset().mockResolvedValue(job() as never)
  prisma.importJob.update.mockReset().mockResolvedValue({ reinvokeCount: 1 } as never)
  prisma.importJobRow.findMany.mockReset().mockResolvedValue([] as never)
  mockProcessBatch.mockReset().mockResolvedValue(undefined)
  mockCommitRanking.mockReset().mockResolvedValue({ placed: 1 })
  mockCommitCollections.mockReset().mockResolvedValue({ added: 1 })
  mockCommitRatings.mockReset().mockResolvedValue({ applied: 1 })
  mockLambdaSend.mockReset().mockResolvedValue({})
})

// ─── early exits ─────────────────────────────────────────────────────────────

describe('importWorker — early exits', () => {
  it('does nothing when the job is gone', async () => {
    // Superseded by a newer import, which cascade-deleted this one.
    prisma.importJob.findUnique.mockResolvedValue(null)

    await handler({ jobId: JOB_ID }, context())

    expect(prisma.importJobRow.findMany).not.toHaveBeenCalled()
    expect(prisma.importJob.update).not.toHaveBeenCalled()
  })

  it.each(['completed', 'failed'])(
    'does nothing when the job is already %s',
    async (status) => {
      // A duplicate invoke must not reprocess or re-finish a settled job.
      prisma.importJob.findUnique.mockResolvedValue(job({ status }) as never)

      await handler({ jobId: JOB_ID }, context())

      expect(prisma.importJobRow.findMany).not.toHaveBeenCalled()
      expect(prisma.importJob.update).not.toHaveBeenCalled()
    }
  )
})

// ─── batching ────────────────────────────────────────────────────────────────

describe('importWorker — batching', () => {
  it('processes batches until none are pending', async () => {
    queueBatches(50, 50, 12)

    await handler({ jobId: JOB_ID }, context())

    expect(mockProcessBatch).toHaveBeenCalledTimes(3)
    expect(lastJobUpdate()).toMatchObject({ status: 'completed' })
  })

  it('pulls 50 pending rows at a time, in row order', async () => {
    queueBatches(50)

    await handler({ jobId: JOB_ID }, context())

    expect(prisma.importJobRow.findMany).toHaveBeenCalledWith({
      where: { jobId: JOB_ID, status: 'pending' },
      orderBy: { rowIndex: 'asc' },
      take: 50,
    })
  })

  it('hands the batch to the service with the job’s owner', async () => {
    // The userId comes off the job, never off the invoke payload.
    queueBatches(2)

    await handler({ jobId: JOB_ID }, context())

    expect(mockProcessBatch).toHaveBeenCalledWith(USER_ID, JOB_ID, [
      { id: 'row-0', rowIndex: 0, rawData: {} },
      { id: 'row-1', rowIndex: 1, rawData: {} },
    ])
  })

  it('completes immediately when there is nothing pending', async () => {
    await handler({ jobId: JOB_ID }, context())

    expect(mockProcessBatch).not.toHaveBeenCalled()
    expect(lastJobUpdate()).toMatchObject({ status: 'completed' })
  })
})

// ─── self-reinvocation ───────────────────────────────────────────────────────

describe('importWorker — checkpointing', () => {
  it('re-invokes itself with the same jobId when time runs short', async () => {
    queueBatches(50, 50)

    await handler({ jobId: JOB_ID }, context(30_000))

    // One batch, then the checkpoint — not the second batch.
    expect(mockProcessBatch).toHaveBeenCalledTimes(1)
    const { input } = mockLambdaSend.mock.lastCall?.[0] as {
      input: { FunctionName: string; InvocationType: string; Payload: Uint8Array }
    }
    expect(input.FunctionName).toBe(SELF_ARN)
    expect(input.InvocationType).toBe('Event')
    expect(JSON.parse(Buffer.from(input.Payload).toString())).toEqual({
      jobId: JOB_ID,
    })
  })

  it('does not mark the job completed when it checkpoints', async () => {
    // The resumed invocation finishes it; finishing here would strand rows.
    queueBatches(50, 50)

    await handler({ jobId: JOB_ID }, context(30_000))

    expect(lastJobUpdate()).not.toMatchObject({ status: 'completed' })
  })

  it('counts the reinvocation before deciding to continue', async () => {
    queueBatches(50, 50)

    await handler({ jobId: JOB_ID }, context(30_000))

    expect(prisma.importJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { reinvokeCount: { increment: 1 } },
      select: { reinvokeCount: true },
    })
  })

  it('does not checkpoint while there is plenty of time left', async () => {
    queueBatches(50)

    await handler({ jobId: JOB_ID }, context(300_000))

    expect(mockLambdaSend).not.toHaveBeenCalled()
  })

  it('fails the job instead of re-invoking past the cap', async () => {
    // A permanently stuck row would otherwise reinvoke forever.
    queueBatches(50, 50)
    prisma.importJob.update.mockResolvedValue({ reinvokeCount: 21 } as never)

    await handler({ jobId: JOB_ID }, context(30_000))

    expect(mockLambdaSend).not.toHaveBeenCalled()
    expect(lastJobUpdate()).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('timed out'),
    })
  })

  it('still re-invokes at exactly the cap', async () => {
    queueBatches(50, 50)
    prisma.importJob.update.mockResolvedValue({ reinvokeCount: 20 } as never)

    await handler({ jobId: JOB_ID }, context(30_000))

    expect(mockLambdaSend).toHaveBeenCalledTimes(1)
  })
})

// ─── one-shot tabs ───────────────────────────────────────────────────────────

describe('importWorker — the one-shot tabs', () => {
  it('skips every tab pass the sheet did not include', async () => {
    await handler({ jobId: JOB_ID }, context())

    expect(mockCommitRanking).not.toHaveBeenCalled()
    expect(mockCommitCollections).not.toHaveBeenCalled()
    expect(mockCommitRatings).not.toHaveBeenCalled()
    const data = lastJobUpdate()
    expect(data).not.toHaveProperty('rankingResult')
    expect(data).not.toHaveProperty('collectionsResult')
    expect(data).not.toHaveProperty('ratingsResult')
  })

  it('runs each tab pass that has a payload, and stores its result', async () => {
    prisma.importJob.findUnique.mockResolvedValue(
      job({
        rankingPayload: [{ levelId: '1' }],
        collectionsPayload: [{ levelId: '2' }],
        ratingsPayload: [{ levelId: '3' }],
      }) as never
    )

    await handler({ jobId: JOB_ID }, context())

    expect(mockCommitRanking).toHaveBeenCalledWith(USER_ID, [{ levelId: '1' }])
    expect(mockCommitCollections).toHaveBeenCalledWith(USER_ID, [{ levelId: '2' }])
    expect(mockCommitRatings).toHaveBeenCalledWith(USER_ID, [{ levelId: '3' }])
    expect(lastJobUpdate()).toMatchObject({
      status: 'completed',
      rankingResult: { placed: 1 },
      collectionsResult: { added: 1 },
      ratingsResult: { applied: 1 },
    })
  })

  it('runs the tab passes only after every row is processed', async () => {
    queueBatches(50, 50)
    prisma.importJob.findUnique.mockResolvedValue(
      job({ rankingPayload: [{ levelId: '1' }] }) as never
    )

    await handler({ jobId: JOB_ID }, context(30_000))

    // Checkpointed mid-import, so ranking must not have run yet.
    expect(mockCommitRanking).not.toHaveBeenCalled()
  })

  it('stamps a finish time on completion', async () => {
    await handler({ jobId: JOB_ID }, context())

    expect(lastJobUpdate().finishedAt).toBeInstanceOf(Date)
  })
})

// ─── failure handling ────────────────────────────────────────────────────────

describe('importWorker — failure handling', () => {
  it('marks the job failed and reports, rather than leaving it running', async () => {
    // A job stuck at `running` would poll forever in the frontend.
    queueBatches(10)
    const error = new Error('row exploded')
    mockProcessBatch.mockRejectedValue(error)

    await handler({ jobId: JOB_ID }, context())

    expect(mockCaptureException).toHaveBeenCalledWith(error)
    expect(lastJobUpdate()).toMatchObject({
      status: 'failed',
      error: 'Import failed due to an internal error.',
    })
  })

  it('does not leak the internal error message to the user-facing field', async () => {
    queueBatches(10)
    mockProcessBatch.mockRejectedValue(new Error('connection string is bad'))

    await handler({ jobId: JOB_ID }, context())

    expect(lastJobUpdate().error).not.toContain('connection string')
  })

  it('never throws, even when the failure write itself fails', async () => {
    // Throwing would make Lambda retry the whole job from the top.
    queueBatches(10)
    mockProcessBatch.mockRejectedValue(new Error('row exploded'))
    prisma.importJob.update.mockRejectedValue(new Error('db unreachable'))

    await expect(
      handler({ jobId: JOB_ID }, context())
    ).resolves.toBeUndefined()
    expect(mockCaptureException).toHaveBeenCalledTimes(2)
  })

  it('fails the job when the ranking pass throws', async () => {
    prisma.importJob.findUnique.mockResolvedValue(
      job({ rankingPayload: [{ levelId: '1' }] }) as never
    )
    mockCommitRanking.mockRejectedValue(new Error('ranking blew up'))

    await handler({ jobId: JOB_ID }, context())

    expect(lastJobUpdate()).toMatchObject({ status: 'failed' })
  })
})
