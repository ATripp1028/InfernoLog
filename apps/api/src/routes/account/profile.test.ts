import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import * as Sentry from '@sentry/node'
import { buildApp as buildAppWith, TEST_USER_ID } from '../../test/utils'

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
vi.mock('../../utils/discordState', () => ({
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
      where: { levelProgress: { userId: USER_ID } },
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

// ─── PATCH /me ───────────────────────────────────────────────────────────────

describe('PATCH /me', () => {
  /** A serialized-me row, enough for serializeMe to work on. */
  function updatedUser() {
    return {
      id: USER_ID,
      enjoymentWeight: { toNumber: () => 0.3 },
      ratingCategories: [],
    }
  }

  /** The `data` of the single user.update call. */
  function updateData(): Record<string, unknown> {
    return (
      prisma.user.update.mock.lastCall as unknown as [
        { data: Record<string, unknown> },
      ]
    )[0].data
  }

  function patch(body: unknown) {
    return buildApp().request('/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    prisma.user.update.mockResolvedValue(updatedUser() as never)
    prisma.ratingCategory.count.mockResolvedValue(1 as never)
    prisma.ratingCategory.createMany.mockResolvedValue({ count: 0 } as never)
  })

  it('applies a partial preference update', async () => {
    const res = await patch({ profilePublic: true, defaultFps: 240 })

    expect(res.status).toBe(200)
    expect(updateData()).toEqual({ profilePublic: true, defaultFps: 240 })
  })

  it('scopes the update to the authenticated user', async () => {
    await patch({ profilePublic: true })

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    )
  })

  it('omits keys the body did not send rather than writing undefined', async () => {
    // exactOptionalPropertyTypes means Prisma rejects an explicit undefined.
    await patch({ profilePublic: true })

    expect(Object.keys(updateData())).toEqual(['profilePublic'])
  })

  it('writes an explicit false rather than treating it as unset', async () => {
    await patch({ profilePublic: false })

    expect(updateData()).toEqual({ profilePublic: false })
  })

  it('400s on an invalid body without writing', async () => {
    const res = await patch({ defaultFps: 'lots' })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('400s on an unparseable body', async () => {
    const res = await buildApp().request('/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{oops',
    })

    expect(res.status).toBe(400)
  })

  it('stamps legalAcceptedAt for acceptLegal without writing it as a column', async () => {
    // acceptLegal isn't a column — it only marks the time.
    const res = await patch({ acceptLegal: true })

    expect(res.status).toBe(200)
    const data = updateData()
    expect(data).not.toHaveProperty('acceptLegal')
    expect(data.legalAcceptedAt).toBeInstanceOf(Date)
  })

  it('rejects acceptLegal:false — acceptance is opt-in, not revocable here', async () => {
    // The schema types it as z.literal(true), so `false` is a validation
    // error rather than a silently-ignored no-op.
    const res = await patch({ acceptLegal: false })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('does not stamp legalAcceptedAt when acceptLegal is absent', async () => {
    await patch({ profilePublic: true })

    expect(updateData()).not.toHaveProperty('legalAcceptedAt')
  })

  it('seeds the default categories on the first switch to WEIGHTED', async () => {
    // WEIGHTED mode must always have at least one category to score against.
    prisma.ratingCategory.count.mockResolvedValue(0 as never)

    await patch({ ratingMode: 'WEIGHTED' })

    expect(prisma.ratingCategory.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    )
    const [{ data }] = prisma.ratingCategory.createMany.mock
      .lastCall as unknown as [{ data: { name: string }[] }]
    expect(data.map((c) => c.name)).toEqual([
      'Gameplay',
      'Decoration',
      'Song',
    ])
  })

  it('does not reseed when the user already has categories', async () => {
    prisma.ratingCategory.count.mockResolvedValue(3 as never)

    await patch({ ratingMode: 'WEIGHTED' })

    expect(prisma.ratingCategory.createMany).not.toHaveBeenCalled()
  })

  it('does not seed when switching to SIMPLE', async () => {
    prisma.ratingCategory.count.mockResolvedValue(0 as never)

    await patch({ ratingMode: 'SIMPLE' })

    expect(prisma.ratingCategory.count).not.toHaveBeenCalled()
    expect(prisma.ratingCategory.createMany).not.toHaveBeenCalled()
  })

  it('returns the serialized user with the ciphertext stripped', async () => {
    prisma.user.update.mockResolvedValue({
      ...updatedUser(),
      gddlApiKeyEncrypted: 'ciphertext-blob',
    } as never)

    const body = (await (await patch({ profilePublic: true })).json()) as {
      data: Record<string, unknown>
    }

    expect(body.data).not.toHaveProperty('gddlApiKeyEncrypted')
    expect(body.data.hasGddlApiKey).toBe(true)
  })

  it('returns 500 on a database error', async () => {
    prisma.user.update.mockRejectedValue(new Error('DB error'))

    const res = await patch({ profilePublic: true })

    expect(res.status).toBe(500)
  })
})

// ─── PATCH /me/username — the remaining paths ────────────────────────────────

describe('PATCH /me/username — concurrency and no-ops', () => {
  function patchUsername(username: string) {
    return buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    })
  }

  it('treats re-submitting the current username as a no-op past the cooldown', async () => {
    // Idempotent: the cooldown must not block saving the name you already have.
    prisma.user.findUnique.mockResolvedValue({
      username: 'sameName',
      usernameChangedAt: new Date(),
    } as never)
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      enjoymentWeight: { toNumber: () => 0 },
      ratingCategories: [],
    } as never)

    const res = await patchUsername('sameName')

    expect(res.status).toBe(200)
    // No cooldown restart and no previousUsername for an unchanged name.
    const [{ data }] = prisma.user.update.mock.lastCall as unknown as [
      { data: Record<string, unknown> },
    ]
    expect(data).toEqual({ username: 'sameName' })
  })

  it('rescues the unique-constraint race as the same 409 as the pre-check', async () => {
    // The pre-check is TOCTOU; the constraint is the real guarantee, and it
    // must not surface as a 500.
    prisma.user.findUnique.mockResolvedValue({
      username: 'oldName',
      usernameChangedAt: null,
    } as never)
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      })
    )

    const res = await patchUsername('takenMeanwhile')

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'Username is already taken',
    })
  })
})

// ─── DELETE /me — Cognito cleanup ────────────────────────────────────────────

describe('DELETE /me — Cognito cleanup', () => {
  /** The API Gateway env carrying verified JWT claims. */
  const envWithClaims = {
    requestContext: { authorizer: { jwt: { claims: { sub: 'cognito-sub' } } } },
  }

  function deleteMe(env?: unknown) {
    return buildApp().request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'Delete this account' }),
      },
      env
    )
  }

  beforeEach(() => {
    ;(
      prisma.$transaction as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([])
  })

  it('deletes the Cognito identity after purging the account', async () => {
    const res = await deleteMe(envWithClaims)

    expect(res.status).toBe(200)
    const [{ input }] = mockCognitoSend.mock.lastCall as unknown as [
      { input: { Username: string } },
    ]
    expect(input.Username).toBe('cognito-sub')
  })

  it('still succeeds when the Cognito identity is already gone', async () => {
    const { UserNotFoundException } = await import(
      '@aws-sdk/client-cognito-identity-provider'
    )
    mockCognitoSend.mockRejectedValueOnce(
      new (UserNotFoundException as unknown as new () => Error)()
    )

    const res = await deleteMe(envWithClaims)

    expect(res.status).toBe(200)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('reports, but does not fail, an unexpected Cognito failure', async () => {
    // The InfernoLog account is already gone; a leftover identity just means a
    // fresh account on next sign-in.
    mockCognitoSend.mockRejectedValueOnce(new Error('AccessDenied'))

    const res = await deleteMe(envWithClaims)

    expect(res.status).toBe(200)
    expect(Sentry.captureException).toHaveBeenCalled()
  })
})
