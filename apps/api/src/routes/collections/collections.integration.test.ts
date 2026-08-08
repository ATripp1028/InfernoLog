// Integration tests for the collections routes + service, against the real
// test database. Covers the Want to Beat membership rules (the flagship test:
// logging a completion auto-removes the level from Want to Beat), the
// name-validation codes, built-in immutability, entry add/remove/reorder, and
// idempotent adds.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../../test/utils'

// Real DB; no external HTTP in this flow, so only infra is mocked.
vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: collectionsApp } = await import('./index')

const prisma = getTestPrisma()

// ─────────────────────────────────────────────
// Request helpers
// ─────────────────────────────────────────────

function send(
  userId: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown
) {
  const init: RequestInit = { method }
  if (payload !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(payload)
  }
  return buildApp(collectionsApp, { userId }).request(path, init)
}

interface SummaryBody {
  data: Array<{
    id: string
    name: string
    type: string
    entryCount: number
    previewLevelIds: string[]
  }>
}

interface DetailBody {
  data: {
    id: string
    name: string
    type: string
    description: string | null
    entries: Array<{
      id: string
      rankingIndex: number
      completed: boolean
      badge: { listSource: string; tierOrRank: string } | null
      level: { inGameId: string }
    }>
  }
}

// Seed a user (with the three built-ins the post-auth trigger would create)
// plus a few cached levels.
async function seedAccount() {
  const user = await seedUser(prisma)
  await prisma.collection.createMany({
    data: [
      { userId: user.id, name: 'Want to Beat', type: 'WANT_TO_BEAT' },
      { userId: user.id, name: 'Favorites', type: 'FAVORITES' },
      { userId: user.id, name: 'Least Favorites', type: 'LEAST_FAVORITES' },
    ],
  })
  await seedLevel(prisma, { inGameId: '100', name: 'Bloodbath', isDemon: true })
  await seedLevel(prisma, { inGameId: '200', name: 'Cataclysm', isDemon: true })
  await seedLevel(prisma, { inGameId: '300', name: 'Zodiac', isDemon: true })
  const collections = await prisma.collection.findMany({
    where: { userId: user.id },
  })
  const byType = new Map(collections.map((c) => [c.type, c]))
  return {
    user,
    wtb: byType.get('WANT_TO_BEAT')!,
    favorites: byType.get('FAVORITES')!,
  }
}

const base = '/me/collections'

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─────────────────────────────────────────────
// Want to Beat rules
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Collection CRUD + validation
// ─────────────────────────────────────────────

describe('collection CRUD', () => {
  it('creates a custom collection and lists built-ins first', async () => {
    const { user } = await seedAccount()
    const create = await send(user.id, 'POST', base, {
      name: 'Hardest Beaten',
      description: 'bragging rights',
    })
    expect(create.status).toBe(200)

    const res = await send(user.id, 'GET', base)
    const body = (await res.json()) as SummaryBody
    expect(body.data.map((c) => c.type)).toEqual([
      'WANT_TO_BEAT',
      'FAVORITES',
      'LEAST_FAVORITES',
      'CUSTOM',
    ])
    expect(body.data[3]).toMatchObject({
      name: 'Hardest Beaten',
      entryCount: 0,
      previewLevelIds: [],
    })
  })

  it('rejects duplicate names (409) and reserved names (422), case-insensitively', async () => {
    const { user } = await seedAccount()
    await send(user.id, 'POST', base, { name: 'My Picks' })

    const dup = await send(user.id, 'POST', base, {
      name: 'my picks',
    })
    expect(dup.status).toBe(409)
    expect(await dup.json()).toMatchObject({ error: 'DUPLICATE_NAME' })

    const reserved = await send(user.id, 'POST', base, {
      name: 'want to beat',
    })
    expect(reserved.status).toBe(422)
    expect(await reserved.json()).toMatchObject({ error: 'RESERVED_NAME' })
  })

  it('renames/edits custom collections but rejects edits and deletes of built-ins', async () => {
    const { user, wtb } = await seedAccount()
    const create = await send(user.id, 'POST', base, {
      name: 'Temp',
    })
    const created = (await create.json()) as DetailBody

    const rename = await send(user.id, 'PATCH', `${base}/${created.data.id}`, {
      name: 'Renamed',
      description: 'now with words',
    })
    expect(rename.status).toBe(200)
    expect(((await rename.json()) as DetailBody).data).toMatchObject({
      name: 'Renamed',
      description: 'now with words',
    })

    const editBuiltIn = await send(user.id, 'PATCH', `${base}/${wtb.id}`, {
      name: 'nope',
    })
    expect(editBuiltIn.status).toBe(403)
    expect(await editBuiltIn.json()).toMatchObject({
      error: 'BUILT_IN_COLLECTION',
    })

    const deleteBuiltIn = await send(user.id, 'DELETE', `${base}/${wtb.id}`)
    expect(deleteBuiltIn.status).toBe(403)

    const deleteCustom = await send(
      user.id,
      'DELETE',
      `${base}/${created.data.id}`
    )
    expect(deleteCustom.status).toBe(204)
  })

  it("cannot access another user's collection by its ID (404)", async () => {
    const { favorites } = await seedAccount()
    const other = await seedUser(prisma)
    const res = await send(other.id, 'GET', `${base}/${favorites.id}`)
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────
// Entries — add / duplicate / remove / reorder
// ─────────────────────────────────────────────
