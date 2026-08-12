/**
 * Unit tests for the job-based spreadsheet import routes.
 *
 * The structural constraint driving this design is that an async Lambda invoke
 * caps at 256KB, so /start persists the whole dataset to Postgres and hands the
 * worker only a jobId. Two consequences are pinned here: the persist and the
 * discard of the previous job happen in ONE transaction (a partial write would
 * leave a user with no importable state), and the by-id review routes are
 * scoped through the owning job so one user cannot resolve another's rows.
 * Prisma, Lambda and the conflict-check service are mocked.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import { buildApp, TEST_USER_ID } from '../../test/utils'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockCheckImportConflicts } = vi.hoisted(() => ({
  mockCheckImportConflicts: vi.fn(),
}))
vi.mock('../../services/importExport/import', () => ({
  checkImportConflicts: mockCheckImportConflicts,
}))

const { mockLambdaSend } = vi.hoisted(() => ({ mockLambdaSend: vi.fn() }))
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = mockLambdaSend
  },
  InvokeCommand: class {
    constructor(
      public input: {
        FunctionName: string
        InvocationType: string
        Payload: Uint8Array
      }
    ) {}
  },
}))

const { logger } = await import('../../utils/logger')
const importRoutes = (await import('./import')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const app = buildApp(importRoutes)

// groupBy's overloaded generic signature defeats DeepMockProxy's inference, so
// the mock methods aren't visible on it — reach them through a plain Mock.
const groupByMock = prisma.importJobRow.groupBy as unknown as Mock

const JOB_ID = 'job-1'
const WORKER_ARN = 'arn:aws:lambda:us-east-1:1234:function:import-worker'

/** The transaction client the route's $transaction callback receives. */
const tx = {
  importJob: { deleteMany: vi.fn(), create: vi.fn() },
  importJobRow: { createMany: vi.fn() },
}

function post(path: string, body?: unknown) {
  return app.request(path, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }),
  })
}

/** A minimal valid commit row. */
function row(rowIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    type: 'completion',
    rowIndex,
    data: { levelId: '12345', levelName: 'DeathMoon', ...overrides },
  }
}

/** The InvokeCommand input from the most recent Lambda send. */
function lastInvoke() {
  return (
    mockLambdaSend.mock.lastCall?.[0] as {
      input: { FunctionName: string; InvocationType: string; Payload: Uint8Array }
    }
  ).input
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.importJob.deleteMany.mockReset().mockResolvedValue({ count: 0 })
  tx.importJob.create.mockReset().mockResolvedValue({ id: JOB_ID })
  tx.importJobRow.createMany.mockReset().mockResolvedValue({ count: 0 })

  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
  prisma.importJob.findUnique.mockReset().mockResolvedValue(null)
  groupByMock.mockReset().mockResolvedValue([])
  prisma.importJobRow.updateMany.mockReset().mockResolvedValue({ count: 1 } as never)
  mockCheckImportConflicts.mockReset().mockResolvedValue({ conflicts: [] })
  mockLambdaSend.mockReset().mockResolvedValue({})
  vi.stubEnv('IMPORT_WORKER_ARN', WORKER_ARN)
})

// ─── POST /me/import/check ───────────────────────────────────────────────────

describe('POST /me/import/check', () => {
  it('delegates to the conflict service for the caller and returns its result', async () => {
    mockCheckImportConflicts.mockResolvedValue({ conflicts: [{ levelId: '1' }] })

    const res = await post('/me/import/check', { completions: [] })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      conflicts: [{ levelId: '1' }],
    })
    expect(mockCheckImportConflicts).toHaveBeenCalledWith(TEST_USER_ID, {
      completions: [],
    })
  })

  it('400s on an invalid body without calling the service', async () => {
    const res = await post('/me/import/check', { completions: 'not an array' })

    expect(res.status).toBe(400)
    expect(mockCheckImportConflicts).not.toHaveBeenCalled()
  })

  // CHARACTERIZATION TEST — documents current behaviour, which is a sharp edge.
  // Every field of ImportCheckRequestSchema is optional, so the `{}` fallback
  // for an unparseable body is itself VALID: a corrupt request reads as an
  // empty check and answers "no conflicts" rather than erroring. For an import
  // preflight that means the user is told it is safe to proceed. If the route
  // grows a guard for an unparseable body, this should flip to expecting 400.
  it('treats an unparseable body as an empty check, not an error', async () => {
    const res = await app.request('/me/import/check', {
      method: 'POST',
      body: '{oops',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    expect(mockCheckImportConflicts).toHaveBeenCalledWith(TEST_USER_ID, {})
  })
})

// ─── POST /me/import/start ───────────────────────────────────────────────────

describe('POST /me/import/start', () => {
  it('discards the previous job and persists the new one in one transaction', async () => {
    // Both in the same callback: a half-applied start would leave the user
    // with neither their old job nor a usable new one.
    const res = await post('/me/import/start', { rows: [row(0), row(1)] })

    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toEqual({ jobId: JOB_ID })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.importJob.deleteMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID },
    })
    expect(tx.importJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: TEST_USER_ID,
        status: 'running',
        totalRows: 2,
      }),
    })
  })

  it('persists each row with its index and searchable identifiers', async () => {
    await post('/me/import/start', {
      rows: [row(0), row(7, { levelId: '999', levelName: 'Other' })],
    })

    const { data } = tx.importJobRow.createMany.mock.lastCall![0] as {
      data: { rowIndex: number; levelName: string | null; identifier: string | null }[]
    }
    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({
      jobId: JOB_ID,
      rowIndex: 0,
      status: 'pending',
      levelName: 'DeathMoon',
      identifier: '12345',
    })
    expect(data[1]).toMatchObject({ rowIndex: 7, levelName: 'Other', identifier: '999' })
  })

  it('nulls the row identifiers a name-only row does not carry', async () => {
    await post('/me/import/start', {
      rows: [{ type: 'completion', rowIndex: 0, data: {} }],
    })

    const { data } = tx.importJobRow.createMany.mock.lastCall![0] as {
      data: { levelName: string | null; identifier: string | null }[]
    }
    expect(data[0]).toMatchObject({ levelName: null, identifier: null })
  })

  it('stores only the optional tabs the sheet actually had', async () => {
    await post('/me/import/start', {
      rows: [row(0)],
      ranking: [{ levelId: '12345' }],
    })

    const { data } = tx.importJob.create.mock.lastCall![0] as {
      data: Record<string, unknown>
    }
    expect(data).toHaveProperty('rankingPayload')
    expect(data).not.toHaveProperty('collectionsPayload')
    expect(data).not.toHaveProperty('ratingsPayload')
  })

  it('invokes the worker asynchronously with just the jobId', async () => {
    // The dataset is in Postgres — the invoke payload cannot carry it.
    await post('/me/import/start', { rows: [row(0)] })

    const invoke = lastInvoke()
    expect(invoke.FunctionName).toBe(WORKER_ARN)
    expect(invoke.InvocationType).toBe('Event')
    expect(JSON.parse(Buffer.from(invoke.Payload).toString())).toEqual({
      jobId: JOB_ID,
    })
  })

  it('still creates the job, and logs loudly, when the worker ARN is unset', async () => {
    vi.stubEnv('IMPORT_WORKER_ARN', undefined)

    const res = await post('/me/import/start', { rows: [row(0)] })

    expect(res.status).toBe(202)
    expect(mockLambdaSend).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it.each([
    ['rows is empty', { rows: [] }],
    ['rows is missing', {}],
    ['a row has an unknown type', { rows: [{ type: 'nonsense', rowIndex: 0, data: {} }] }],
    ['a rowIndex is negative', { rows: [{ type: 'completion', rowIndex: -1, data: {} }] }],
  ])('400s and writes nothing when %s', async (_label, body) => {
    const res = await post('/me/import/start', body)

    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(mockLambdaSend).not.toHaveBeenCalled()
  })
})

// ─── GET /me/import/status ───────────────────────────────────────────────────

describe('GET /me/import/status', () => {
  /** A stored job, with only the fields the response reads. */
  function job(overrides: Record<string, unknown> = {}) {
    return {
      id: JOB_ID,
      status: 'running',
      totalRows: 10,
      processedRows: 4,
      error: null,
      rows: [],
      rankingResult: null,
      collectionsResult: null,
      ratingsResult: null,
      ...overrides,
    }
  }

  it('returns null when the user has no job', async () => {
    const res = await app.request('/me/import/status')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: null })
  })

  it('reports live progress for the running job', async () => {
    prisma.importJob.findUnique.mockResolvedValue(job() as never)

    const body = (await (await app.request('/me/import/status')).json()) as {
      data: Record<string, unknown>
    }

    expect(body.data).toMatchObject({
      status: 'running',
      totalRows: 10,
      processedRows: 4,
      error: null,
    })
  })

  it('tallies the outcome counts by row status', async () => {
    prisma.importJob.findUnique.mockResolvedValue(job() as never)
    groupByMock.mockResolvedValue([
      { status: 'committed', _count: { status: 3 } },
      { status: 'skipped', _count: { status: 2 } },
    ])

    const body = (await (await app.request('/me/import/status')).json()) as {
      data: { outcomeCounts: Record<string, number> }
    }

    expect(body.data.outcomeCounts).toEqual({
      committed: 3,
      updated: 0,
      skipped: 2,
      failed: 0,
    })
  })

  it('ignores a row status that is not an outcome', async () => {
    // 'pending' rows are in-flight, not an outcome — counting them would make
    // the totals disagree with what the review UI shows.
    prisma.importJob.findUnique.mockResolvedValue(job() as never)
    groupByMock.mockResolvedValue([
      { status: 'pending', _count: { status: 9 } },
      { status: 'failed', _count: { status: 1 } },
    ])

    const body = (await (await app.request('/me/import/status')).json()) as {
      data: { outcomeCounts: Record<string, number> }
    }

    expect(body.data.outcomeCounts).toEqual({
      committed: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
    })
  })

  it('surfaces the flagged rows for review', async () => {
    prisma.importJob.findUnique.mockResolvedValue(
      job({
        rows: [
          {
            id: 'row-1',
            rowIndex: 3,
            levelName: 'DeathMoon',
            identifier: '12345',
            issueMessage: 'Possible duplicate',
            resolved: false,
          },
        ],
      }) as never
    )

    const body = (await (await app.request('/me/import/status')).json()) as {
      data: { flaggedRows: unknown[] }
    }

    expect(body.data.flaggedRows).toEqual([
      {
        id: 'row-1',
        rowIndex: 3,
        levelName: 'DeathMoon',
        identifier: '12345',
        issueMessage: 'Possible duplicate',
        resolved: false,
      },
    ])
  })

  it('asks only for rows that carry an issue, in row order', async () => {
    await app.request('/me/import/status')

    expect(prisma.importJob.findUnique).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID },
      include: {
        rows: {
          where: { issueMessage: { not: null } },
          orderBy: { rowIndex: 'asc' },
        },
      },
    })
  })

  it('passes the one-shot tab results through, defaulting to null', async () => {
    prisma.importJob.findUnique.mockResolvedValue(
      job({ rankingResult: { placed: 5 } }) as never
    )

    const body = (await (await app.request('/me/import/status')).json()) as {
      data: Record<string, unknown>
    }

    expect(body.data.rankingResult).toEqual({ placed: 5 })
    expect(body.data.collectionsResult).toBeNull()
    expect(body.data.ratingsResult).toBeNull()
  })
})

// ─── review routes ───────────────────────────────────────────────────────────

describe('PATCH /me/import/rows/:rowId/resolve', () => {
  it('marks the row resolved, scoped through the owning job', async () => {
    // The scope is what stops one user resolving another's flagged row.
    const res = await app.request('/me/import/rows/row-1/resolve', {
      method: 'PATCH',
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { resolved: true } })
    expect(prisma.importJobRow.updateMany).toHaveBeenCalledWith({
      where: { id: 'row-1', job: { userId: TEST_USER_ID } },
      data: { resolved: true },
    })
  })

  it('404s when the row is not the caller’s', async () => {
    prisma.importJobRow.updateMany.mockResolvedValue({ count: 0 } as never)

    const res = await app.request('/me/import/rows/row-1/resolve', {
      method: 'PATCH',
    })

    expect(res.status).toBe(404)
  })
})

describe('POST /me/import/resolve-all', () => {
  it('resolves every flagged row on the caller’s job', async () => {
    prisma.importJob.findUnique.mockResolvedValue({ id: JOB_ID } as never)

    const res = await post('/me/import/resolve-all')

    expect(res.status).toBe(200)
    expect(prisma.importJobRow.updateMany).toHaveBeenCalledWith({
      where: { jobId: JOB_ID, issueMessage: { not: null } },
      data: { resolved: true },
    })
  })

  it('404s when there is no job', async () => {
    const res = await post('/me/import/resolve-all')

    expect(res.status).toBe(404)
    expect(prisma.importJobRow.updateMany).not.toHaveBeenCalled()
  })
})
