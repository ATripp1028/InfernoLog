/**
 * Unit tests for the collection routes' request-body gates.
 *
 * The integration suite covers what these routes write; what it never sends is
 * a body that doesn't parse or doesn't validate. Both must answer 400 without
 * touching the database — an unparseable body falling through to a write is the
 * class of bug that only shows up in production. Prisma is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import { buildApp } from '../../test/utils'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const collectionsApp = (await import('./index')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const app = buildApp(collectionsApp)

const COLLECTION_ID = '11111111-2222-3333-4444-555555555555'

function send(method: string, path: string, body: unknown) {
  return app.request(path, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** No write of any kind reached Prisma. */
function assertNoWrites() {
  expect(prisma.collection.create).not.toHaveBeenCalled()
  expect(prisma.collection.update).not.toHaveBeenCalled()
  expect(prisma.collectionEntry.create).not.toHaveBeenCalled()
  expect(prisma.$transaction).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  // A collection the caller owns, so a rejection can only come from the body.
  prisma.collection.findFirst.mockReset().mockResolvedValue({
    id: COLLECTION_ID,
    name: 'My List',
    type: 'CUSTOM',
    description: null,
    createdAt: new Date(),
    entries: [],
  } as never)
  prisma.collection.create.mockReset()
  prisma.collection.update.mockReset()
  prisma.collectionEntry.create.mockReset()
  prisma.$transaction.mockReset()
})

// ─── collections ─────────────────────────────────────────────────────────────

describe('collection routes — body validation', () => {
  it.each([
    ['POST', '/me/collections'],
    ['PATCH', `/me/collections/${COLLECTION_ID}`],
  ])('%s %s 400s on an unparseable body', async (method, path) => {
    const res = await send(method, path, '{oops')

    expect(res.status).toBe(400)
    assertNoWrites()
  })

  it.each([
    ['POST', '/me/collections'],
    ['PATCH', `/me/collections/${COLLECTION_ID}`],
  ])('%s %s 400s on a body that fails validation', async (method, path) => {
    const res = await send(method, path, { name: '' })

    expect(res.status).toBe(400)
    assertNoWrites()
  })
})

// ─── entries ─────────────────────────────────────────────────────────────────

describe('collection entry routes — body validation', () => {
  it.each([
    ['POST', `/me/collections/${COLLECTION_ID}/entries`],
    ['PATCH', `/me/collections/${COLLECTION_ID}/entries/entry-1`],
  ])('%s 400s on an unparseable body', async (method, path) => {
    const res = await send(method, path, '{oops')

    expect(res.status).toBe(400)
    assertNoWrites()
  })

  it.each([
    ['POST', `/me/collections/${COLLECTION_ID}/entries`, { levelId: 'not-numeric' }],
    [
      'PATCH',
      `/me/collections/${COLLECTION_ID}/entries/entry-1`,
      { prevId: 42 },
    ],
  ])('%s 400s on a body that fails validation', async (method, path, body) => {
    const res = await send(method, path, body)

    expect(res.status).toBe(400)
    assertNoWrites()
  })
})
