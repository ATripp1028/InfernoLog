import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import type { HonoVariables } from '../../types/hono'

// Mocks must be declared before the route module is imported. See me.test.ts
// for why vi.hoisted is used in its async form here.
const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep: hoistedMockDeep } = await import('vitest-mock-extended')
  return { prismaMock: hoistedMockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))

const { default: usersApp } = await import('./index')

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

// Deliberately NOT wrapped in test/utils' buildApp: these routes are public and
// must work with no userId on the context.
const buildApp = () => {
  const app = new Hono<{ Variables: HonoVariables }>()
  app.route('/', usersApp)
  return app
}

const check = (username?: string) => {
  const qs =
    username === undefined ? '' : `?username=${encodeURIComponent(username)}`
  return buildApp().request(`/users/check-username${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReset(prisma)
})

describe('GET /users/check-username', () => {
  it('reports an unused username as available', async () => {
    prisma.user.findFirst.mockResolvedValue(null)

    const res = await check('alex')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: true })
  })

  it('reports a taken username as unavailable, case-insensitively', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' } as never)

    const res = await check('ALEX')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: false })
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: { equals: 'ALEX', mode: 'insensitive' } },
      })
    )
  })

  // The regression this route exists to fix: the previously-reachable handler
  // checked uniqueness only, so reserved and malformed names came back
  // available and only failed later at PATCH /me/username.
  it.each(['admin', 'Admin', 'MODERATOR', 'infernolog'])(
    'rejects the reserved username %s without hitting the database',
    async (username) => {
      const res = await check(username)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        available: false,
        error: 'This username is reserved',
      })
      expect(prisma.user.findFirst).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['a', 'Username must be at least 2 characters'],
    ['x'.repeat(33), 'Username must be at most 32 characters'],
    [
      'bad name!',
      'Username can only contain letters, numbers, underscores, and hyphens',
    ],
  ])('rejects %s with a readable message', async (username, expected) => {
    const res = await check(username)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: false, error: expected })
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })

  // Guards the .issues[0].message unwrap: ZodError.message is a JSON dump of
  // every issue, which would render as a blob in the field's inline error.
  it('never surfaces a raw ZodError JSON dump', async () => {
    const res = await check('bad name!')
    const body = (await res.json()) as { error: string }

    expect(body.error).not.toContain('{')
    expect(body.error).not.toContain('"code"')
  })

  it('treats a missing username as unavailable rather than a 400', async () => {
    const res = await check()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      available: false,
      error: 'Username must be at least 2 characters',
    })
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })

  it('returns 500 on database errors', async () => {
    prisma.user.findFirst.mockRejectedValue(new Error('DB error'))

    const res = await check('alex')

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
