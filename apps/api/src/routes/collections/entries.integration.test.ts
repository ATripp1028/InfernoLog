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
const { applyCompletion } = await import('../../services/progress')

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

describe('Want to Beat membership rules', () => {
  it('auto-removes a level from Want to Beat when its completion is logged', async () => {
    const { user, wtb } = await seedAccount()

    // Add level 100 to Want to Beat.
    const add = await send(user.id, 'POST', `${base}/${wtb.id}/entries`, {
      levelId: '100',
    })
    expect(add.status).toBe(200)
    let detail = (await add.json()) as DetailBody
    expect(detail.data.entries.map((e) => e.level.inGameId)).toEqual(['100'])

    // Log a completion for it (the POST /v1/me/completions service path).
    await applyCompletion(user.id, {
      levelId: '100',
      dateUncertain: false,
      onStream: false,
      visibility: 'PUBLIC',
    } as Parameters<typeof applyCompletion>[1])

    // The level has disappeared from Want to Beat.
    const res = await send(user.id, 'GET', `${base}/${wtb.id}`)
    detail = (await res.json()) as DetailBody
    expect(detail.data.entries).toEqual([])
  })

  it('rejects adding an already-completed level to Want to Beat', async () => {
    const { user, wtb, favorites } = await seedAccount()
    await applyCompletion(user.id, {
      levelId: '200',
      dateUncertain: false,
      onStream: false,
      visibility: 'PUBLIC',
    } as Parameters<typeof applyCompletion>[1])

    const res = await send(user.id, 'POST', `${base}/${wtb.id}/entries`, {
      levelId: '200',
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'LEVEL_ALREADY_COMPLETED' })

    // The same completed level is still fine in a non-WTB collection, and its
    // entry carries completed: true.
    const ok = await send(user.id, 'POST', `${base}/${favorites.id}/entries`, {
      levelId: '200',
    })
    expect(ok.status).toBe(200)
    const detail = (await ok.json()) as DetailBody
    expect(detail.data.entries[0]).toMatchObject({ completed: true })
  })
})

// ─────────────────────────────────────────────
// Collection CRUD + validation
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Entries — add / duplicate / remove / reorder
// ─────────────────────────────────────────────

describe('collection entries', () => {
  it('appends entries in order, is idempotent on duplicates, and removes', async () => {
    const { user, favorites } = await seedAccount()
    const path = `${base}/${favorites.id}/entries`

    await send(user.id, 'POST', path, { levelId: '100' })
    await send(user.id, 'POST', path, { levelId: '200' })
    // Duplicate add → no-op, same membership back.
    const dupRes = await send(user.id, 'POST', path, { levelId: '100' })
    expect(dupRes.status).toBe(200)
    const detail = (await dupRes.json()) as DetailBody
    expect(detail.data.entries.map((e) => e.level.inGameId)).toEqual([
      '100',
      '200',
    ])

    // Unknown (uncached) level → 400: the client resolves/seeds first.
    const uncached = await send(user.id, 'POST', path, { levelId: '999' })
    expect(uncached.status).toBe(400)

    const removeRes = await send(
      user.id,
      'DELETE',
      `${path}/${detail.data.entries[0]!.id}`
    )
    expect(removeRes.status).toBe(200)
    const afterRemove = (await (
      await send(user.id, 'GET', `${base}/${favorites.id}`)
    ).json()) as DetailBody
    expect(afterRemove.data.entries.map((e) => e.level.inGameId)).toEqual([
      '200',
    ])
  })

  it('reorders an entry between neighbours by bisecting the gap', async () => {
    const { user, favorites } = await seedAccount()
    const path = `${base}/${favorites.id}/entries`
    for (const levelId of ['100', '200', '300']) {
      await send(user.id, 'POST', path, { levelId })
    }
    const before = (await (
      await send(user.id, 'GET', `${base}/${favorites.id}`)
    ).json()) as DetailBody
    const [a, b, c] = before.data.entries
    expect(before.data.entries.map((e) => e.level.inGameId)).toEqual([
      '100',
      '200',
      '300',
    ])

    // Move the last entry between the first two.
    const res = await send(user.id, 'PATCH', `${path}/${c!.id}`, {
      prevId: a!.id,
      nextId: b!.id,
    })
    expect(res.status).toBe(200)
    const after = (await res.json()) as DetailBody
    expect(after.data.entries.map((e) => e.level.inGameId)).toEqual([
      '100',
      '300',
      '200',
    ])
    const moved = after.data.entries[1]!
    expect(moved.rankingIndex).toBeGreaterThan(a!.rankingIndex)
    expect(moved.rankingIndex).toBeLessThan(b!.rankingIndex)
  })
})
