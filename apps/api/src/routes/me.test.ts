import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import { Hono } from 'hono'
import type { PrismaClient } from '@prisma/client'
import type { HonoVariables } from '../types/hono'

// Mocks must be declared before the route module is imported so the route
// picks up the mocked modules. vi.mock is hoisted, but the factory cannot
// reference top-level variables — we use the async form of vi.hoisted so we
// can dynamically import vitest-mock-extended (this file is ESM, so require
// is not available).
const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep: hoistedMockDeep } = await import('vitest-mock-extended')
  return { prismaMock: hoistedMockDeep() }
})

vi.mock('../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./auth', () => ({
  mintConnectDiscordState: vi.fn(() => 'signed-state'),
}))

// Import after vi.mock so the route resolves the mocked modules.
const { default: meApp } = await import('./me')

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = 'user-123'

// Wrap the route app with a middleware that injects userId, mimicking the
// real auth middleware that runs in production. Route tests focus on
// handler behavior, not auth — auth is tested separately.
function buildApp() {
  const app = new Hono<{ Variables: HonoVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', USER_ID)
    c.set('userEmail', 'test@example.com')
    await next()
  })
  app.route('/', meApp)
  return app
}

beforeEach(() => {
  mockReset(prisma)
})

describe('GET /me', () => {
  it('returns the serialized user when found', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: USER_ID,
      username: 'alex',
      enjoymentWeight: 0.25, // plain number branch in serializeMe
      ratingCategories: [
        { id: 'cat-1', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
      ],
    } as never)

    const res = await buildApp().request('/me')
    const body = (await res.json()) as { data: { username: string } }

    expect(res.status).toBe(200)
    expect(body.data.username).toBe('alex')
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    )
  })

  it('returns 404 when the user does not exist', async () => {
    prisma.user.findFirst.mockResolvedValue(null)

    const res = await buildApp().request('/me')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  it('returns 500 on database errors', async () => {
    prisma.user.findFirst.mockRejectedValue(new Error('DB error'))

    const res = await buildApp().request('/me')
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

describe('PATCH /me/username', () => {
  it('rejects a change within the 30-day cooldown', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: fiveDaysAgo,
    } as never)

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })
    const body = (await res.json()) as { error: string; nextAllowedAt: string }

    expect(res.status).toBe(403)
    expect(body.error).toBe('cooldown')
    expect(new Date(body.nextAllowedAt).getTime()).toBeGreaterThan(Date.now())
    // The cooldown check should short-circuit before any write.
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('allows a username change after the cooldown', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: thirtyOneDaysAgo
    } as never)
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      username: 'new-name',
      enjoymentWeight: 0.5,
      ratingCategories: [],
    } as never)


    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({ username: 'new-name' }),
      })
    )
  })

  it('returns 404 when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  it('returns 400 when the new username is invalid', async () => {
    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toStrictEqual({
      fieldErrors: {
        username: [
          "Username must be at least 2 characters",
          "Username can only contain letters, numbers, underscores, and hyphens",
        ],
      },
      formErrors: [],
    })
  })

  it('returns 409 when the new username is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      enjoymentWeight: 0.5,
      ratingCategories: [],
    } as never)

    prisma.user.findFirst.mockResolvedValue({
      id: 'other-user',
      username: 'taken-name',
    } as never)

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'taken-name' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(409)
    expect(body.error).toBe('Username is already taken')
  })

  it('returns 500 on database errors', async () => {
    prisma.user.findUnique.mockResolvedValue({
      username: 'old-name',
      usernameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    } as never)
    prisma.user.update.mockRejectedValue(new Error('DB error'))

    const res = await buildApp().request('/me/username', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-name' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toBe('Internal server error')
  })
})

describe('GET /me/discord', () => {
  
})