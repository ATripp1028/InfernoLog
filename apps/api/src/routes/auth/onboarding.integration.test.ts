/**
 * Integration tests for the claims-only auth routes.
 *
 * Signup is idempotent, and the thing that makes that non-trivial is the unique
 * constraint on `cognitoSub`: a second call must return the existing row rather
 * than collide. The generated username has a random suffix precisely so two
 * accounts sharing an email local part don't hit `User.username`'s unique
 * constraint either — both are database properties a mocked test can't check.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, truncateAll, seedUser } from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

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
      constructor(public input: { Username: string }) {}
    },
    UserNotFoundException,
  }
})

const { default: onboardingApp } = await import('./onboarding')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

const SUB = 'cognito-sub-abc'
const EMAIL = 'player@example.com'

function post(path: string, claims: Record<string, string> | null) {
  return onboardingApp.request(
    path,
    { method: 'POST' },
    claims
      ? { requestContext: { authorizer: { jwt: { claims } } } }
      : { requestContext: {} }
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
  vi.stubEnv('COGNITO_USER_POOL_ID', 'pool-1')
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── signup ──────────────────────────────────────────────────────────────────

describe('POST /auth/signup/start', () => {
  it('creates the user with its defaults', async () => {
    const res = await post('/auth/signup/start', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    const user = await prisma.user.findUniqueOrThrow({
      where: { cognitoSub: SUB },
    })
    expect(user.email).toBe(EMAIL)
    expect(user.onboardingCompleted).toBe(false)

    const cats = await prisma.ratingCategory.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: 'asc' },
    })
    expect(cats.map((c) => c.name)).toEqual(['Gameplay', 'Decoration', 'Song'])

    const collections = await prisma.collection.findMany({
      where: { userId: user.id },
      orderBy: { name: 'asc' },
    })
    expect(collections.map((c) => c.type).sort()).toEqual([
      'FAVORITES',
      'LEAST_FAVORITES',
      'WANT_TO_BEAT',
    ])
  })

  it('seeds category weights that sum to exactly 1.00', async () => {
    // Otherwise the rating-config route rejects the user's very first save.
    await post('/auth/signup/start', { sub: SUB, email: EMAIL })

    const user = await prisma.user.findUniqueOrThrow({
      where: { cognitoSub: SUB },
    })
    const cats = await prisma.ratingCategory.findMany({
      where: { userId: user.id },
    })
    const cents = cats.reduce((a, c) => a + Math.round(Number(c.weight) * 100), 0)
    expect(cents).toBe(100)
  })

  it('is idempotent — a second call returns the same row', async () => {
    // cognitoSub is unique, so a naive re-create would throw instead.
    const first = await post('/auth/signup/start', { sub: SUB, email: EMAIL })
    const firstBody = (await first.json()) as { data: { id: string } }

    const second = await post('/auth/signup/start', { sub: SUB, email: EMAIL })
    const secondBody = (await second.json()) as { data: { id: string } }

    expect(second.status).toBe(200)
    expect(secondBody.data.id).toBe(firstBody.data.id)
    expect(await prisma.user.count()).toBe(1)
    expect(await prisma.ratingCategory.count()).toBe(3)
  })

  it('reports the existing onboarding state on a repeat call', async () => {
    await post('/auth/signup/start', { sub: SUB, email: EMAIL })
    await prisma.user.update({
      where: { cognitoSub: SUB },
      data: { onboardingCompleted: true },
    })

    const res = await post('/auth/signup/start', { sub: SUB, email: EMAIL })

    await expect(res.json()).resolves.toMatchObject({
      data: { onboardingCompleted: true },
    })
  })

  it('gives two accounts sharing an email local part distinct usernames', async () => {
    // User.username is unique; the random suffix is what avoids the collision.
    await post('/auth/signup/start', { sub: 'sub-a', email: 'alex@a.test' })
    await post('/auth/signup/start', { sub: 'sub-b', email: 'alex@b.test' })

    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
    expect(users).toHaveLength(2)
    expect(users[0]!.username).not.toBe(users[1]!.username)
    expect(users.every((u) => u.username.startsWith('alex_'))).toBe(true)
  })

  it('401s and creates nothing without claims', async () => {
    const res = await post('/auth/signup/start', null)

    expect(res.status).toBe(401)
    expect(await prisma.user.count()).toBe(0)
  })
})

// ─── rejecting a sign-in ─────────────────────────────────────────────────────

describe('POST /auth/signin/reject', () => {
  it('discards the Cognito identity when no account matches', async () => {
    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    const [command] = mockCognitoSend.mock.lastCall as unknown as [
      { input: { Username: string } },
    ]
    expect(command.input.Username).toBe(SUB)
  })

  it('refuses when a real account holds that cognitoSub', async () => {
    // The frontend only calls this after GET /me 404s — a hit means the two
    // requests raced, and deleting would orphan a live account's identity.
    const user = await seedUser(prisma)
    await prisma.user.update({
      where: { id: user.id },
      data: { cognitoSub: SUB },
    })

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(400)
    expect(mockCognitoSend).not.toHaveBeenCalled()
    expect(
      await prisma.user.findUnique({ where: { cognitoSub: SUB } })
    ).not.toBeNull()
  })

  it('leaves an unrelated account alone', async () => {
    await seedUser(prisma)

    const res = await post('/auth/signin/reject', { sub: SUB, email: EMAIL })

    expect(res.status).toBe(200)
    expect(await prisma.user.count()).toBe(1)
  })
})
