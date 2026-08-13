/**
 * Unit tests for the Cognito post-authentication trigger.
 *
 * The load-bearing property here is what this trigger does NOT do: it must
 * never create a user row. Sign-In with an unrecognized identity relies on this
 * being a no-op, so a regression that reintroduced lazy creation would silently
 * let anyone bypass the age-gated signup flow. It also must never fail a login
 * — every path returns the event, errors included. Prisma and Sentry are
 * mocked; no DB, no network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import * as Sentry from '@sentry/node'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
// The trigger calls dotenv.config() at module load; keep it from touching .env.
vi.mock('dotenv', () => ({ config: vi.fn() }))

const { handler } = await import('./postAuthentication')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const mockCaptureException = vi.mocked(Sentry.captureException)

type TriggerEvent = { request: { userAttributes: Record<string, string> } }

function event(userAttributes: Record<string, string>): TriggerEvent {
  return { request: { userAttributes } }
}

/** The real handler takes (event, context, callback); we only drive the event. */
const invoke = handler as unknown as (e: TriggerEvent) => Promise<TriggerEvent>

const SUB = 'cognito-sub-abc'
const EMAIL = 'player@example.com'

beforeEach(() => {
  vi.clearAllMocks()
  prisma.user.findUnique.mockReset()
  prisma.user.update.mockReset()
})

// ─── cognitoSub backfill ─────────────────────────────────────────────────────

describe('postAuthentication — cognitoSub backfill', () => {
  it('backfills cognitoSub onto a legacy user that has none', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      cognitoSub: null,
    } as never)

    await invoke(event({ email: EMAIL, sub: SUB }))

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: EMAIL },
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { cognitoSub: SUB },
    })
  })

  it('leaves an existing cognitoSub alone', async () => {
    // Re-stamping on every login would let a second Cognito identity that
    // happens to share the email take over the account.
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      cognitoSub: 'original-sub',
    } as never)

    await invoke(event({ email: EMAIL, sub: SUB }))

    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

// ─── the no-op guarantees ────────────────────────────────────────────────────

describe('postAuthentication — never creates a user', () => {
  it('does nothing when no user matches the email', async () => {
    // Sign-In with an unrecognized identity MUST be a no-op here — row creation
    // belongs to POST /v1/auth/signup/start, behind the age gate.
    prisma.user.findUnique.mockResolvedValue(null)

    await invoke(event({ email: EMAIL, sub: SUB }))

    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('never creates a user on any path', async () => {
    for (const stub of [
      null,
      { id: 'user-1', cognitoSub: null },
      { id: 'user-1', cognitoSub: 'original-sub' },
    ]) {
      prisma.user.findUnique.mockResolvedValue(stub as never)
      await invoke(event({ email: EMAIL, sub: SUB }))
    }

    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.user.createMany).not.toHaveBeenCalled()
    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })
})

// ─── missing attributes ──────────────────────────────────────────────────────

describe('postAuthentication — missing attributes', () => {
  it.each([
    ['email is absent', { sub: SUB }],
    ['sub is absent', { email: EMAIL }],
    ['both are absent', {}],
    ['email is empty', { email: '', sub: SUB }],
    ['sub is empty', { email: EMAIL, sub: '' }],
  ])('returns without querying when %s', async (_label, attributes) => {
    const input = event(attributes)
    await expect(invoke(input)).resolves.toBe(input)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })
})

// ─── failure handling ────────────────────────────────────────────────────────

describe('postAuthentication — failure handling', () => {
  it('swallows a lookup failure, reports it, and still returns the event', async () => {
    // Throwing here would fail the Cognito login outright.
    const error = new Error('db unreachable')
    prisma.user.findUnique.mockRejectedValue(error)

    const input = event({ email: EMAIL, sub: SUB })
    await expect(invoke(input)).resolves.toBe(input)
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })

  it('swallows an update failure the same way', async () => {
    const error = new Error('write conflict')
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      cognitoSub: null,
    } as never)
    prisma.user.update.mockRejectedValue(error)

    const input = event({ email: EMAIL, sub: SUB })
    await expect(invoke(input)).resolves.toBe(input)
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })

  it('returns the event unchanged on the success path', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      cognitoSub: null,
    } as never)

    const input = event({ email: EMAIL, sub: SUB })
    await expect(invoke(input)).resolves.toBe(input)
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})
