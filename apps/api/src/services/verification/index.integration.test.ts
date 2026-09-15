/**
 * Integration tests for emailed verification codes.
 *
 * The behavior that matters lives in the database: rate limits are counts of
 * recent rows, "only the newest code works" is an updateMany, and single use
 * under concurrency is a conditional update. A mocked Prisma could not show
 * any of those actually hold.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, seedUser, truncateAll } from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})

const {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_ADDRESS_PER_HOUR,
  MAX_SENDS_PER_IP_PER_HOUR,
  RETENTION_HOURS,
  VerificationRateLimitedError,
  consumeCode,
  hashSourceIp,
  issueCode,
  purgeExpiredVerifications,
} = await import('./index')
const { Sensitive } = await import('../../utils/sensitive')

const prisma = getTestPrisma()

const EMAIL = 'player@example.com'
const NOW = new Date('2026-09-14T12:00:00Z')
const minutes = (n: number) => new Date(NOW.getTime() + n * 60 * 1000)

let ipCounter = 0
/** A distinct IP hash per call, so address limits are tested in isolation. */
function freshIp() {
  ipCounter += 1
  return hashSourceIp(`203.0.113.${ipCounter}`)
}

function issue(
  overrides: Partial<Parameters<typeof issueCode>[0]> = {},
  at = NOW
) {
  return issueCode(
    {
      purpose: 'SIGNUP',
      email: EMAIL,
      ...overrides,
      requesterIpHash: overrides.requesterIpHash ?? freshIp(),
    },
    at
  )
}

function consume(
  verificationCode: InstanceType<typeof Sensitive>,
  overrides: Partial<Parameters<typeof consumeCode>[0]> = {},
  at = NOW
) {
  return consumeCode(
    { purpose: 'SIGNUP', email: EMAIL, verificationCode, ...overrides },
    at
  )
}

/** A code guaranteed different from `code`. */
function wrong(verificationCode: InstanceType<typeof Sensitive>) {
  const digits = verificationCode.reveal()
  const other = digits === '000000' ? '000001' : '000000'
  return new Sensitive(other)
}

beforeEach(async () => {
  await truncateAll(prisma)
  vi.stubEnv('VERIFICATION_CODE_SECRET', 'test-hmac-key-not-a-real-secret')
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await prisma.$disconnect()
})

describe('issueCode', () => {
  it('issues a six-digit code that expires after the TTL', async () => {
    const { verificationCode, expiresAt } = await issue()
    expect(verificationCode.reveal()).toMatch(/^\d{6}$/)
    expect(expiresAt).toEqual(minutes(CODE_TTL_MINUTES))
  })

  it('stores only an HMAC — never the plaintext code or raw IP', async () => {
    const { verificationCode } = await issue({
      requesterIpHash: hashSourceIp('198.51.100.7'),
    })
    const rows = await prisma.emailVerification.findMany()
    expect(rows).toHaveLength(1)
    const stored = JSON.stringify(rows)
    expect(stored).not.toContain(verificationCode.reveal())
    expect(stored).not.toContain('198.51.100.7')
    expect(rows[0]?.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('lowercases the address', async () => {
    const { verificationCode } = await issue({ email: 'Player@Example.COM' })
    expect((await prisma.emailVerification.findFirstOrThrow()).email).toBe(
      EMAIL
    )
    expect(
      await consume(verificationCode, { email: 'PLAYER@example.com' })
    ).toBe(true)
  })

  it('refuses the address once it has had its hourly sends, across purposes', async () => {
    const seeded = await seedUser(prisma)
    for (let i = 0; i < MAX_SENDS_PER_ADDRESS_PER_HOUR; i++) {
      await issue(i === 0 ? { purpose: 'EMAIL_CHANGE', userId: seeded.id } : {})
    }
    await expect(issue()).rejects.toMatchObject({ scope: 'address' })
    await expect(issue()).rejects.toBeInstanceOf(VerificationRateLimitedError)
  })

  it('counts only the past hour toward the address limit', async () => {
    for (let i = 0; i < MAX_SENDS_PER_ADDRESS_PER_HOUR; i++) {
      await issue({}, minutes(-61))
    }
    await expect(issue()).resolves.toBeDefined()
  })

  it('refuses an IP once it has requested its hourly sends', async () => {
    const ip = hashSourceIp('192.0.2.1')
    for (let i = 0; i < MAX_SENDS_PER_IP_PER_HOUR; i++) {
      await issue({ email: `player${i}@example.com`, requesterIpHash: ip })
    }
    await expect(
      issue({ email: 'someone-else@example.com', requesterIpHash: ip })
    ).rejects.toMatchObject({ scope: 'ip' })
  })

  it('makes an earlier unused code stop working', async () => {
    const first = await issue()
    const second = await issue({}, minutes(1))
    expect(await consume(first.verificationCode, {}, minutes(2))).toBe(
      first.verificationCode.equals(second.verificationCode)
    )
    expect(await consume(second.verificationCode, {}, minutes(2))).toBe(true)
  })

  it('requires the HMAC key', async () => {
    const requesterIpHash = freshIp()
    vi.stubEnv('VERIFICATION_CODE_SECRET', '')
    await expect(issue({ requesterIpHash })).rejects.toThrow(
      'VERIFICATION_CODE_SECRET is not set'
    )
    expect(() => hashSourceIp('192.0.2.1')).toThrow(
      'VERIFICATION_CODE_SECRET is not set'
    )
  })

  it('does not embed the address or IP in its rate-limit error', async () => {
    const ip = hashSourceIp('192.0.2.9')
    for (let i = 0; i < MAX_SENDS_PER_ADDRESS_PER_HOUR; i++) {
      await issue({ requesterIpHash: ip })
    }
    const error = await issue({ requesterIpHash: ip }).catch((e: unknown) => e)
    expect(String(error)).not.toContain(EMAIL)
    expect(String(error)).not.toContain(ip)
  })
})

describe('consumeCode', () => {
  it('accepts the right code exactly once', async () => {
    const { verificationCode } = await issue()
    expect(await consume(verificationCode)).toBe(true)
    expect(await consume(verificationCode)).toBe(false)
  })

  it('lets only one of two concurrent uses succeed', async () => {
    const { verificationCode } = await issue()
    const results = await Promise.all([
      consume(verificationCode),
      consume(verificationCode),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('rejects a code after it expires', async () => {
    const { verificationCode } = await issue()
    expect(await consume(verificationCode, {}, minutes(CODE_TTL_MINUTES))).toBe(
      false
    )
  })

  it('stops accepting even the right code after too many wrong guesses', async () => {
    const { verificationCode } = await issue()
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(await consume(wrong(verificationCode))).toBe(false)
    }
    expect(await consume(verificationCode)).toBe(false)
    const row = await prisma.emailVerification.findFirstOrThrow()
    expect(row.attempts).toBe(MAX_ATTEMPTS)
  })

  it('still accepts the right code after fewer wrong guesses than the limit', async () => {
    const { verificationCode } = await issue()
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      await consume(wrong(verificationCode))
    }
    expect(await consume(verificationCode)).toBe(true)
  })

  it('does not accept a code for a different purpose, address, or account', async () => {
    const seeded = await seedUser(prisma)
    const other = await seedUser(prisma)
    const { verificationCode } = await issue({
      purpose: 'EMAIL_CHANGE',
      userId: seeded.id,
    })

    expect(await consume(verificationCode)).toBe(false) // SIGNUP, no account
    expect(
      await consume(verificationCode, {
        purpose: 'PASSWORD_SETUP',
        userId: seeded.id,
      })
    ).toBe(false)
    expect(
      await consume(verificationCode, {
        purpose: 'EMAIL_CHANGE',
        userId: other.id,
      })
    ).toBe(false)
    expect(
      await consume(verificationCode, {
        purpose: 'EMAIL_CHANGE',
        userId: seeded.id,
        email: 'someone-else@example.com',
      })
    ).toBe(false)
    expect(
      await consume(verificationCode, {
        purpose: 'EMAIL_CHANGE',
        userId: seeded.id,
      })
    ).toBe(true)
  })

  it('returns false when no code was ever issued', async () => {
    expect(await consume(new Sensitive('123456'))).toBe(false)
  })
})

describe('purgeExpiredVerifications', () => {
  it('deletes rows older than the retention window and keeps the rest', async () => {
    await issue(
      {},
      new Date(NOW.getTime() - (RETENTION_HOURS * 60 + 1) * 60 * 1000)
    )
    await issue({ email: 'recent@example.com' }, minutes(-30))

    expect(await purgeExpiredVerifications(NOW)).toBe(1)
    const remaining = await prisma.emailVerification.findMany()
    expect(remaining.map((r) => r.email)).toEqual(['recent@example.com'])
  })

  it('removes a deleted account’s rows with it', async () => {
    const seeded = await seedUser(prisma)
    await issue({ purpose: 'EMAIL_CHANGE', userId: seeded.id })
    await prisma.user.delete({ where: { id: seeded.id } })
    expect(await prisma.emailVerification.count()).toBe(0)
  })
})
