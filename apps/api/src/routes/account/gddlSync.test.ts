import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import { buildApp as buildAppWith, TEST_USER_ID } from '../../test/utils'
import { GddlError } from '../../utils/gddl'

// Mocks must be declared before the route module is imported so the route
// picks up the mocked modules. vi.mock is hoisted, but the factory cannot
// reference top-level variables — we use the async form of vi.hoisted so we
// can dynamically import vitest-mock-extended (this file is ESM, so require
// is not available).
const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep: hoistedMockDeep } = await import('vitest-mock-extended')
  return { prismaMock: hoistedMockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../auth/state', () => ({
  mintConnectDiscordState: vi.fn(() => 'signed-state'),
}))
vi.mock('../../utils/kms', () => ({
  encryptSecret: vi.fn(async () => 'ciphertext-blob'),
  decryptSecret: vi.fn(async () => 'plaintext'),
}))
vi.mock('../../utils/gddl', () => {
  class GddlError extends Error {}
  class GddlInvalidKeyError extends GddlError {}
  return {
    GddlError,
    GddlInvalidKeyError,
    verifyGddlApiKey: vi.fn(async () => ({ name: 'GDDLUser' })),
  }
})

const { mockLambdaSend } = vi.hoisted(() => ({
  mockLambdaSend: vi.fn(async () => ({})),
}))

const { mockSyncGddlLists } = vi.hoisted(() => ({
  mockSyncGddlLists: vi.fn(),
}))

vi.mock('../../services/gddl/listSync', () => ({
  syncGddlLists: mockSyncGddlLists,
}))

vi.mock('@aws-sdk/client-lambda', () => {
  return {
    LambdaClient: class {
      send = mockLambdaSend
    },
    InvokeCommand: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public input: any) {}
    },
  }
})

const { mockCognitoSend } = vi.hoisted(() => ({
  mockCognitoSend: vi.fn(async () => ({})),
}))

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class UserNotFoundException extends Error {}
  return {
    CognitoIdentityProviderClient: class {
      send = mockCognitoSend
    },
    AdminDeleteUserCommand: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public input: any) {}
    },
    UserNotFoundException,
  }
})

// Import after vi.mock so the route resolves the mocked modules.
const { default: meApp } = await import('./index')

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = TEST_USER_ID

// Wrap the me route app with the shared auth-injecting middleware (see
// test/utils.ts). Route tests focus on handler behavior, not auth.
const buildApp = () => buildAppWith(meApp)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const syncJobMock = (prisma as any).gddlSyncJob

beforeEach(() => {
  // Clear call history (preserving the default mock implementations set in the
  // vi.mock factories) so per-test `not.toHaveBeenCalled()` assertions are
  // accurate across tests.
  vi.clearAllMocks()
  mockReset(prisma)
})

describe('POST /me/gddl-sync', () => {
  it('creates a job, fires the worker, and returns 202 + jobId', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    syncJobMock.findUnique.mockResolvedValueOnce(null)
    syncJobMock.upsert.mockResolvedValueOnce({ id: 'job-123' })
    mockLambdaSend.mockResolvedValueOnce({})

    const res = await buildApp().request('/me/gddl-sync', { method: 'POST' })
    const body = (await res.json()) as { data: { jobId: string } }

    expect(res.status).toBe(202)
    expect(body.data.jobId).toBe('job-123')
    expect(syncJobMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'pending' }),
        update: expect.objectContaining({
          status: 'pending',
          acknowledgedAt: null,
        }),
      })
    )
    expect(mockLambdaSend).toHaveBeenCalledTimes(1)
  })

  it('returns 400 when the user has no GDDL API key', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: null,
    } as never)

    const res = await buildApp().request('/me/gddl-sync', { method: 'POST' })

    expect(res.status).toBe(400)
    expect(mockLambdaSend).not.toHaveBeenCalled()
  })

  it('returns 500 when the DB upsert throws', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    syncJobMock.findUnique.mockResolvedValueOnce(null)
    syncJobMock.upsert.mockRejectedValueOnce(new Error('DB error'))

    const res = await buildApp().request('/me/gddl-sync', { method: 'POST' })

    expect(res.status).toBe(500)
    expect(mockLambdaSend).not.toHaveBeenCalled()
  })

  it('returns the existing job instead of starting a second one while a sync is already pending', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    syncJobMock.findUnique.mockResolvedValueOnce({
      id: 'job-already-running',
      status: 'pending',
      startedAt: new Date(),
    })

    const res = await buildApp().request('/me/gddl-sync', { method: 'POST' })
    const body = (await res.json()) as { data: { jobId: string } }

    expect(res.status).toBe(202)
    expect(body.data.jobId).toBe('job-already-running')
    expect(syncJobMock.upsert).not.toHaveBeenCalled()
    expect(mockLambdaSend).not.toHaveBeenCalled()
  })

  it('expires a stale pending job and starts a new one', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    syncJobMock.findUnique.mockResolvedValueOnce({
      id: 'job-stuck',
      status: 'pending',
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    })
    syncJobMock.upsert.mockResolvedValueOnce({ id: 'job-new' })
    mockLambdaSend.mockResolvedValueOnce({})

    const res = await buildApp().request('/me/gddl-sync', { method: 'POST' })
    const body = (await res.json()) as { data: { jobId: string } }

    expect(res.status).toBe(202)
    expect(body.data.jobId).toBe('job-new')
    expect(syncJobMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-stuck' },
        data: expect.objectContaining({ status: 'failed' }),
      })
    )
    expect(syncJobMock.upsert).toHaveBeenCalledTimes(1)
    expect(mockLambdaSend).toHaveBeenCalledTimes(1)
  })
})
describe('GET /me/gddl-sync', () => {
  it("returns the user's most recent job status", async () => {
    const jobData = {
      id: 'job-123',
      status: 'completed',
      result: { created: 3, enriched: 0, skipped: 1, errors: [] },
      error: null,
      startedAt: new Date(Date.now() - 60 * 1000),
      finishedAt: new Date(Date.now() - 30 * 1000),
      acknowledgedAt: null,
    }
    syncJobMock.findUnique.mockResolvedValueOnce(jobData)

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as {
      data: { id: string; status: string; result: unknown }
    }

    expect(res.status).toBe(200)
    expect(body.data.id).toBe('job-123')
    expect(body.data.status).toBe('completed')
    expect(body.data.result).toEqual(jobData.result)
    expect(syncJobMock.findUnique).toHaveBeenCalled()
  })

  it('returns null when the user has never run a sync', async () => {
    syncJobMock.findUnique.mockResolvedValueOnce(null)

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as { data: null }

    expect(res.status).toBe(200)
    expect(body.data).toBeNull()
  })

  it('returns 500 when the DB query throws', async () => {
    syncJobMock.findUnique.mockRejectedValueOnce(new Error('DB error'))

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })

    expect(res.status).toBe(500)
  })

  it('expires a stale pending job to failed instead of leaving it pending forever', async () => {
    syncJobMock.findUnique.mockResolvedValueOnce({
      id: 'job-stuck',
      status: 'pending',
      result: null,
      error: null,
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    })

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as { data: { status: string } }

    expect(res.status).toBe(200)
    expect(body.data.status).toBe('failed')
    expect(syncJobMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-stuck' },
        data: expect.objectContaining({ status: 'failed' }),
      })
    )
  })

  it('still returns a completed job no matter how long ago it finished, as long as unacknowledged', async () => {
    syncJobMock.findUnique.mockResolvedValueOnce({
      id: 'job-old',
      status: 'completed',
      result: { created: 3, enriched: 0, skipped: 1, errors: [] },
      error: null,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 30 * 60 * 1000),
      acknowledgedAt: null,
    })

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as { data: { id: string } | null }

    expect(res.status).toBe(200)
    expect(body.data?.id).toBe('job-old')
  })

  it("includes the job's startedAt so the client can scope an ack to this run", async () => {
    const startedAt = new Date(Date.now() - 60 * 1000)
    syncJobMock.findUnique.mockResolvedValueOnce({
      id: 'job-recent',
      status: 'completed',
      result: { created: 1, enriched: 0, skipped: 0, errors: [] },
      error: null,
      startedAt,
      finishedAt: new Date(Date.now() - 30 * 1000),
      acknowledgedAt: null,
    })

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as {
      data: { id: string; startedAt: string } | null
    }

    expect(res.status).toBe(200)
    expect(body.data?.id).toBe('job-recent')
    expect(body.data?.startedAt).toBe(startedAt.toISOString())
  })

  it('returns null for a completed job that has already been acknowledged', async () => {
    syncJobMock.findUnique.mockResolvedValueOnce({
      id: 'job-acked',
      status: 'completed',
      result: { created: 1, enriched: 0, skipped: 0, errors: [] },
      error: null,
      startedAt: new Date(Date.now() - 60 * 1000),
      finishedAt: new Date(Date.now() - 30 * 1000),
      acknowledgedAt: new Date(Date.now() - 10 * 1000),
    })

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as { data: null }

    expect(res.status).toBe(200)
    expect(body.data).toBeNull()
  })
})
describe('POST /me/gddl-sync/ack', () => {
  const startedAt = new Date('2026-08-05T12:00:00.000Z')

  it('acknowledges a job scoped to the current user, run (startedAt), and non-pending status', async () => {
    syncJobMock.updateMany.mockResolvedValueOnce({ count: 1 })

    const res = await buildApp().request('/me/gddl-sync/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job-123',
        startedAt: startedAt.toISOString(),
      }),
    })
    const body = (await res.json()) as { data: { acknowledged: boolean } }

    expect(res.status).toBe(200)
    expect(body.data.acknowledged).toBe(true)
    expect(syncJobMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'job-123',
          status: { not: 'pending' },
          startedAt,
        }),
        data: expect.objectContaining({ acknowledgedAt: expect.any(Date) }),
      })
    )
  })

  it('returns 400 when jobId is missing', async () => {
    const res = await buildApp().request('/me/gddl-sync/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startedAt: startedAt.toISOString() }),
    })

    expect(res.status).toBe(400)
    expect(syncJobMock.updateMany).not.toHaveBeenCalled()
  })

  it('returns 400 when startedAt is missing or not a valid ISO datetime', async () => {
    const res = await buildApp().request('/me/gddl-sync/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: 'job-123', startedAt: 'not-a-date' }),
    })

    expect(res.status).toBe(400)
    expect(syncJobMock.updateMany).not.toHaveBeenCalled()
  })

  it("is a no-op when startedAt doesn't match the current run (e.g. superseded by a newer sync)", async () => {
    syncJobMock.updateMany.mockResolvedValueOnce({ count: 0 })

    const res = await buildApp().request('/me/gddl-sync/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job-123',
        startedAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
      }),
    })
    const body = (await res.json()) as { data: { acknowledged: boolean } }

    expect(res.status).toBe(200)
    expect(body.data.acknowledged).toBe(true)
    expect(syncJobMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startedAt: new Date('2020-01-01T00:00:00.000Z'),
        }),
      })
    )
  })

  it('returns 200 even when no job matches (already acknowledged / superseded)', async () => {
    syncJobMock.updateMany.mockResolvedValueOnce({ count: 0 })

    const res = await buildApp().request('/me/gddl-sync/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job-gone',
        startedAt: startedAt.toISOString(),
      }),
    })

    expect(res.status).toBe(200)
  })

  it('returns 500 when the DB update throws', async () => {
    syncJobMock.updateMany.mockRejectedValueOnce(new Error('DB error'))

    const res = await buildApp().request('/me/gddl-sync/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job-123',
        startedAt: startedAt.toISOString(),
      }),
    })

    expect(res.status).toBe(500)
  })
})
describe('POST /me/gddl-lists-sync', () => {
  const mockResult = {
    favorites: {
      addedToInferno: ['100'],
      addedToGddl: [],
      removedFromGddl: [],
      skipped: [],
    },
    leastFavorites: {
      addedToInferno: [],
      addedToGddl: ['200'],
      removedFromGddl: ['300'],
      skipped: [],
    },
  }

  it('decrypts the key, runs the sync, and returns the result', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    mockSyncGddlLists.mockResolvedValueOnce(mockResult)

    const res = await buildApp().request('/me/gddl-lists-sync', {
      method: 'POST',
    })
    const body = (await res.json()) as { data: typeof mockResult }

    expect(res.status).toBe(200)
    expect(body.data).toEqual(mockResult)
    expect(mockSyncGddlLists).toHaveBeenCalledWith(USER_ID, 'plaintext')
  })

  it('returns 400 when the user has no GDDL API key', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: null,
    } as never)

    const res = await buildApp().request('/me/gddl-lists-sync', {
      method: 'POST',
    })

    expect(res.status).toBe(400)
    expect(mockSyncGddlLists).not.toHaveBeenCalled()
  })

  it('returns 502 when GDDL throws a GddlError', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    mockSyncGddlLists.mockRejectedValueOnce(new GddlError('GDDL is down'))

    const res = await buildApp().request('/me/gddl-lists-sync', {
      method: 'POST',
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(502)
    expect(body.error).toBe('GDDL is down')
  })

  it('returns 500 on database errors', async () => {
    prisma.user.findUniqueOrThrow.mockRejectedValueOnce(new Error('DB error'))

    const res = await buildApp().request('/me/gddl-lists-sync', {
      method: 'POST',
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})
