/**
 * Unit tests for the auth middleware.
 *
 * This is the single point where a Cognito identity becomes an InfernoLog
 * userId, and the project rule is that handlers take identity from
 * `c.get('userId')` and never from the Cognito sub — so what matters here is
 * that the INTERNAL uuid lands on the context, not the sub. The missing-claims
 * branch reports to Sentry because reaching it means the API Gateway authorizer
 * is misconfigured, not that a user did something wrong. Prisma is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import * as Sentry from '@sentry/node'
import type { HonoVariables } from '../types/hono'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

const { authMiddleware, getVerifiedClaims } = await import('./auth')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const mockCaptureMessage = vi.mocked(Sentry.captureMessage)

const SUB = 'cognito-sub-abc'
const USER_ID = '11111111-2222-3333-4444-555555555555'

/** An app behind the middleware that echoes whatever identity it received. */
function appUnderTest() {
  const app = new Hono<{ Variables: HonoVariables }>()
  app.use('*', authMiddleware)
  app.get('/probe', (c) =>
    c.json({ userId: c.get('userId'), userEmail: c.get('userEmail') })
  )
  return app
}

/** The API Gateway env shape the verified JWT claims arrive in. */
function envWith(claims: Record<string, string> | null) {
  return claims
    ? { requestContext: { authorizer: { jwt: { claims } } } }
    : { requestContext: {} }
}

function request(claims: Record<string, string> | null) {
  return appUnderTest().request('/probe', {}, envWith(claims))
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.user.findUnique.mockReset().mockResolvedValue({
    id: USER_ID,
    email: 'stored@example.com',
  } as never)
})

// ─── the happy path ──────────────────────────────────────────────────────────

describe('authMiddleware — resolving identity', () => {
  it('puts the INTERNAL user id on the context, not the Cognito sub', async () => {
    // Every authenticated route reads c.get('userId') and must never see a sub.
    const res = await request({ sub: SUB, email: 'jwt@example.com' })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { userId: string }
    expect(body.userId).toBe(USER_ID)
    expect(body.userId).not.toBe(SUB)
  })

  it('looks the user up by cognitoSub', async () => {
    await request({ sub: SUB })

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { cognitoSub: SUB },
      select: { id: true, email: true },
    })
  })

  it('prefers the email from the token over the stored one', async () => {
    // The token is fresher — the user may have changed it at the provider.
    const res = await request({ sub: SUB, email: 'jwt@example.com' })

    const body = (await res.json()) as { userEmail: string }
    expect(body.userEmail).toBe('jwt@example.com')
  })

  it('falls back to the stored email when the token carries none', async () => {
    const res = await request({ sub: SUB })

    const body = (await res.json()) as { userEmail: string }
    expect(body.userEmail).toBe('stored@example.com')
  })

  it('reports nothing to Sentry on a normal request', async () => {
    await request({ sub: SUB })

    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })
})

// ─── rejections ──────────────────────────────────────────────────────────────

describe('authMiddleware — rejections', () => {
  it('401s and reports when the request arrives with no verified claims', async () => {
    // The JWT authorizer should have rejected this first, so getting here is a
    // misconfiguration worth surfacing rather than a routine 401.
    const res = await request(null)

    expect(res.status).toBe(401)
    expect(mockCaptureMessage).toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('401s when the claims carry no sub', async () => {
    const res = await request({ email: 'jwt@example.com' })

    expect(res.status).toBe(401)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('404s when the Cognito identity has no InfernoLog user yet', async () => {
    // Signed in with Google but never completed signup — a distinct state the
    // frontend branches on to start the signup flow.
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await request({ sub: SUB })

    expect(res.status).toBe(404)
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('does not run the downstream handler when it rejects', async () => {
    const handler = vi.fn((c: { json: (b: unknown) => Response }) =>
      c.json({ ran: true })
    )
    const app = new Hono<{ Variables: HonoVariables }>()
    app.use('*', authMiddleware)
    app.get('/probe', handler)

    await app.request('/probe', {}, envWith(null))

    expect(handler).not.toHaveBeenCalled()
  })
})

// ─── getVerifiedClaims ───────────────────────────────────────────────────────

describe('getVerifiedClaims', () => {
  it('returns the claims when a sub is present', () => {
    const claims = { sub: SUB, email: 'jwt@example.com' }

    expect(getVerifiedClaims({ env: envWith(claims) })).toEqual(claims)
  })

  it.each([
    ['env is undefined', undefined],
    ['there is no requestContext', {}],
    ['there is no authorizer', { requestContext: {} }],
    ['there is no jwt', { requestContext: { authorizer: {} } }],
    ['there are no claims', { requestContext: { authorizer: { jwt: {} } } }],
    [
      'the claims carry no sub',
      { requestContext: { authorizer: { jwt: { claims: { email: 'a@b.c' } } } } },
    ],
  ])('returns null when %s', (_label, env) => {
    expect(getVerifiedClaims({ env })).toBeNull()
  })
})
