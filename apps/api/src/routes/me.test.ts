import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import { buildApp as buildAppWith, TEST_USER_ID } from '../test/utils'
import { mintConnectDiscordState } from './auth'
import { encryptSecret } from '../utils/kms'
import { verifyGddlApiKey, GddlInvalidKeyError, GddlError } from '../utils/gddl'

// Mocks must be declared before the route module is imported so the route
// picks up the mocked modules. vi.mock is hoisted, but the factory cannot
// reference top-level variables — we use the async form of vi.hoisted so we
// can dynamically import vitest-mock-extended (this file is ESM, so require
// is not available).
const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep: hoistedMockDeep } = await import('vitest-mock-extended')
  return { prismaMock: hoistedMockDeep() }
})

vi.mock('../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./auth', () => ({
  mintConnectDiscordState: vi.fn(() => 'signed-state'),
}))
vi.mock('../utils/kms', () => ({
  encryptSecret: vi.fn(async () => 'ciphertext-blob'),
  decryptSecret: vi.fn(async () => 'plaintext'),
}))
vi.mock('../utils/gddl', () => {
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

vi.mock('../services/gddlListSync', () => ({
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
const { default: meApp } = await import('./me')

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = TEST_USER_ID

// Wrap the me route app with the shared auth-injecting middleware (see
// test/utils.ts). Route tests focus on handler behavior, not auth.
const buildApp = () => buildAppWith(meApp)

beforeEach(() => {
  // Clear call history (preserving the default mock implementations set in the
  // vi.mock factories) so per-test `not.toHaveBeenCalled()` assertions are
  // accurate across tests.
  vi.clearAllMocks()
  mockReset(prisma)
})

describe('GET /me', () => {
  it('returns the serialized user when found', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: USER_ID,
      username: 'alex',
      enjoymentWeight: 0.25, // plain number branch in serializeMe
      ratingCategories: [
        { id: 'cat-1', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
      ],
    } as never)

    const res = await buildApp().request('/me')
    const body = (await res.json()) as { data: { username: string } }

    expect(res.status).toBe(200)
    expect(body.data.username).toBe('alex')
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    )
  })

  it('returns 404 when the user does not exist', async () => {
    prisma.user.findFirst.mockResolvedValue(null)

    const res = await buildApp().request('/me')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  it('returns 500 on database errors', async () => {
    prisma.user.findFirst.mockRejectedValue(new Error('DB error'))

    const res = await buildApp().request('/me')
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

describe('PATCH /me/username', () => {
  it('rejects a change within the 30-day cooldown', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: fiveDaysAgo,
    } as never)

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })
    const body = (await res.json()) as { error: string; nextAllowedAt: string }

    expect(res.status).toBe(403)
    expect(body.error).toBe('cooldown')
    expect(new Date(body.nextAllowedAt).getTime()).toBeGreaterThan(Date.now())
    // The cooldown check should short-circuit before any write.
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('allows a username change after the cooldown', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: thirtyOneDaysAgo,
    } as never)
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      username: 'new-name',
      enjoymentWeight: 0.5,
      ratingCategories: [],
    } as never)

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({ username: 'new-name' }),
      })
    )
  })

  it('returns 404 when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  it('returns 400 when the new username is invalid', async () => {
    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toStrictEqual({
      fieldErrors: {
        username: [
          'Username must be at least 2 characters',
          'Username can only contain letters, numbers, underscores, and hyphens',
        ],
      },
      formErrors: [],
    })
  })

  it('returns 409 when the new username is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      enjoymentWeight: 0.5,
      ratingCategories: [],
    } as never)

    prisma.user.findFirst.mockResolvedValue({
      id: 'other-user',
      username: 'taken-name',
    } as never)

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'taken-name' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(409)
    expect(body.error).toBe('Username is already taken')
  })

  it('returns 500 on database errors', async () => {
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    } as never)
    prisma.user.update.mockRejectedValue(new Error('DB error'))

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

describe('DELETE /me', () => {
  it('rejects when the confirmation text does not match', async () => {
    const res = await buildApp().request('/me', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'delete my account' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe('Confirmation text does not match')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects when no body is sent', async () => {
    const res = await buildApp().request('/me', { method: 'DELETE' })

    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('purges moderation/audit rows, the GDDL sync job, and the user in one transaction', async () => {
    ;(
      prisma.$transaction as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([])

    const res = await buildApp().request('/me', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'Delete this account' }),
    })
    const body = (await res.json()) as { data: { deleted: boolean } }

    expect(res.status).toBe(200)
    expect(body.data.deleted).toBe(true)
    expect(prisma.report.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ reporterId: USER_ID }, { reportedUserId: USER_ID }] },
    })
    expect(prisma.banAppeal.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    })
    expect(prisma.moderationAction.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ moderatorId: USER_ID }, { targetUserId: USER_ID }] },
    })
    expect(syncJobMock.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    })
    expect(prisma.ratingScore.deleteMany).toHaveBeenCalledWith({
      where: { progressUpdate: { levelProgress: { userId: USER_ID } } },
    })
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: USER_ID },
    })
    // No verified JWT claims in the test harness — Cognito deletion is
    // skipped rather than attempted with undefined claims.
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('returns 500 and does not attempt Cognito deletion when the transaction fails', async () => {
    ;(
      prisma.$transaction as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('DB error'))

    const res = await buildApp().request('/me', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'Delete this account' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })
})

describe('POST /me/connect-discord', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')
    vi.stubEnv('DISCORD_REDIRECT_URI', 'https://test.example.com/callback')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns 200 with the state to sign', async () => {
    const res = await buildApp().request('/me/connect-discord', {
      method: 'POST',
    })
    const body = (await res.json()) as { data: { url: string } }

    expect(res.status).toBe(200)
    expect(body.data.url).toBe(
      'https://discord.com/api/oauth2/authorize?client_id=test-client-id&redirect_uri=https%3A%2F%2Ftest.example.com%2Fcallback&response_type=code&scope=identify+email&state=signed-state'
    )
  })

  it('returns 500 if the state signing fails', async () => {
    ;(
      mintConnectDiscordState as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(() => {
      throw new Error('Signing error')
    })

    const res = await buildApp().request('/me/connect-discord', {
      method: 'POST',
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

describe('PUT /me/gddl-key', () => {
  it('verifies, encrypts, and stores a valid key, returning the GDDL name', async () => {
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      username: 'alex',
      gddlApiKeyEncrypted: 'ciphertext-blob',
      enjoymentWeight: 0.5,
      ratingCategories: [],
    } as never)

    const res = await buildApp().request('/me/gddl-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'super-secret-key' }),
    })
    const body = (await res.json()) as {
      data: { hasGddlApiKey: boolean; gddlApiKeyEncrypted?: string }
      gddlName: string
    }

    expect(res.status).toBe(200)
    // Key is verified against GDDL, then encrypted before storage.
    expect(verifyGddlApiKey).toHaveBeenCalledWith('super-secret-key')
    expect(encryptSecret).toHaveBeenCalledWith('super-secret-key')
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: {
          gddlApiKeyEncrypted: 'ciphertext-blob',
          gddlUsername: 'GDDLUser',
        },
      })
    )
    // The verified GDDL name comes back for the success message.
    expect(body.gddlName).toBe('GDDLUser')
    // The response exposes the flag but never the ciphertext or the key.
    expect(body.data.hasGddlApiKey).toBe(true)
    expect(body.data.gddlApiKeyEncrypted).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('super-secret-key')
    expect(JSON.stringify(body)).not.toContain('ciphertext-blob')
  })

  it('rejects an invalid key without encrypting or storing it', async () => {
    ;(
      verifyGddlApiKey as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new GddlInvalidKeyError())

    const res = await buildApp().request('/me/gddl-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'bad-key' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toContain('invalid')
    expect(encryptSecret).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('returns 500 (not "invalid") when GDDL is unreachable', async () => {
    ;(
      verifyGddlApiKey as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('network down'))

    const res = await buildApp().request('/me/gddl-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'super-secret-key' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('returns 400 for an empty key without echoing the body', async () => {
    const res = await buildApp().request('/me/gddl-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: '' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe('A valid API key is required')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('returns 500 on database errors', async () => {
    prisma.user.update.mockRejectedValue(new Error('DB error'))

    const res = await buildApp().request('/me/gddl-key', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'super-secret-key' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

describe('DELETE /me/gddl-key', () => {
  it('clears the stored key', async () => {
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      username: 'alex',
      gddlApiKeyEncrypted: null,
      enjoymentWeight: 0.5,
      ratingCategories: [],
    } as never)

    const res = await buildApp().request('/me/gddl-key', { method: 'DELETE' })
    const body = (await res.json()) as { data: { hasGddlApiKey: boolean } }

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { gddlApiKeyEncrypted: null, gddlUsername: null },
      })
    )
    expect(body.data.hasGddlApiKey).toBe(false)
  })
})

describe('DELETE /me/connect-discord', () => {
  it('disconnects the user from Discord', async () => {
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      username: 'alex',
      enjoymentWeight: 0.5,
      ratingCategories: [],
    } as never)

    const res = await buildApp().request('/me/connect-discord', {
      method: 'DELETE',
    })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { discordId: null },
      })
    )
  })

  it('returns 500 on database errors', async () => {
    prisma.user.update.mockRejectedValue(new Error('DB error'))

    const res = await buildApp().request('/me/connect-discord', {
      method: 'DELETE',
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const syncJobMock = (prisma as any).gddlSyncJob

describe('POST /me/gddl-sync', () => {
  it('creates a job, fires the worker, and returns 202 + jobId', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    syncJobMock.create.mockResolvedValueOnce({ id: 'job-123' })
    mockLambdaSend.mockResolvedValueOnce({})

    const res = await buildApp().request('/me/gddl-sync', { method: 'POST' })
    const body = (await res.json()) as { data: { jobId: string } }

    expect(res.status).toBe(202)
    expect(body.data.jobId).toBe('job-123')
    expect(syncJobMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending' }),
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

  it('returns 500 when the DB create throws', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      gddlApiKeyEncrypted: 'ciphertext',
    } as never)
    syncJobMock.create.mockRejectedValueOnce(new Error('DB error'))

    const res = await buildApp().request('/me/gddl-sync', { method: 'POST' })

    expect(res.status).toBe(500)
    expect(mockLambdaSend).not.toHaveBeenCalled()
  })
})

describe('GET /me/gddl-sync', () => {
  it("returns the user's most recent job status", async () => {
    const jobData = {
      id: 'job-123',
      status: 'completed',
      result: { created: 3, enriched: 0, skipped: 1, errors: [] },
      error: null,
    }
    syncJobMock.findFirst.mockResolvedValueOnce(jobData)

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as { data: typeof jobData }

    expect(res.status).toBe(200)
    expect(body.data.id).toBe('job-123')
    expect(body.data.status).toBe('completed')
    expect(body.data.result).toEqual(jobData.result)
    expect(syncJobMock.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { startedAt: 'desc' } })
    )
  })

  it('returns null when the user has never run a sync', async () => {
    syncJobMock.findFirst.mockResolvedValueOnce(null)

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })
    const body = (await res.json()) as { data: null }

    expect(res.status).toBe(200)
    expect(body.data).toBeNull()
  })

  it('returns 500 when the DB query throws', async () => {
    syncJobMock.findFirst.mockRejectedValueOnce(new Error('DB error'))

    const res = await buildApp().request('/me/gddl-sync', { method: 'GET' })

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
