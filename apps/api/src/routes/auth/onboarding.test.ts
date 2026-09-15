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
vi.mock('../../services/user', () => {
  class SignupEmailTakenError extends Error {}
  return { createUserForSignup: mockCreateUserForSignup, SignupEmailTakenError }
})

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
const { UserNotFoundException: SdkUserNotFound } =
  await import('@aws-sdk/client-cognito-identity-provider')
const UserNotFoundException = SdkUserNotFound as unknown as new () => Error
const { logger } = await import('../../utils/logger')
const { SignupEmailTakenError } = await import('../../services/user')
const app = (await import('./onboarding')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const SUB = 'cognito-sub-abc'
const EMAIL = 'player@example.com'

/** A Google identity's claims, as API Gateway flattens them. */
const GOOGLE_CLAIMS = {
  sub: SUB,
  email: EMAIL,
  email_verified: 'true',
  identities:
    '[{"userId":"1234","providerName":"Google","providerType":"Google","primary":"true"}]',
}

/** A native (email-and-password) Cognito user's claims: no `identities`. */
const PASSWORD_CLAIMS = { sub: SUB, email: EMAIL, email_verified: 'true' }

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
  return (
    mockCognitoSend.mock.lastCall?.[0] as {
      input: { UserPoolId?: string; Username: string }
    }
  ).input
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.authIdentity.findUnique.mockReset()
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

    const res = await post('/auth/signup/start', GOOGLE_CLAIMS)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { id: 'user-1', onboardingCompleted: false },
    })
    expect(mockCreateUserForSignup).toHaveBeenCalledWith(EMAIL, SUB, 'GOOGLE')
  })

  it('creates a PASSWORD identity for a native Cognito user', async () => {
    mockCreateUserForSignup.mockResolvedValue({
      id: 'user-1',
      onboardingCompleted: false,
    })

    const res = await post('/auth/signup/start', PASSWORD_CLAIMS)

    expect(res.status).toBe(200)
    expect(mockCreateUserForSignup).toHaveBeenCalledWith(EMAIL, SUB, 'PASSWORD')
  })

  it.each([
    ['absent', { sub: SUB, email: EMAIL }],
    ['false', { ...PASSWORD_CLAIMS, email_verified: 'false' }],
  ])(
    '403s and creates nothing when email_verified is %s',
    async (_label, claims) => {
      const res = await post('/auth/signup/start', claims)

      expect(res.status).toBe(403)
      await expect(res.json()).resolves.toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
      })
      expect(mockCreateUserForSignup).not.toHaveBeenCalled()
    }
  )

  it('400s for a federated provider InfernoLog does not support', async () => {
    const res = await post('/auth/signup/start', {
      ...GOOGLE_CLAIMS,
      identities: '[{"providerName":"Facebook"}]',
    })

    expect(res.status).toBe(400)
    expect(mockCreateUserForSignup).not.toHaveBeenCalled()
  })

  it('409s and discards the Cognito user when another account has the email', async () => {
    mockCreateUserForSignup.mockRejectedValue(new SignupEmailTakenError())

    const res = await post('/auth/signup/start', GOOGLE_CLAIMS)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'ACCOUNT_EXISTS' })
    expect(lastDeleteInput()).toEqual({ UserPoolId: 'pool-1', Username: SUB })
  })

  it('still 409s when that Cognito user is already gone', async () => {
    mockCreateUserForSignup.mockRejectedValue(new SignupEmailTakenError())
    mockCognitoSend.mockRejectedValue(new UserNotFoundException())

    const res = await post('/auth/signup/start', GOOGLE_CLAIMS)

    expect(res.status).toBe(409)
  })

  it('500s when discarding the Cognito user fails for another reason', async () => {
    mockCreateUserForSignup.mockRejectedValue(new SignupEmailTakenError())
    mockCognitoSend.mockRejectedValue(new Error('Cognito unavailable'))

    const res = await post('/auth/signup/start', GOOGLE_CLAIMS)

    expect(res.status).toBe(500)
  })

  it('500s on any other failure creating the user', async () => {
    mockCreateUserForSignup.mockRejectedValue(new Error('database down'))

    const res = await post('/auth/signup/start', GOOGLE_CLAIMS)

    expect(res.status).toBe(500)
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('reports the existing onboarding state on a repeat submit', async () => {
    // Idempotent by design — the frontend needs onboardingCompleted to decide
    // between the wizard and the app, even when the row already existed.
    mockCreateUserForSignup.mockResolvedValue({
      id: 'user-1',
      onboardingCompleted: true,
    })

    const res = await post('/auth/signup/start', GOOGLE_CLAIMS)

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
    prisma.authIdentity.findUnique.mockResolvedValue(null)

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { discarded: true } })
    expect(lastDeleteInput()).toEqual({
      UserPoolId: 'pool-1',
      Username: SUB,
    })
  })

  it('looks the identity up by its sub, not by email', async () => {
    prisma.authIdentity.findUnique.mockResolvedValue(null)

    await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(prisma.authIdentity.findUnique).toHaveBeenCalledWith({
      where: { cognitoSub: SUB },
      select: { id: true },
    })
  })

  it('refuses, without deleting, when a real account matches', async () => {
    // The frontend only calls this after GET /v1/me 404s, so a hit here means
    // the requests raced — deleting would orphan a live account's identity.
    prisma.authIdentity.findUnique.mockResolvedValue({ id: 'user-1' } as never)

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(400)
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('treats an already-deleted identity as success', async () => {
    // Double-click race: a concurrent reject got there first.
    prisma.authIdentity.findUnique.mockResolvedValue(null)
    mockCognitoSend.mockRejectedValue(new UserNotFoundException())

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { discarded: true } })
  })

  it('does not report success when the delete fails for another reason', async () => {
    // Anything other than "already gone" means the identity may still exist,
    // so it must not be reported as discarded.
    prisma.authIdentity.findUnique.mockResolvedValue(null)
    mockCognitoSend.mockRejectedValue(new Error('AccessDenied'))

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(500)
  })

  it('401s without touching the DB or Cognito when there are no claims', async () => {
    const res = await post('/auth/signin/reject', null)

    expect(res.status).toBe(401)
    expect(prisma.authIdentity.findUnique).not.toHaveBeenCalled()
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('logs the sub alone, never the claims payload', async () => {
    prisma.authIdentity.findUnique.mockResolvedValue(null)

    await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    const [context] = vi.mocked(logger.info).mock.lastCall as [
      Record<string, unknown>,
    ]
    expect(context).toEqual({ sub: SUB })
    expect(JSON.stringify(context)).not.toContain(EMAIL)
  })
})
