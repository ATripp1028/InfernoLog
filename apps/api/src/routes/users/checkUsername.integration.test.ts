/**
 * Integration tests for the username availability check.
 *
 * The whole endpoint is one case-insensitive uniqueness query, and the point of
 * running it against Postgres is that `mode: 'insensitive'` either works or it
 * doesn't — a mocked Prisma will happily accept the option and report whatever
 * the stub was told to. The other property worth pinning is that this gives the
 * SAME verdict PATCH /me/username would, so a name that passes here can't be
 * rejected on submit.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: usersApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

async function check(username?: string) {
  const query =
    username === undefined ? '' : `?username=${encodeURIComponent(username)}`
  const res = await buildApp(usersApp).request(`/users/check-username${query}`)
  return {
    status: res.status,
    body: (await res.json()) as { available: boolean; error?: string },
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── availability ────────────────────────────────────────────────────────────

describe('GET /users/check-username', () => {
  it('reports an unused name as available', async () => {
    const { status, body } = await check('freshName')

    expect(status).toBe(200)
    expect(body).toEqual({ available: true })
  })

  it('reports a taken name as unavailable', async () => {
    await seedUser(prisma, { username: 'TakenName' })

    expect((await check('TakenName')).body.available).toBe(false)
  })

  it.each([
    ['lowercased', 'takenname'],
    ['uppercased', 'TAKENNAME'],
    ['mixed case', 'tAkEnNaMe'],
  ])('reports a taken name as unavailable when %s', async (_label, variant) => {
    // The check is case-insensitive so the client can't be told a name is free
    // and then rejected by PATCH /me/username, which uses the same query.
    await seedUser(prisma, { username: 'TakenName' })

    expect((await check(variant)).body.available).toBe(false)
  })

  it('does not treat a different name as taken', async () => {
    await seedUser(prisma, { username: 'TakenName' })

    expect((await check('TakenNam')).body.available).toBe(true)
  })
})

// ─── validation verdicts ─────────────────────────────────────────────────────

describe('GET /users/check-username — invalid input', () => {
  it('answers 200 with a reason rather than erroring', async () => {
    // "No, because it's too short" is an answer to "can I have this name?",
    // not a client error — the frontend renders it inline.
    const { status, body } = await check('a')

    expect(status).toBe(200)
    expect(body.available).toBe(false)
    expect(body.error).toBeTruthy()
  })

  it('reports a missing username as unavailable with a reason', async () => {
    const { status, body } = await check()

    expect(status).toBe(200)
    expect(body.available).toBe(false)
    expect(body.error).toContain('at least 2 characters')
  })

  it('surfaces one human-readable message, not a JSON dump of every issue', async () => {
    // ZodError.message is a JSON dump; the route takes issues[0].message.
    const { body } = await check('!!')

    expect(body.error).toBeTruthy()
    expect(body.error).not.toContain('"code"')
  })

  it('rejects a reserved name even though nobody holds it', async () => {
    // Uniqueness alone would report this available and only fail at submit.
    const { body } = await check('admin')

    expect(body.available).toBe(false)
  })
})
