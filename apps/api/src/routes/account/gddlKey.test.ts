import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import { buildApp as buildAppWith, TEST_USER_ID } from '../../test/utils'
import { encryptSecret } from '../../utils/kms'
import { verifyGddlApiKey, GddlInvalidKeyError } from '../../utils/gddl'

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

beforeEach(() => {
  // Clear call history (preserving the default mock implementations set in the
  // vi.mock factories) so per-test `not.toHaveBeenCalled()` assertions are
  // accurate across tests.
  vi.clearAllMocks()
  mockReset(prisma)
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
