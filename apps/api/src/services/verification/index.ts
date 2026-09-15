// ⚠️ CREDENTIALS — verification codes are credentials. Never log one, never put
// one in an error message, never store one: only the HMAC reaches the
// database. Codes cross this module as `Sensitive` values. See CLAUDE.md
// "Credential handling".
//
// Why the API issues codes instead of Cognito: Cognito can only send an
// attribute-verification code to a user who already exists and is signed in,
// which would force a password-holding, unverified Cognito user into existence
// before the address was proven. It also cannot send the other emails these
// flows need. See the EmailVerification model in schema.prisma.

import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import type { VerificationPurpose } from '@prisma/client'
import prisma from '../../utils/prisma'
import { Sensitive } from '../../utils/sensitive'

/** How long a code works after it is issued. */
export const CODE_TTL_MINUTES = 15

/** Wrong guesses a code survives. The next guess after this many fails regardless. */
export const MAX_ATTEMPTS = 5

/** Codes (or notices) one address may be sent per hour, across all purposes. */
export const MAX_SENDS_PER_ADDRESS_PER_HOUR = 3

/** Codes (or notices) one source IP may request per hour. */
export const MAX_SENDS_PER_IP_PER_HOUR = 10

/**
 * How long a row is kept. Rows are the rate-limit ledger, so this must be at
 * least the longest rate-limit window; it is also how long a hashed IP is
 * retained.
 */
export const RETENTION_HOURS = 24

const HOUR_MS = 60 * 60 * 1000

/** Which limit a refused request hit. */
export type RateLimitScope = 'address' | 'ip'

/**
 * Thrown by {@link issueCode} when the address or IP has had too many codes
 * this hour. Carries no address or IP, so it is safe to log.
 */
export class VerificationRateLimitedError extends Error {
  constructor(readonly scope: RateLimitScope) {
    super(`Verification rate limit reached (${scope})`)
    this.name = 'VerificationRateLimitedError'
  }
}

function hmacKey(): string {
  const key = process.env.VERIFICATION_CODE_SECRET
  if (!key) throw new Error('VERIFICATION_CODE_SECRET is not set')
  return key
}

function hmac(input: string): string {
  return createHmac('sha256', hmacKey()).update(input).digest('hex')
}

/**
 * The value stored for a requester's source IP: an HMAC, never the IP.
 *
 * Keyed with the same secret as codes but a distinct prefix, so an IP hash can
 * never collide with a code hash.
 *
 * @param sourceIp - `requestContext.http.sourceIp` from API Gateway.
 */
export function hashSourceIp(sourceIp: string): string {
  return hmac(`ip:${sourceIp}`)
}

function hashCode(
  purpose: VerificationPurpose,
  email: string,
  verificationCode: Sensitive
): string {
  // Binding purpose and address into the MAC means a code issued for one can
  // never be accepted for another, even if two rows' codes happen to match.
  return hmac(`code:${purpose}:${email}:${verificationCode.reveal()}`)
}

/** Who a code is for, and who asked for it. */
export interface IssueCodeInput {
  purpose: VerificationPurpose
  /** The address the code will be sent to. Lowercased here regardless. */
  email: string
  /** The acting account, for EMAIL_CHANGE and PASSWORD_SETUP. Omit for SIGNUP. */
  userId?: string
  /** From {@link hashSourceIp}. */
  requesterIpHash: string
}

/**
 * Issues a fresh six-digit code, replacing any earlier unused code for the same
 * purpose, address and account.
 *
 * Call this for every request, including one whose email will be a notice
 * rather than a code: the row is the rate-limit ledger, and writing it either
 * way keeps the two responses indistinguishable. Just don't send the code.
 *
 * Rate limits are checked against rows from the past hour. Two concurrent
 * requests can each pass the check before either writes, so a concurrent burst
 * may exceed a limit by up to its size less one; the per-route API Gateway
 * throttle bounds that. The extra rows cannot extend guessing: `consumeCode`
 * only ever considers the newest unconsumed code.
 *
 * @returns The plaintext code, wrapped, for the email and nothing else.
 * @throws {VerificationRateLimitedError} When the address or IP is over its hourly limit.
 */
export async function issueCode(
  input: IssueCodeInput,
  now: Date = new Date()
): Promise<{ verificationCode: Sensitive; expiresAt: Date }> {
  const email = input.email.toLowerCase()
  const since = new Date(now.getTime() - HOUR_MS)

  const [addressCount, ipCount] = await Promise.all([
    prisma.emailVerification.count({
      where: { email, createdAt: { gt: since } },
    }),
    prisma.emailVerification.count({
      where: {
        requesterIpHash: input.requesterIpHash,
        createdAt: { gt: since },
      },
    }),
  ])
  if (addressCount >= MAX_SENDS_PER_ADDRESS_PER_HOUR) {
    throw new VerificationRateLimitedError('address')
  }
  if (ipCount >= MAX_SENDS_PER_IP_PER_HOUR) {
    throw new VerificationRateLimitedError('ip')
  }

  const verificationCode = new Sensitive(
    randomInt(0, 1_000_000).toString().padStart(6, '0')
  )
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000)
  const userId = input.userId ?? null

  await prisma.$transaction([
    // Only the newest code works: an earlier one still sitting in an inbox
    // stops being guessable the moment it is replaced.
    prisma.emailVerification.updateMany({
      where: {
        purpose: input.purpose,
        email,
        userId,
        consumedAt: null,
      },
      data: { consumedAt: now },
    }),
    prisma.emailVerification.create({
      data: {
        purpose: input.purpose,
        email,
        userId,
        codeHash: hashCode(input.purpose, email, verificationCode),
        expiresAt,
        requesterIpHash: input.requesterIpHash,
        createdAt: now,
      },
    }),
  ])

  return { verificationCode, expiresAt }
}

/** A code presented back by the person who received it. */
export interface ConsumeCodeInput {
  purpose: VerificationPurpose
  email: string
  userId?: string
  verificationCode: Sensitive
}

/**
 * Checks a code and, if it is right, uses it up.
 *
 * Only the newest live code for the purpose, address and account is
 * considered. A wrong guess counts against it; after {@link MAX_ATTEMPTS} it
 * stops working and a new code has to be requested. A right code works once:
 * a concurrent second use of the same code loses the race and gets `false`.
 *
 * Every failure (no code, expired, used up, wrong) returns the same `false`,
 * so the caller cannot distinguish them and neither can whoever it answers.
 *
 * @returns Whether the code was valid and is now consumed.
 */
export async function consumeCode(
  input: ConsumeCodeInput,
  now: Date = new Date()
): Promise<boolean> {
  const email = input.email.toLowerCase()
  // Only the newest unconsumed row is ever a candidate. Expiry and the attempt
  // limit are checked on it afterwards rather than filtered in the query:
  // filtering would fall through to an older row that concurrent issueCode
  // calls left live, handing out a fresh attempt budget per such row.
  const row = await prisma.emailVerification.findFirst({
    where: {
      purpose: input.purpose,
      email,
      userId: input.userId ?? null,
      consumedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!row || row.expiresAt <= now || row.attempts >= MAX_ATTEMPTS) {
    return false
  }

  const expected = Buffer.from(row.codeHash, 'hex')
  const actual = Buffer.from(
    hashCode(input.purpose, email, input.verificationCode),
    'hex'
  )
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual)

  if (!matches) {
    await prisma.emailVerification.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { attempts: { increment: 1 } },
    })
    return false
  }

  // Conditional on still being unused and under the limit, so two concurrent
  // uses of the same right code cannot both succeed.
  const { count } = await prisma.emailVerification.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { consumedAt: now },
  })
  return count === 1
}

/**
 * Deletes rows older than {@link RETENTION_HOURS}. Run hourly by the
 * PurgeEmailVerifications cron.
 *
 * @returns How many rows were deleted.
 */
export async function purgeExpiredVerifications(
  now: Date = new Date()
): Promise<number> {
  const { count } = await prisma.emailVerification.deleteMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - RETENTION_HOURS * HOUR_MS) },
    },
  })
  return count
}
