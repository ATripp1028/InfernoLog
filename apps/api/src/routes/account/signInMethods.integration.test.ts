/**
 * Integration tests for connecting Google and removing sign-in methods.
 *
 * The "at least one way to sign in" invariant is enforced under a row lock, so
 * whether two concurrent removals can strip an account bare is a question only
 * a real Postgres can answer. Cognito and JWT verification are mocked.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  seedAuthIdentity,
  seedUser,
  truncateAll,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('aws-jwt-verify', async () =>
  (await import('../../test/fakeGoogleProof')).fakeJwtVerifyModule()
)

const { mockCognitoSend } = vi.hoisted(() => ({ mockCognitoSend: vi.fn() }))
vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class UserNotFoundException extends Error {}
  return {
    CognitoIdentityProviderClient: class {
      send = mockCognitoSend
    },
    AdminDeleteUserCommand: class {
      readonly name = 'AdminDeleteUser'
      constructor(public input: Record<string, unknown>) {}
    },
    UserNotFoundException,
  }
})

const { fakeGoogleProof } = await import('../../test/fakeGoogleProof')
const sdk = await import('@aws-sdk/client-cognito-identity-provider')
const UserNotFound = sdk.UserNotFoundException as unknown as new () => Error
const { default: accountApp } = await import('./index')

const prisma = getTestPrisma()

function call(
  userId: string,
  method: string,
  path: string,
  body?: unknown,
  sub?: string
) {
  return buildApp(accountApp, { userId }).request(
    path,
    {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    },
    sub
      ? { requestContext: { authorizer: { jwt: { claims: { sub } } } } }
      : { requestContext: {} }
  )
}

const deletedUsernames = () =>
  mockCognitoSend.mock.calls.map(
    (c) => (c[0] as { input: { Username: string } }).input.Username
  )

beforeEach(async () => {
  await truncateAll(prisma)
  mockCognitoSend.mockReset().mockResolvedValue({})
  vi.stubEnv('COGNITO_USER_POOL_ID', 'pool-1')
  vi.stubEnv('COGNITO_CLIENT_ID', 'web-client')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await prisma.$disconnect()
})

// ─── connect Google ──────────────────────────────────────────────────────────

describe('POST /me/identities/google', () => {
  it('connects the proven Google account, recording its email only on the identity', async () => {
    const user = await seedUser(prisma, { email: 'player@example.com' })
    await seedAuthIdentity(prisma, user.id, 'sub-password', 'PASSWORD')

    const res = await call(user.id, 'POST', '/me/identities/google', {
      googleProof: fakeGoogleProof({
        sub: 'sub-google',
        email: 'Someone.Else@Gmail.test',
      }),
    })

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toMatchObject({
      data: {
        identity: {
          provider: 'GOOGLE',
          email: 'someone.else@gmail.test',
          canSignIn: true,
        },
      },
    })
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe('player@example.com')
  })

  it("connects even when Google's email is another account's email", async () => {
    const user = await seedUser(prisma)
    await seedUser(prisma, { email: 'shared@example.com' })

    const res = await call(user.id, 'POST', '/me/identities/google', {
      googleProof: fakeGoogleProof({
        sub: 'sub-google',
        email: 'shared@example.com',
      }),
    })

    expect(res.status).toBe(201)
  })

  it("refuses a Google account that is another account's sign-in, without deleting it", async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedAuthIdentity(prisma, other.id, 'sub-google', 'GOOGLE')

    const res = await call(user.id, 'POST', '/me/identities/google', {
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      code: 'CONNECTED_ELSEWHERE',
    })
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('says so when that Google account is already connected here', async () => {
    const user = await seedUser(prisma)
    await seedAuthIdentity(prisma, user.id, 'sub-google', 'GOOGLE')

    const res = await call(user.id, 'POST', '/me/identities/google', {
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      code: 'ALREADY_CONNECTED',
    })
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it("refuses a second Google account and discards the re-confirmation's Cognito user", async () => {
    const user = await seedUser(prisma)
    await seedAuthIdentity(prisma, user.id, 'sub-google-1', 'GOOGLE')

    const res = await call(user.id, 'POST', '/me/identities/google', {
      googleProof: fakeGoogleProof({ sub: 'sub-google-2' }),
    })

    expect(res.status).toBe(409)
    expect(deletedUsernames()).toEqual(['sub-google-2'])
    expect(await prisma.authIdentity.count()).toBe(1)
  })

  it.each([
    ['stale', () => fakeGoogleProof({ sub: 'sub-google', ageSeconds: 3600 })],
    [
      'not Google',
      () => fakeGoogleProof({ sub: 'sub-x', provider: 'Facebook' }),
    ],
    ['unverifiable', () => 'nope'],
  ])('403s for a proof that is %s', async (_label, proof) => {
    const user = await seedUser(prisma)

    const res = await call(user.id, 'POST', '/me/identities/google', {
      googleProof: proof(),
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ code: 'REAUTH_REQUIRED' })
    expect(await prisma.authIdentity.count()).toBe(0)
  })

  it('400s on a missing proof', async () => {
    const user = await seedUser(prisma)
    const res = await call(user.id, 'POST', '/me/identities/google', {})
    expect(res.status).toBe(400)
  })
})

// ─── remove ──────────────────────────────────────────────────────────────────

describe('DELETE /me/identities/:id', () => {
  async function accountWithBoth() {
    const user = await seedUser(prisma)
    const google = await seedAuthIdentity(
      prisma,
      user.id,
      'sub-google',
      'GOOGLE'
    )
    const password = await seedAuthIdentity(
      prisma,
      user.id,
      'sub-password',
      'PASSWORD'
    )
    return { user, google, password }
  }

  it('removes a method while another remains, deleting its Cognito user', async () => {
    const { user, google } = await accountWithBoth()

    const res = await call(
      user.id,
      'DELETE',
      `/me/identities/${google.id}`,
      undefined,
      'sub-password'
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { removed: true, signedOut: false },
    })
    expect(deletedUsernames()).toEqual(['sub-google'])
    expect(
      await prisma.authIdentity.findUnique({ where: { id: google.id } })
    ).toBeNull()
  })

  it('reports when the removed method is the one this session signed in with', async () => {
    const { user, password } = await accountWithBoth()

    const res = await call(
      user.id,
      'DELETE',
      `/me/identities/${password.id}`,
      undefined,
      'sub-password'
    )

    await expect(res.json()).resolves.toMatchObject({
      data: { signedOut: true },
    })
  })

  it('refuses to remove the last way to sign in, touching nothing', async () => {
    const user = await seedUser(prisma)
    const only = await seedAuthIdentity(prisma, user.id, 'sub-google', 'GOOGLE')
    await prisma.authIdentity.create({
      data: { userId: user.id, provider: 'DISCORD', providerAccountId: '123' },
    })

    const res = await call(user.id, 'DELETE', `/me/identities/${only.id}`)

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      code: 'LAST_SIGN_IN_METHOD',
    })
    expect(mockCognitoSend).not.toHaveBeenCalled()
    expect(await prisma.authIdentity.count()).toBe(2)
  })

  it('lets only one of two concurrent removals through', async () => {
    const { user, google, password } = await accountWithBoth()

    const results = await Promise.all([
      call(user.id, 'DELETE', `/me/identities/${google.id}`),
      call(user.id, 'DELETE', `/me/identities/${password.id}`),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(
      await prisma.authIdentity.count({
        where: { userId: user.id, cognitoSub: { not: null } },
      })
    ).toBe(1)
  })

  it('keeps the identity when the Cognito delete fails, so a retry can finish', async () => {
    const { user, google } = await accountWithBoth()
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito unavailable'))

    const failed = await call(user.id, 'DELETE', `/me/identities/${google.id}`)
    expect(failed.status).toBe(500)
    expect(
      await prisma.authIdentity.findUnique({ where: { id: google.id } })
    ).not.toBeNull()

    // The retry finds the Cognito user already gone and completes.
    mockCognitoSend.mockRejectedValueOnce(new UserNotFound())
    const retried = await call(user.id, 'DELETE', `/me/identities/${google.id}`)
    expect(retried.status).toBe(200)
  })

  it("404s for another account's identity, and 400s for Discord", async () => {
    const { user } = await accountWithBoth()
    const other = await seedUser(prisma)
    const theirs = await seedAuthIdentity(
      prisma,
      other.id,
      'sub-theirs',
      'GOOGLE'
    )
    const discord = await prisma.authIdentity.create({
      data: { userId: user.id, provider: 'DISCORD', providerAccountId: '123' },
    })

    expect(
      (await call(user.id, 'DELETE', `/me/identities/${theirs.id}`)).status
    ).toBe(404)
    expect(
      (await call(user.id, 'DELETE', `/me/identities/${discord.id}`)).status
    ).toBe(400)
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })
})
