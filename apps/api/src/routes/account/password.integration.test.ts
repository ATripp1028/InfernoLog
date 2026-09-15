/**
 * Integration and leak tests for changing and adding a password from Settings.
 *
 * Postgres is real: the identity rows, the account-email change, the
 * single-use setup code and "the Google proof must be this account's" are all
 * database behaviour. Cognito, SES and JWT verification are mocked.
 *
 * ⚠️ CREDENTIALS — every test that sends a password or code also asserts
 * neither reaches a log line or a Sentry call. See CLAUDE.md "Credential
 * handling".
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
vi.mock('../../utils/logger', async () => {
  const { leakCapture } = await import('../../test/captureLeaks')
  return { logger: leakCapture.logger }
})
vi.mock('@sentry/node', async () => {
  const { leakCapture } = await import('../../test/captureLeaks')
  return leakCapture.sentry
})
vi.mock('aws-jwt-verify', async () =>
  (await import('../../test/fakeGoogleProof')).fakeJwtVerifyModule()
)

const { mockSesSend, mockCognitoSend } = vi.hoisted(() => ({
  mockSesSend: vi.fn(),
  mockCognitoSend: vi.fn(),
}))
vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = mockSesSend
  },
  SendEmailCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}))
vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class NotAuthorizedException extends Error {}
  class UsernameExistsException extends Error {}
  class InvalidPasswordException extends Error {}
  class UserNotFoundException extends Error {}
  const command = (name: string) =>
    class {
      readonly name = name
      constructor(public input: Record<string, unknown>) {}
    }
  return {
    CognitoIdentityProviderClient: class {
      send = mockCognitoSend
    },
    AdminCreateUserCommand: command('AdminCreateUser'),
    AdminGetUserCommand: command('AdminGetUser'),
    AdminSetUserPasswordCommand: command('AdminSetUserPassword'),
    AdminInitiateAuthCommand: command('AdminInitiateAuth'),
    AdminUserGlobalSignOutCommand: command('AdminUserGlobalSignOut'),
    AdminDeleteUserCommand: command('AdminDeleteUser'),
    NotAuthorizedException,
    UsernameExistsException,
    InvalidPasswordException,
    UserNotFoundException,
  }
})

const { leakCapture, leakSentinel } = await import('../../test/captureLeaks')
const { fakeGoogleProof } = await import('../../test/fakeGoogleProof')
const sdk = await import('@aws-sdk/client-cognito-identity-provider')
const NotAuthorized = sdk.NotAuthorizedException as unknown as new (
  message: string
) => Error
const UsernameExists = sdk.UsernameExistsException as unknown as new () => Error
const InvalidPassword =
  sdk.InvalidPasswordException as unknown as new () => Error
const { MAX_SENDS_PER_ADDRESS_PER_HOUR } =
  await import('../../services/verification')
const { default: accountApp } = await import('./index')

const prisma = getTestPrisma()
type Sent = { name: string; input: Record<string, unknown> }

const ACCOUNT_EMAIL = 'player@example.com'
const GOOGLE_SUB = 'sub-google'

// ─── helpers ─────────────────────────────────────────────────────────────────

function call(userId: string, method: string, path: string, body: unknown) {
  return buildApp(accountApp, { userId }).request(
    path,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { requestContext: { http: { sourceIp: '203.0.113.20' } } }
  )
}

function cognitoCalls(): Sent[] {
  return mockCognitoSend.mock.calls.map((c) => c[0] as Sent)
}

/** The six-digit code from the most recent email. */
function emailedCode(): string {
  const input = mockSesSend.mock.lastCall?.[0].input as {
    Content: { Simple: { Body: { Text: { Data: string } } } }
  }
  const match = /\b(\d{6})\b/.exec(input.Content.Simple.Body.Text.Data)
  if (!match?.[1]) throw new Error('No code in the last email')
  return match[1]
}

function lastEmailTo(): string | undefined {
  const input = mockSesSend.mock.lastCall?.[0].input as {
    Destination: { ToAddresses: string[] }
  }
  return input.Destination.ToAddresses[0]
}

async function googleOnlyAccount() {
  const user = await seedUser(prisma, { email: ACCOUNT_EMAIL })
  await seedAuthIdentity(prisma, user.id, GOOGLE_SUB, 'GOOGLE')
  return user
}

async function passwordAccount() {
  const user = await seedUser(prisma, { email: ACCOUNT_EMAIL })
  await prisma.authIdentity.create({
    data: {
      userId: user.id,
      provider: 'PASSWORD',
      cognitoSub: 'sub-password',
      email: ACCOUNT_EMAIL,
    },
  })
  return user
}

beforeEach(async () => {
  await truncateAll(prisma)
  leakCapture.reset()
  mockSesSend.mockReset().mockResolvedValue({})
  mockCognitoSend
    .mockReset()
    .mockImplementation(async (command: Sent) =>
      command.name === 'AdminCreateUser'
        ? { User: { Attributes: [{ Name: 'sub', Value: 'sub-new-password' }] } }
        : {}
    )
  vi.stubEnv('VERIFICATION_CODE_SECRET', 'test-hmac-key-not-a-real-secret')
  vi.stubEnv('COGNITO_USER_POOL_ID', 'pool-1')
  vi.stubEnv('COGNITO_CLIENT_ID', 'web-client')
  vi.stubEnv('COGNITO_SERVER_CLIENT_ID', 'server-client')
  vi.stubEnv('EMAIL_FROM', 'InfernoLog <no-reply@infernolog.com>')
  vi.stubEnv(
    'SES_IDENTITY_ARN',
    'arn:aws:ses:us-east-1:0:identity/infernolog.com'
  )
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await prisma.$disconnect()
})

// ─── PUT /me/password ────────────────────────────────────────────────────────

describe('PUT /me/password', () => {
  it('checks the current password, sets the new one, and signs out other sessions', async () => {
    const user = await passwordAccount()
    const currentPassword = leakSentinel('current')
    const newPassword = leakSentinel('new')

    const res = await call(user.id, 'PUT', '/me/password', {
      currentPassword,
      newPassword,
      signOutOthers: true,
    })

    expect(res.status).toBe(200)
    const calls = cognitoCalls()
    expect(calls.map((c) => c.name)).toEqual([
      'AdminInitiateAuth',
      'AdminSetUserPassword',
      'AdminUserGlobalSignOut',
    ])
    expect(calls[0]?.input).toMatchObject({
      ClientId: 'server-client',
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: ACCOUNT_EMAIL, PASSWORD: currentPassword },
    })
    expect(calls[1]?.input).toMatchObject({
      Password: newPassword,
      Permanent: true,
    })
    expect(await res.text()).not.toContain(newPassword)
    leakCapture.expectNoLeak(currentPassword, newPassword)
  })

  it('leaves other sessions alone when asked', async () => {
    const user = await passwordAccount()
    await call(user.id, 'PUT', '/me/password', {
      currentPassword: leakSentinel('current'),
      newPassword: leakSentinel('new'),
      signOutOthers: false,
    })
    expect(cognitoCalls().map((c) => c.name)).not.toContain(
      'AdminUserGlobalSignOut'
    )
  })

  it('refuses a wrong current password without changing anything', async () => {
    const user = await passwordAccount()
    const currentPassword = leakSentinel('wrong')
    const newPassword = leakSentinel('new')
    mockCognitoSend.mockRejectedValueOnce(
      new NotAuthorized('Incorrect username or password.')
    )

    const res = await call(user.id, 'PUT', '/me/password', {
      currentPassword,
      newPassword,
      signOutOthers: true,
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      code: 'CURRENT_PASSWORD_INCORRECT',
    })
    expect(cognitoCalls()).toHaveLength(1)
    leakCapture.expectNoLeak(currentPassword, newPassword)
  })

  it("429s once Cognito's lockout kicks in", async () => {
    const user = await passwordAccount()
    mockCognitoSend.mockRejectedValueOnce(
      new NotAuthorized('Password attempts exceeded')
    )

    const res = await call(user.id, 'PUT', '/me/password', {
      currentPassword: leakSentinel('current'),
      newPassword: leakSentinel('new'),
      signOutOthers: false,
    })

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
    })
  })

  it('409s for an account with no password', async () => {
    const user = await googleOnlyAccount()
    const res = await call(user.id, 'PUT', '/me/password', {
      currentPassword: leakSentinel('current'),
      newPassword: leakSentinel('new'),
      signOutOthers: false,
    })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'NO_PASSWORD' })
    expect(mockCognitoSend).not.toHaveBeenCalled()
  })

  it('a forced 500 reports without either password, and a bad body echoes nothing', async () => {
    const user = await passwordAccount()
    const currentPassword = leakSentinel('current')
    const newPassword = leakSentinel('new')
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito unavailable'))

    const failed = await call(user.id, 'PUT', '/me/password', {
      currentPassword,
      newPassword,
      signOutOthers: true,
    })
    expect(failed.status).toBe(500)
    expect(leakCapture.sentryCalls()).toHaveLength(1)

    const invalid = await call(user.id, 'PUT', '/me/password', {
      currentPassword,
      newPassword: 'x' + newPassword.toLowerCase().replace(/\d/g, ''),
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).not.toContain(currentPassword)
    leakCapture.expectNoLeak(currentPassword, newPassword)
  })
})

// ─── password setup ──────────────────────────────────────────────────────────

describe('adding a password to a Google-only account', () => {
  it('uses the account email with no code, and records the identity', async () => {
    const user = await googleOnlyAccount()
    const googleProof = fakeGoogleProof({ sub: GOOGLE_SUB })
    const newPassword = leakSentinel('new')

    const start = await call(user.id, 'POST', '/me/password/setup/start', {
      email: ACCOUNT_EMAIL,
      googleProof,
    })
    expect(start.status).toBe(200)
    await expect(start.json()).resolves.toEqual({
      data: { codeRequired: false },
    })
    expect(mockSesSend).not.toHaveBeenCalled()

    const res = await call(user.id, 'POST', '/me/password/setup', {
      email: ACCOUNT_EMAIL,
      newPassword,
      googleProof,
    })

    expect(res.status).toBe(201)
    await expect(
      prisma.authIdentity.findUniqueOrThrow({
        where: { cognitoSub: 'sub-new-password' },
      })
    ).resolves.toMatchObject({
      userId: user.id,
      provider: 'PASSWORD',
      email: ACCOUNT_EMAIL,
    })
    leakCapture.expectNoLeak(newPassword)
  })

  it('proves a new address with a code, makes it the account email, and notifies the old one', async () => {
    const user = await googleOnlyAccount()
    const googleProof = fakeGoogleProof({ sub: GOOGLE_SUB })
    const newPassword = leakSentinel('new')
    const newEmail = 'new@example.com'

    const start = await call(user.id, 'POST', '/me/password/setup/start', {
      email: newEmail,
      googleProof,
    })
    expect(start.status).toBe(202)
    expect(lastEmailTo()).toBe(newEmail)
    const verificationCode = emailedCode()

    const res = await call(user.id, 'POST', '/me/password/setup', {
      email: newEmail,
      newPassword,
      googleProof,
      verificationCode,
    })

    expect(res.status).toBe(201)
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe(newEmail)
    expect(lastEmailTo()).toBe(ACCOUNT_EMAIL)
    leakCapture.expectNoLeak(newPassword, verificationCode)
  })

  it('refuses a new address without the right code', async () => {
    const user = await googleOnlyAccount()
    const googleProof = fakeGoogleProof({ sub: GOOGLE_SUB })
    const newPassword = leakSentinel('new')
    await call(user.id, 'POST', '/me/password/setup/start', {
      email: 'new@example.com',
      googleProof,
    })
    const right = emailedCode()

    for (const verificationCode of [
      undefined,
      right === '000000' ? '000001' : '000000',
    ]) {
      const res = await call(user.id, 'POST', '/me/password/setup', {
        email: 'new@example.com',
        newPassword,
        googleProof,
        ...(verificationCode ? { verificationCode } : {}),
      })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({ code: 'INVALID_CODE' })
    }
    expect(mockCognitoSend).not.toHaveBeenCalled()
    leakCapture.expectNoLeak(newPassword, right)
  })

  it('sends a notice, not a code, to an address another account has', async () => {
    const user = await googleOnlyAccount()
    await seedUser(prisma, { email: 'taken@example.com' })

    const res = await call(user.id, 'POST', '/me/password/setup/start', {
      email: 'taken@example.com',
      googleProof: fakeGoogleProof({ sub: GOOGLE_SUB }),
    })

    expect(res.status).toBe(202)
    const input = mockSesSend.mock.lastCall?.[0].input as {
      Content: { Simple: { Subject: { Data: string } } }
    }
    expect(input.Content.Simple.Subject.Data).toBe(
      'You already have an InfernoLog account'
    )
  })

  it.each([
    [
      'a stale re-confirmation',
      () => fakeGoogleProof({ sub: GOOGLE_SUB, ageSeconds: 3600 }),
    ],
    [
      "another account's Google identity",
      () => fakeGoogleProof({ sub: 'sub-someone-else' }),
    ],
    ['a token that does not verify', () => 'not-a-token'],
  ])('403s for %s', async (_label, proof) => {
    const user = await googleOnlyAccount()
    const newPassword = leakSentinel('new')

    for (const path of ['/me/password/setup/start', '/me/password/setup']) {
      const res = await call(user.id, 'POST', path, {
        email: ACCOUNT_EMAIL,
        newPassword,
        googleProof: proof(),
      })
      expect(res.status).toBe(403)
      await expect(res.json()).resolves.toMatchObject({
        code: 'REAUTH_REQUIRED',
      })
    }
    expect(mockCognitoSend).not.toHaveBeenCalled()
    leakCapture.expectNoLeak(newPassword)
  })

  it('409s for an account that already has a password', async () => {
    const user = await passwordAccount()
    await seedAuthIdentity(prisma, user.id, GOOGLE_SUB, 'GOOGLE')

    const res = await call(user.id, 'POST', '/me/password/setup', {
      email: ACCOUNT_EMAIL,
      newPassword: leakSentinel('new'),
      googleProof: fakeGoogleProof({ sub: GOOGLE_SUB }),
    })

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'PASSWORD_EXISTS' })
  })

  it('removes the new Cognito user again when the address is taken in a race', async () => {
    const user = await googleOnlyAccount()
    const googleProof = fakeGoogleProof({ sub: GOOGLE_SUB })
    const newPassword = leakSentinel('new')
    const newEmail = 'new@example.com'
    await call(user.id, 'POST', '/me/password/setup/start', {
      email: newEmail,
      googleProof,
    })
    const verificationCode = emailedCode()
    // Another account claims the address after the route's own check, while
    // the Cognito user is being created — only the unique email catches it.
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminCreateUser') {
        await seedUser(prisma, { email: newEmail })
        return {
          User: { Attributes: [{ Name: 'sub', Value: 'sub-new-password' }] },
        }
      }
      return {}
    })

    const res = await call(user.id, 'POST', '/me/password/setup', {
      email: newEmail,
      newPassword,
      googleProof,
      verificationCode,
    })

    expect(res.status).toBe(409)
    const deleted = cognitoCalls().find((c) => c.name === 'AdminDeleteUser')
    expect(deleted?.input).toMatchObject({ Username: 'sub-new-password' })
    expect(
      await prisma.authIdentity.count({ where: { provider: 'PASSWORD' } })
    ).toBe(0)
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe(ACCOUNT_EMAIL)
    leakCapture.expectNoLeak(newPassword, verificationCode)
  })

  it('a forced 500 from Cognito reports without the password', async () => {
    const user = await googleOnlyAccount()
    const newPassword = leakSentinel('new')
    mockCognitoSend.mockRejectedValue(new Error('Cognito unavailable'))

    const res = await call(user.id, 'POST', '/me/password/setup', {
      email: ACCOUNT_EMAIL,
      newPassword,
      googleProof: fakeGoogleProof({ sub: GOOGLE_SUB }),
    })

    expect(res.status).toBe(500)
    expect(leakCapture.sentryCalls()).toHaveLength(1)
    leakCapture.expectNoLeak(newPassword)
  })
})

describe('password setup edge cases', () => {
  it('429s once the new address has had its codes this hour', async () => {
    const user = await googleOnlyAccount()
    const googleProof = fakeGoogleProof({ sub: GOOGLE_SUB })
    for (let i = 0; i < MAX_SENDS_PER_ADDRESS_PER_HOUR; i++) {
      await call(user.id, 'POST', '/me/password/setup/start', {
        email: 'new@example.com',
        googleProof,
      })
    }

    const res = await call(user.id, 'POST', '/me/password/setup/start', {
      email: 'new@example.com',
      googleProof,
    })

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('still succeeds when the old-address notice fails to send, and reports it', async () => {
    const user = await googleOnlyAccount()
    const googleProof = fakeGoogleProof({ sub: GOOGLE_SUB })
    const newPassword = leakSentinel('new')
    await call(user.id, 'POST', '/me/password/setup/start', {
      email: 'new@example.com',
      googleProof,
    })
    const verificationCode = emailedCode()
    mockSesSend.mockRejectedValue(new Error('MessageRejected'))

    const res = await call(user.id, 'POST', '/me/password/setup', {
      email: 'new@example.com',
      newPassword,
      googleProof,
      verificationCode,
    })

    expect(res.status).toBe(201)
    expect(leakCapture.sentryCalls()).toHaveLength(1)
    leakCapture.expectNoLeak(newPassword, verificationCode)
  })

  it('409s when the address already has a native user an account signs in with', async () => {
    const user = await googleOnlyAccount()
    const other = await seedUser(prisma, { email: 'other@example.com' })
    await seedAuthIdentity(prisma, other.id, 'sub-owned', 'PASSWORD')
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminCreateUser') throw new UsernameExists()
      return { UserAttributes: [{ Name: 'sub', Value: 'sub-owned' }] }
    })

    const res = await call(user.id, 'POST', '/me/password/setup', {
      email: ACCOUNT_EMAIL,
      newPassword: leakSentinel('new'),
      googleProof: fakeGoogleProof({ sub: GOOGLE_SUB }),
    })

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'ACCOUNT_EXISTS' })
    expect(cognitoCalls().map((c) => c.name)).not.toContain('AdminDeleteUser')
  })

  it('400s when Cognito refuses the new password, on setup and on change', async () => {
    const newPassword = leakSentinel('new')
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminSetUserPassword') throw new InvalidPassword()
      return {
        User: { Attributes: [{ Name: 'sub', Value: 'sub-new-password' }] },
      }
    })

    const google = await googleOnlyAccount()
    const setup = await call(google.id, 'POST', '/me/password/setup', {
      email: ACCOUNT_EMAIL,
      newPassword,
      googleProof: fakeGoogleProof({ sub: GOOGLE_SUB }),
    })
    expect(setup.status).toBe(400)

    await truncateAll(prisma)
    const withPassword = await passwordAccount()
    const change = await call(withPassword.id, 'PUT', '/me/password', {
      currentPassword: leakSentinel('current'),
      newPassword,
      signOutOthers: false,
    })
    expect(change.status).toBe(400)
    expect(await change.text()).not.toContain(newPassword)
    leakCapture.expectNoLeak(newPassword)
  })
})
