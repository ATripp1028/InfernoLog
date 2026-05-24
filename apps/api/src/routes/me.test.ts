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
})
