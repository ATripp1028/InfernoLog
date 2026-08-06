import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import { buildApp as buildAppWith, TEST_USER_ID } from '../../test/utils'
import { mintConnectDiscordState } from '../auth/state'

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

vi.mock('../../services/gddlListSync', () => ({
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
