// Pins the service-error → HTTP mapping now that it lives in one onError for
// the module rather than a try/catch per handler (see index.ts, which builds
// it with the shared createErrorHandler from middleware/errors.ts).
//
// The integration tests cover the CollectionError codes end-to-end; these cover
// the two branches they don't reach — the not-cached 400 and the unexpected-
// error 500 — and assert the handler is actually wired to routes in both files.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, TEST_USER_ID } from '../../test/utils'

const { mockGetCollections, mockAddEntry } = vi.hoisted(() => ({
  mockGetCollections: vi.fn(),
  mockAddEntry: vi.fn(),
}))

vi.mock('../../utils/prisma', () => ({ default: {} }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// importOriginal keeps the real error classes, so `instanceof` in errors.ts
// matches what these tests throw. Only the service functions are stubbed.
vi.mock('../../services/collections', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/collections')>()
  return {
    ...actual,
    getCollections: mockGetCollections,
    addEntry: mockAddEntry,
  }
})

const {
  CollectionError,
  CollectionLevelNotCachedError,
  CollectionNotFoundError,
} = await import('../../services/collections')
const { default: collectionsApp } = await import('./index')
const { logger } = await import('../../utils/logger')

const app = () => buildApp(collectionsApp, { userId: TEST_USER_ID })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('collections error mapping', () => {
  it('maps CollectionError to its own status, with the machine-readable code', async () => {
    mockGetCollections.mockRejectedValue(
      new CollectionError('DUPLICATE_NAME', 409, 'Name already in use')
    )

    const res = await app().request('/me/collections')

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'DUPLICATE_NAME',
      message: 'Name already in use',
    })
  })

  it('maps CollectionNotFoundError to 404', async () => {
    mockGetCollections.mockRejectedValue(
      new CollectionNotFoundError('Collection not found')
    )

    const res = await app().request('/me/collections')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Collection not found' })
  })

  it('maps CollectionLevelNotCachedError to 400', async () => {
    // Constructor takes the level id and builds the message itself.
    mockAddEntry.mockRejectedValue(new CollectionLevelNotCachedError('12345'))

    const res = await app().request('/me/collections/abc/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId: '12345' }),
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Level 12345 is not cached. Resolve it before adding.',
    })
  })

  it('maps an unexpected error to 500 without leaking its message', async () => {
    mockGetCollections.mockRejectedValue(new Error('connection terminated'))

    const res = await app().request('/me/collections')
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
    expect(body.error).not.toContain('connection terminated')
  })

  it('reports the matched route pattern, not the concrete URL', async () => {
    mockAddEntry.mockRejectedValue(new Error('boom'))

    await app().request('/me/collections/abc/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId: '12345' }),
    })

    expect(logger.error).toHaveBeenCalledWith(
      {
        path: 'POST /me/collections/:collectionId/entries',
        err: expect.any(Error),
      },
      'Collections route error'
    )
  })
})
