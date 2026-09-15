/**
 * Integration and leak tests for changing the account email from Settings.
 *
 * Postgres is real: the code is bound to the account and the new address, the
 * account email and the password sign-in's email change together, and a taken
 * address is a real unique constraint. Cognito, SES and JWT verification are
 * mocked.
 *
 * ⚠️ CREDENTIALS — tests that send the current password or a code also assert
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
  class AliasExistsException extends Error {}
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
    AdminInitiateAuthCommand: command('AdminInitiateAuth'),
    AdminUpdateUserAttributesCommand: command('AdminUpdateUserAttributes'),
    AdminGetUserCommand: command('AdminGetUser'),
    AdminDeleteUserCommand: command('AdminDeleteUser'),
    AdminCreateUserCommand: command('AdminCreateUser'),
    AdminSetUserPasswordCommand: command('AdminSetUserPassword'),
    AdminUserGlobalSignOutCommand: command('AdminUserGlobalSignOut'),
    NotAuthorizedException,
    AliasExistsException,
    UserNotFoundException,
    UsernameExistsException: class extends Error {},
    InvalidPasswordException: class extends Error {},
  }
})

const { leakCapture, leakSentinel } = await import('../../test/captureLeaks')
const { fakeGoogleProof } = await import('../../test/fakeGoogleProof')
const sdk = await import('@aws-sdk/client-cognito-identity-provider')
const NotAuthorized = sdk.NotAuthorizedException as unknown as new (
  message: string
) => Error
const AliasExists = sdk.AliasExistsException as unknown as new () => Error
const { default: accountApp } = await import('./index')

const prisma = getTestPrisma()
type Sent = { name: string; input: Record<string, unknown> }

const OLD = 'player@example.com'
const NEW = 'new@example.com'

function call(userId: string, path: string, body: unknown) {
  return buildApp(accountApp, { userId }).request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { requestContext: { http: { sourceIp: '203.0.113.30' } } }
  )
}

const cognitoCalls = (): Sent[] =>
  mockCognitoSend.mock.calls.map((c) => c[0] as Sent)

function lastEmail() {
  const input = mockSesSend.mock.lastCall?.[0].input as {
    Destination: { ToAddresses: string[] }
    Content: {
      Simple: { Subject: { Data: string }; Body: { Text: { Data: string } } }
    }
  }
  return {
    to: input.Destination.ToAddresses[0],
    subject: input.Content.Simple.Subject.Data,
    text: input.Content.Simple.Body.Text.Data,
  }
}

function emailedCode(): string {
  const match = /\b(\d{6})\b/.exec(lastEmail().text)
  if (!match?.[1]) throw new Error('No code in the last email')
  return match[1]
}

async function passwordAccount() {
  const user = await seedUser(prisma, { email: OLD })
  const identity = await prisma.authIdentity.create({
    data: {
      userId: user.id,
      provider: 'PASSWORD',
      cognitoSub: 'sub-password',
      email: OLD,
    },
  })
  return { user, identity }
}

async function googleOnlyAccount() {
  const user = await seedUser(prisma, { email: OLD })
  await prisma.authIdentity.create({
    data: {
      userId: user.id,
      provider: 'GOOGLE',
      cognitoSub: 'sub-google',
      email: 'player@gmail.test',
    },
  })
  return user
}

beforeEach(async () => {
  await truncateAll(prisma)
  leakCapture.reset()
  mockSesSend.mockReset().mockResolvedValue({})
  mockCognitoSend.mockReset().mockResolvedValue({})
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

describe('changing the email of an account with a password', () => {
  it('checks the password, codes the new address, and moves the account and sign-in together', async () => {
    const { user, identity } = await passwordAccount()
    const currentPassword = leakSentinel('current')

    const start = await call(user.id, '/me/email/start', {
      newEmail: 'New@Example.com',
      currentPassword,
    })
    expect(start.status).toBe(202)
    expect(cognitoCalls()[0]).toMatchObject({
      name: 'AdminInitiateAuth',
      input: { AuthParameters: { USERNAME: OLD, PASSWORD: currentPassword } },
    })
    expect(lastEmail().to).toBe(NEW)
    const verificationCode = emailedCode()

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(200)
    expect(cognitoCalls()[cognitoCalls().length - 1]).toMatchObject({
      name: 'AdminUpdateUserAttributes',
      input: {
        Username: OLD,
        UserAttributes: [
          { Name: 'email', Value: NEW },
          { Name: 'email_verified', Value: 'true' },
        ],
      },
    })
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe(NEW)
    expect(
      (
        await prisma.authIdentity.findUniqueOrThrow({
          where: { id: identity.id },
        })
      ).email
    ).toBe(NEW)
    expect(lastEmail()).toMatchObject({
      to: OLD,
      subject: 'Your InfernoLog email was changed',
    })
    leakCapture.expectNoLeak(currentPassword, verificationCode)
  })

  it('refuses a wrong or missing current password, sending nothing', async () => {
    const { user } = await passwordAccount()
    const currentPassword = leakSentinel('wrong')
    mockCognitoSend.mockRejectedValueOnce(
      new NotAuthorized('Incorrect username or password.')
    )

    const wrong = await call(user.id, '/me/email/start', {
      newEmail: NEW,
      currentPassword,
    })
    expect(wrong.status).toBe(400)
    await expect(wrong.json()).resolves.toMatchObject({
      code: 'CURRENT_PASSWORD_INCORRECT',
    })

    const missing = await call(user.id, '/me/email/start', {
      newEmail: NEW,
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })
    expect(missing.status).toBe(400)

    expect(mockSesSend).not.toHaveBeenCalled()
    leakCapture.expectNoLeak(currentPassword)
  })

  it('takes over a leftover native user holding the new address', async () => {
    const { user } = await passwordAccount()
    await call(user.id, '/me/email/start', {
      newEmail: NEW,
      currentPassword: leakSentinel('current'),
    })
    const verificationCode = emailedCode()
    let firstUpdate = true
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminUpdateUserAttributes' && firstUpdate) {
        firstUpdate = false
        throw new AliasExists()
      }
      if (command.name === 'AdminGetUser') {
        return { UserAttributes: [{ Name: 'sub', Value: 'sub-leftover' }] }
      }
      return {}
    })

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(200)
    expect(cognitoCalls().map((c) => c.name)).toEqual(
      expect.arrayContaining(['AdminGetUser', 'AdminDeleteUser'])
    )
  })

  it('409s when an account already signs in with the new address, changing nothing', async () => {
    const { user } = await passwordAccount()
    const other = await seedUser(prisma, { email: 'other@example.com' })
    await seedAuthIdentity(prisma, other.id, 'sub-owned', 'PASSWORD')
    await call(user.id, '/me/email/start', {
      newEmail: NEW,
      currentPassword: leakSentinel('current'),
    })
    const verificationCode = emailedCode()
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminUpdateUserAttributes') throw new AliasExists()
      return { UserAttributes: [{ Name: 'sub', Value: 'sub-owned' }] }
    })

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(409)
    expect(cognitoCalls().map((c) => c.name)).not.toContain('AdminDeleteUser')
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe(OLD)
  })

  it('moves the sign-in back if the account update loses a race for the address', async () => {
    const { user } = await passwordAccount()
    await call(user.id, '/me/email/start', {
      newEmail: NEW,
      currentPassword: leakSentinel('current'),
    })
    const verificationCode = emailedCode()
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      // Another account claims the address while Cognito is being updated.
      if (
        command.name === 'AdminUpdateUserAttributes' &&
        (command.input.UserAttributes as { Value: string }[])[0]?.Value === NEW
      ) {
        await seedUser(prisma, { email: NEW })
      }
      return {}
    })

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(409)
    const updates = cognitoCalls().filter(
      (c) => c.name === 'AdminUpdateUserAttributes'
    )
    expect(
      updates.map(
        (u) => (u.input.UserAttributes as { Value: string }[])[0]?.Value
      )
    ).toEqual([NEW, OLD])
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe(OLD)
  })

  it('reports a failed revert loudly', async () => {
    const { user } = await passwordAccount()
    await call(user.id, '/me/email/start', {
      newEmail: NEW,
      currentPassword: leakSentinel('current'),
    })
    const verificationCode = emailedCode()
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      const value = (
        command.input.UserAttributes as { Value: string }[] | undefined
      )?.[0]?.Value
      if (command.name === 'AdminUpdateUserAttributes' && value === NEW) {
        await seedUser(prisma, { email: NEW })
        return {}
      }
      if (command.name === 'AdminUpdateUserAttributes')
        throw new Error('Cognito down')
      return {}
    })

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(409)
    expect(leakCapture.sentryCalls()).toHaveLength(1)
  })
})

describe('changing the email of a Google-only account', () => {
  it('re-confirms with Google and changes only the account email', async () => {
    const user = await googleOnlyAccount()

    const start = await call(user.id, '/me/email/start', {
      newEmail: NEW,
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })
    expect(start.status).toBe(202)
    const verificationCode = emailedCode()

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(200)
    expect(mockCognitoSend).not.toHaveBeenCalled()
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe(NEW)
    const google = await prisma.authIdentity.findUniqueOrThrow({
      where: { cognitoSub: 'sub-google' },
    })
    expect(google.email).toBe('player@gmail.test')
    leakCapture.expectNoLeak(verificationCode)
  })

  it.each([
    ['no proof', undefined],
    [
      'a stale proof',
      () => fakeGoogleProof({ sub: 'sub-google', ageSeconds: 3600 }),
    ],
    [
      "someone else's Google account",
      () => fakeGoogleProof({ sub: 'sub-other' }),
    ],
  ])('403s with %s', async (_label, proof) => {
    const user = await googleOnlyAccount()
    const res = await call(user.id, '/me/email/start', {
      newEmail: NEW,
      ...(proof ? { googleProof: proof() } : {}),
    })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ code: 'REAUTH_REQUIRED' })
    expect(mockSesSend).not.toHaveBeenCalled()
  })
})

describe('the new address', () => {
  it("400s for the account's own email", async () => {
    const user = await googleOnlyAccount()
    const res = await call(user.id, '/me/email/start', {
      newEmail: 'PLAYER@example.com',
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: 'SAME_EMAIL' })
  })

  it('answers a taken address like a free one, with a notice instead of a code', async () => {
    const user = await googleOnlyAccount()
    await seedUser(prisma, { email: 'taken@example.com' })

    const res = await call(user.id, '/me/email/start', {
      newEmail: 'taken@example.com',
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })

    expect(res.status).toBe(202)
    expect(lastEmail().subject).toBe('You already have an InfernoLog account')
  })

  it('refuses a wrong code, and a code for another account', async () => {
    const user = await googleOnlyAccount()
    await call(user.id, '/me/email/start', {
      newEmail: NEW,
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })
    const right = emailedCode()
    const stranger = await seedUser(prisma)

    const wrong = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode: right === '000000' ? '000001' : '000000',
    })
    expect(wrong.status).toBe(400)
    await expect(wrong.json()).resolves.toMatchObject({ code: 'INVALID_CODE' })

    const theirs = await call(stranger.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode: right,
    })
    expect(theirs.status).toBe(400)
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email
    ).toBe(OLD)
    leakCapture.expectNoLeak(right)
  })

  it('409s when the address became taken after the code was sent', async () => {
    const user = await googleOnlyAccount()
    await call(user.id, '/me/email/start', {
      newEmail: NEW,
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })
    const verificationCode = emailedCode()
    await seedUser(prisma, { email: NEW })

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'ACCOUNT_EXISTS' })
  })

  it('still changes the email when the old-address notice fails, and reports it', async () => {
    const user = await googleOnlyAccount()
    await call(user.id, '/me/email/start', {
      newEmail: NEW,
      googleProof: fakeGoogleProof({ sub: 'sub-google' }),
    })
    const verificationCode = emailedCode()
    mockSesSend.mockRejectedValue(new Error('MessageRejected'))

    const res = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })

    expect(res.status).toBe(200)
    expect(leakCapture.sentryCalls()).toHaveLength(1)
    leakCapture.expectNoLeak(verificationCode)
  })

  it('a forced 500 and an invalid body echo neither credential', async () => {
    const { user } = await passwordAccount()
    const currentPassword = leakSentinel('current')
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito unavailable'))

    const failed = await call(user.id, '/me/email/start', {
      newEmail: NEW,
      currentPassword,
    })
    expect(failed.status).toBe(500)
    expect(leakCapture.sentryCalls()).toHaveLength(1)

    const verificationCode = leakSentinel('code')
    const invalid = await call(user.id, '/me/email/verify', {
      newEmail: NEW,
      verificationCode,
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).not.toContain(verificationCode)
    leakCapture.expectNoLeak(currentPassword, verificationCode)
  })
})
