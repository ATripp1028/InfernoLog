/**
 * Unit tests for the claims-only auth routes.
 *
 * These run BEFORE authMiddleware, so they take identity straight from the
 * verified JWT claims rather than a `users` row. Two properties carry weight:
 * signup/start must be idempotent (a double-submit, or a Google account that
 * already has an InfernoLog account going through Sign Up, must not error), and
 * signin/reject must delete the Cognito identity — that deletion is what backs
 * the claim that a rejected sign-in retains nothing. Prisma, Cognito and the
 * user service are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockCreateUserForSignup } = vi.hoisted(() => ({
  mockCreateUserForSignup: vi.fn(),
}))
vi.mock('../../services/user', () => ({
  createUserForSignup: mockCreateUserForSignup,
}))

const { mockCognitoSend } = vi.hoisted(() => ({ mockCognitoSend: vi.fn() }))

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  // A real class so the handler's `err instanceof UserNotFoundException`
  // narrowing behaves the way it does against the SDK's own error type.
  class UserNotFoundException extends Error {
    constructor() {
      super('User does not exist')
      this.name = 'UserNotFoundException'
    }
  }
  return {
    CognitoIdentityProviderClient: class {
      send = mockCognitoSend
    },
    AdminDeleteUserCommand: class {
      constructor(public input: { UserPoolId?: string; Username: string }) {}
    },
    UserNotFoundException,
  }
})

// Cast to a no-arg constructor: the mock's class takes none, but the type
// comes from the real SDK, whose constructor requires an options bag.
const { UserNotFoundException: SdkUserNotFound } = await import(
  '@aws-sdk/client-cognito-identity-provider'
)
const UserNotFoundException = SdkUserNotFound as unknown as new () => Error
const { logger } = await import('../../utils/logger')
const app = (await import('./onboarding')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const SUB = 'cognito-sub-abc'
const EMAIL = 'player@example.com'

/** The API Gateway env shape getVerifiedClaims reads the JWT claims out of. */
function envWithClaims(claims: Record<string, string> | null) {
  return claims
    ? { requestContext: { authorizer: { jwt: { claims } } } }
    : { requestContext: {} }
}

function post(path: string, claims: Record<string, string> | null) {
  return app.request(path, { method: 'POST' }, envWithClaims(claims))
}

/** The AdminDeleteUserCommand input from the most recent Cognito send. */
function lastDeleteInput(): { UserPoolId?: string; Username: string } {
  return (mockCognitoSend.mock.lastCall?.[0] as { input: { UserPoolId?: string; Username: string } })
    .input
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.user.findUnique.mockReset()
  mockCreateUserForSignup.mockReset()
  mockCognitoSend.mockReset().mockResolvedValue({})
  vi.stubEnv('COGNITO_USER_POOL_ID', 'pool-1')
})

// ─── POST /auth/signup/start ─────────────────────────────────────────────────

describe('POST /auth/signup/start', () => {
  it('creates the user and returns its id and onboarding state', async () => {
    mockCreateUserForSignup.mockResolvedValue({
      id: 'user-1',
      onboardingCompleted: false,
    })

    const res = await post('/auth/signup/start', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { id: 'user-1', onboardingCompleted: false },
    })
    expect(mockCreateUserForSignup).toHaveBeenCalledWith(EMAIL, SUB)
  })

  it('reports the existing onboarding state on a repeat submit', async () => {
    // Idempotent by design — the frontend needs onboardingCompleted to decide
    // between the wizard and the app, even when the row already existed.
    mockCreateUserForSignup.mockResolvedValue({
      id: 'user-1',
      onboardingCompleted: true,
    })

    const res = await post('/auth/signup/start', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { id: 'user-1', onboardingCompleted: true },
    })
  })

  it.each([
    ['there are no claims', null],
    ['the claims carry no email', { sub: SUB }],
  ])('401s and creates nothing when %s', async (_label, claims) => {
    const res = await post('/auth/signup/start', claims)

    expect(res.status).toBe(401)
    expect(mockCreateUserForSignup).not.toHaveBeenCalled()
  })
})

// ─── POST /auth/signin/reject ────────────────────────────────────────────────

describe('POST /auth/signin/reject', () => {
  it('deletes the Cognito identity when no InfernoLog user matches', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { discarded: true } })
    expect(lastDeleteInput()).toEqual({
      UserPoolId: 'pool-1',
      Username: SUB,
    })
  })

  it('looks the user up by cognitoSub, not by email', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { cognitoSub: SUB },
      select: { id: true },
    })
  })

  it('refuses, without deleting, when a real account matches', async () => {
    // The frontend only calls this after GET /v1/me 404s, so a hit here means
    // the requests raced — deleting would orphan a live account's identity.
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' } as never)

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(400)
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('treats an already-deleted identity as success', async () => {
    // Double-click race: a concurrent reject got there first.
    prisma.user.findUnique.mockResolvedValue(null)
    mockCognitoSend.mockRejectedValue(new UserNotFoundException())

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { discarded: true } })
  })

  it('does not report success when the delete fails for another reason', async () => {
    // Anything other than "already gone" means the identity may still exist,
    // so it must not be reported as discarded.
    prisma.user.findUnique.mockResolvedValue(null)
    mockCognitoSend.mockRejectedValue(new Error('AccessDenied'))

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(500)
  })

  it('401s without touching the DB or Cognito when there are no claims', async () => {
    const res = await post('/auth/signin/reject', null)

    expect(res.status).toBe(401)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('logs the sub alone, never the claims payload', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    const [context] = vi.mocked(logger.info).mock.lastCall as [
      Record<string, unknown>,
    ]
    expect(context).toEqual({ sub: SUB })
    expect(JSON.stringify(context)).not.toContain(EMAIL)
  })
})
