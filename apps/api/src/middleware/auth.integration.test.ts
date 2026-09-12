/**
 * Integration tests for the auth middleware's identity lookup.
 *
 * The unit tests assert the query shape against a mocked Prisma. What only a
 * real database proves is that the sub actually resolves through the
 * `auth_identities` join to the right account — including when one account
 * holds several identities — and that `User.cognitoSub`, which is still
 * written, no longer grants access on its own.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { HonoVariables } from '../types/hono'
import {
  getTestPrisma,
  truncateAll,
  seedUser,
  seedAuthIdentity,
} from '../test/utils'

vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { authMiddleware } = await import('./auth')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Sends a request with these verified claims through the real middleware. */
async function probe(claims: Record<string, string>) {
  const app = new Hono<{ Variables: HonoVariables }>()
  app.use('*', authMiddleware)
  app.get('/probe', (c) =>
    c.json({ userId: c.get('userId'), userEmail: c.get('userEmail') })
  )
  const res = await app.request(
    '/probe',
    {},
    { requestContext: { authorizer: { jwt: { claims } } } }
  )
  return {
    status: res.status,
    body: (await res.json()) as { userId?: string; userEmail?: string },
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── resolution ──────────────────────────────────────────────────────────────

describe('authMiddleware — resolving a sub against the database', () => {
  it("resolves an identity's sub to its account", async () => {
    const user = await seedUser(prisma)
    await seedAuthIdentity(prisma, user.id, 'sub-a')

    const { status, body } = await probe({ sub: 'sub-a' })

    expect(status).toBe(200)
    expect(body.userId).toBe(user.id)
  })

  it('resolves every identity on an account to that same account', async () => {
    const user = await seedUser(prisma)
    await seedAuthIdentity(prisma, user.id, 'google-sub', 'GOOGLE')
    await seedAuthIdentity(prisma, user.id, 'password-sub', 'PASSWORD')

    expect((await probe({ sub: 'google-sub' })).body.userId).toBe(user.id)
    expect((await probe({ sub: 'password-sub' })).body.userId).toBe(user.id)
  })

  it('resolves each sub to its own account when several exist', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedAuthIdentity(prisma, user.id, 'sub-a')
    await seedAuthIdentity(prisma, other.id, 'sub-b')

    expect((await probe({ sub: 'sub-b' })).body.userId).toBe(other.id)
  })

  it('404s a sub that only User.cognitoSub carries', async () => {
    // The column is still written until it is dropped, but it is no longer an
    // identity: an account reachable only through it cannot be signed in to.
    const user = await seedUser(prisma)
    await prisma.user.update({
      where: { id: user.id },
      data: { cognitoSub: 'column-only-sub' },
    })

    expect((await probe({ sub: 'column-only-sub' })).status).toBe(404)
  })

  it('404s a sub with no identity at all', async () => {
    await seedUser(prisma)

    expect((await probe({ sub: 'unknown-sub' })).status).toBe(404)
  })

  it("carries the account's email, not the token's", async () => {
    const user = await seedUser(prisma, { email: 'account@example.com' })
    await seedAuthIdentity(prisma, user.id, 'sub-a')

    const { body } = await probe({
      sub: 'sub-a',
      email: 'provider@example.com',
    })

    expect(body.userEmail).toBe('account@example.com')
  })
})
