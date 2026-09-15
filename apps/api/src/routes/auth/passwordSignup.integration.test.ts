/**
 * Integration and leak tests for email-and-password signup.
 *
 * Postgres is real: rate limits, single-use codes and the "address already has
 * an account" check are all database behaviour. Cognito and SES are mocked at
 * the SDK boundary.
 *
 * ⚠️ CREDENTIALS — every test here also asserts that the password and the
 * verification code never reach a log line or a Sentry call, on the success
 * path, every expected failure, and a forced 500. See CLAUDE.md "Credential
 * handling".
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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
  class UsernameExistsException extends Error {}
  class InvalidPasswordException extends Error {}
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
    UsernameExistsException,
    InvalidPasswordException,
  }
})

const { leakCapture, leakSentinel } = await import('../../test/captureLeaks')
const sdk = await import('@aws-sdk/client-cognito-identity-provider')
const UsernameExists = sdk.UsernameExistsException as unknown as new () => Error
const InvalidPassword =
  sdk.InvalidPasswordException as unknown as new () => Error
const { MAX_ATTEMPTS, MAX_SENDS_PER_ADDRESS_PER_HOUR } =
  await import('../../services/verification')
const { default: app } = await import('./passwordSignup')

const prisma = getTestPrisma()
const EMAIL = 'player@example.com'

type Sent = { name: string; input: Record<string, unknown> }

// ─── helpers ─────────────────────────────────────────────────────────────────

function post(path: string, body: unknown, ip = '203.0.113.10') {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    { requestContext: { http: { sourceIp: ip } } }
  )
}

function startSignup(email = EMAIL, ip?: string) {
  return post('/auth/password-signup/start', { email }, ip)
}

function verify(body: Record<string, unknown>) {
  return post('/auth/password-signup/verify', {
    email: EMAIL,
    ...body,
  })
}

/** The most recent email SES was asked to send. */
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

/** The six-digit code from the most recent email. */
function emailedCode(): string {
  const match = /\b(\d{6})\b/.exec(lastEmail().text)
  if (!match?.[1]) throw new Error('No code in the last email')
  return match[1]
}

/** A code guaranteed to be wrong. */
function wrongCode(right: string): string {
  return right === '000000' ? '000001' : '000000'
}

function cognitoCalls(): Sent[] {
  return mockCognitoSend.mock.calls.map((call) => call[0] as Sent)
}

beforeEach(async () => {
  await truncateAll(prisma)
  leakCapture.reset()
  mockSesSend.mockReset().mockResolvedValue({})
  mockCognitoSend
    .mockReset()
    .mockImplementation(async (command: Sent) =>
      command.name === 'AdminCreateUser'
        ? { User: { Attributes: [{ Name: 'sub', Value: 'sub-new' }] } }
        : {}
    )
  vi.stubEnv('VERIFICATION_CODE_SECRET', 'test-hmac-key-not-a-real-secret')
  vi.stubEnv('COGNITO_USER_POOL_ID', 'pool-1')
  vi.stubEnv('EMAIL_FROM', 'InfernoLog <no-reply@infernolog.com>')
  vi.stubEnv(
    'SES_IDENTITY_ARN',
    'arn:aws:ses:us-east-1:0:identity/infernolog.com'
  )
  vi.stubEnv('FRONTEND_URL', 'https://infernolog.test')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await prisma.$disconnect()
})

// ─── start ───────────────────────────────────────────────────────────────────

describe('POST /auth/password-signup/start', () => {
  it('emails a code to a free address', async () => {
    const res = await startSignup()

    expect(res.status).toBe(202)
    expect(lastEmail()).toMatchObject({
      to: EMAIL,
      subject: 'Your InfernoLog verification code',
    })
    expect(await prisma.emailVerification.count()).toBe(1)
    leakCapture.expectNoLeak(emailedCode())
  })

  it('answers an address with an account exactly as it answers a free one', async () => {
    const free = await startSignup('free@example.com')
    const freeBody = await free.text()

    await seedUser(prisma, { email: EMAIL })
    const taken = await startSignup(EMAIL, '203.0.113.11')

    expect(taken.status).toBe(free.status)
    expect(await taken.text()).toBe(freeBody)
    // …while the email itself tells the address's owner, and carries no code.
    expect(lastEmail()).toMatchObject({
      to: EMAIL,
      subject: 'You already have an InfernoLog account',
    })
    expect(lastEmail().text).toContain(
      'https://infernolog.test/forgot-password'
    )
    expect(lastEmail().text).not.toMatch(/\b\d{6}\b/)
    // The ledger row is written either way.
    expect(await prisma.emailVerification.count()).toBe(2)
  })

  it('normalizes the address', async () => {
    await startSignup('  Player@Example.COM ')
    expect(lastEmail().to).toBe(EMAIL)
  })

  it('400s on a body that is not an email', async () => {
    const res = await post('/auth/password-signup/start', { email: 'nope' })
    expect(res.status).toBe(400)
    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('429s once the address has had its codes this hour, sending nothing more', async () => {
    for (let i = 0; i < MAX_SENDS_PER_ADDRESS_PER_HOUR; i++) {
      await startSignup(EMAIL, `198.51.100.${i}`)
    }
    mockSesSend.mockClear()

    const res = await startSignup(EMAIL, '198.51.100.99')

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ code: 'RATE_LIMITED' })
    expect(mockSesSend).not.toHaveBeenCalled()
  })

  it('a failed send 500s without the code reaching logs or Sentry', async () => {
    mockSesSend.mockImplementation(async () => {
      throw new Error('MessageRejected')
    })

    const res = await startSignup()

    expect(res.status).toBe(500)
    expect(leakCapture.sentryCalls()).toHaveLength(1)
    // The code was in the send that failed; nothing downstream captured it.
    leakCapture.expectNoLeak(emailedCode())
  })
})

// ─── verify ──────────────────────────────────────────────────────────────────

describe('POST /auth/password-signup/verify', () => {
  it('creates a verified Cognito user with the password, leaking neither credential', async () => {
    const password = leakSentinel('password')
    await startSignup()
    const verificationCode = emailedCode()

    const res = await verify({ verificationCode, password })

    expect(res.status).toBe(201)
    const calls = cognitoCalls()
    expect(calls.map((c) => c.name)).toEqual([
      'AdminCreateUser',
      'AdminSetUserPassword',
    ])
    expect(calls[0]?.input).toMatchObject({
      Username: EMAIL,
      MessageAction: 'SUPPRESS',
    })
    expect(calls[1]?.input).toMatchObject({
      Password: password,
      Permanent: true,
    })
    expect(await res.text()).not.toContain(password)
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('accepts the code only once', async () => {
    const password = leakSentinel('password')
    await startSignup()
    const verificationCode = emailedCode()

    await verify({ verificationCode, password })
    const again = await verify({ verificationCode, password })

    expect(again.status).toBe(400)
    await expect(again.json()).resolves.toMatchObject({ code: 'INVALID_CODE' })
  })

  it('rejects a wrong code without creating anything or leaking', async () => {
    const password = leakSentinel('password')
    await startSignup()
    const right = emailedCode()

    const res = await verify({ verificationCode: wrongCode(right), password })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: 'INVALID_CODE' })
    expect(mockCognitoSend).not.toHaveBeenCalled()
    leakCapture.expectNoLeak(password, right)
  })

  it('stops accepting even the right code after too many wrong guesses', async () => {
    const password = leakSentinel('password')
    await startSignup()
    const right = emailedCode()
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await verify({ verificationCode: wrongCode(right), password })
    }

    const res = await verify({ verificationCode: right, password })

    expect(res.status).toBe(400)
    expect(mockCognitoSend).not.toHaveBeenCalled()
    leakCapture.expectNoLeak(password, right)
  })

  it('409s when the address gained an account between start and verify', async () => {
    const password = leakSentinel('password')
    await startSignup()
    const verificationCode = emailedCode()
    await seedUser(prisma, { email: EMAIL })

    const res = await verify({ verificationCode, password })

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'ACCOUNT_EXISTS' })
    expect(mockCognitoSend).not.toHaveBeenCalled()
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('409s when an account already signs in with the native user', async () => {
    const password = leakSentinel('password')
    const owner = await seedUser(prisma, { email: 'other@example.com' })
    await seedAuthIdentity(prisma, owner.id, 'sub-owned', 'PASSWORD')
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminCreateUser') throw new UsernameExists()
      return { UserAttributes: [{ Name: 'sub', Value: 'sub-owned' }] }
    })
    await startSignup()
    const verificationCode = emailedCode()

    const res = await verify({ verificationCode, password })

    expect(res.status).toBe(409)
    expect(cognitoCalls().map((c) => c.name)).not.toContain(
      'AdminSetUserPassword'
    )
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('400s if Cognito rejects the password, without echoing it', async () => {
    const password = leakSentinel('password')
    mockCognitoSend.mockImplementation(async (command: Sent) => {
      if (command.name === 'AdminSetUserPassword') throw new InvalidPassword()
      return { User: { Attributes: [{ Name: 'sub', Value: 'sub-new' }] } }
    })
    await startSignup()
    const verificationCode = emailedCode()

    const res = await verify({ verificationCode, password })

    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain(password)
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('a forced 500 from Cognito reports the error without either credential', async () => {
    const password = leakSentinel('password')
    mockCognitoSend.mockRejectedValue(new Error('Cognito unavailable'))
    await startSignup()
    const verificationCode = emailedCode()

    const res = await verify({ verificationCode, password })

    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain(password)
    expect(leakCapture.sentryCalls()).toHaveLength(1)
    expect(leakCapture.output()).toContain('Cognito unavailable')
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('refuses an invalid body with a fixed message that echoes nothing', async () => {
    const password = leakSentinel('short') // no digit-only code, bad length
    const verificationCode = leakSentinel('code')

    const res = await verify({ verificationCode, password: 'x' + password })
    const text = await res.text()

    expect(res.status).toBe(400)
    expect(text).toContain('Check the email, code, and password')
    expect(text).not.toContain(password)
    expect(text).not.toContain(verificationCode)
    leakCapture.expectNoLeak(password, verificationCode)
  })

  it('refuses an unparseable body without echoing it', async () => {
    const password = leakSentinel('password')
    const res = await post(
      '/auth/password-signup/verify',
      `{"email":"${EMAIL}","password":"${password}"`
    )
    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain(password)
    leakCapture.expectNoLeak(password)
  })
})
