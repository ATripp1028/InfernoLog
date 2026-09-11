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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
    ordering: string
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

// ─────────────────────────────────────────────
// Ordering — ORDERED ↔ UNORDERED
// ─────────────────────────────────────────────

/** Creates a custom collection holding `levelIds`, added in that order. */
async function seedCustom(
  userId: string,
  name: string,
  levelIds: string[],
  ordering: 'ORDERED' | 'UNORDERED' = 'ORDERED'
) {
  const res = await send(userId, 'POST', base, { name, ordering })
  const { id } = ((await res.json()) as DetailBody).data
  for (const levelId of levelIds) {
    await send(userId, 'POST', `${base}/${id}/entries`, { levelId })
  }
  return id
}

describe('collection ordering', () => {
  it('converts either way, renumbering the entries by level ID', async () => {
    const { user } = await seedAccount()
    await seedLevel(prisma, { inGameId: '1000', name: 'Sonic Wave' })
    // A curated order that is neither numeric nor lexical level-ID order.
    const id = await seedCustom(user.id, 'Mine', ['300', '1000', '100'])

    const res = await send(user.id, 'PUT', `${base}/${id}/ordering`, {
      ordering: 'UNORDERED',
    })
    expect(res.status).toBe(200)
    const detail = (await res.json()) as DetailBody
    expect(detail.data.ordering).toBe('UNORDERED')
    // Numeric, not lexical: 1000 comes after 300.
    expect(detail.data.entries.map((e) => e.level.inGameId)).toEqual([
      '100',
      '300',
      '1000',
    ])
    expect(detail.data.entries.map((e) => e.rankingIndex)).toEqual([1, 2, 3])

    const back = await send(user.id, 'PUT', `${base}/${id}/ordering`, {
      ordering: 'ORDERED',
    })
    expect(((await back.json()) as DetailBody).data.ordering).toBe('ORDERED')
  })

  it('lets Want to Beat convert, but never Favorites or Least Favorites', async () => {
    const { user, wtb, favorites } = await seedAccount()

    const ok = await send(user.id, 'PUT', `${base}/${wtb.id}/ordering`, {
      ordering: 'UNORDERED',
    })
    expect(ok.status).toBe(200)

    const refused = await send(
      user.id,
      'PUT',
      `${base}/${favorites.id}/ordering`,
      { ordering: 'UNORDERED' }
    )
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: 'ORDERING_FIXED' })
    const stored = await prisma.collection.findUniqueOrThrow({
      where: { id: favorites.id },
    })
    expect(stored.ordering).toBe('ORDERED')
  })

  it('rejects an ordering it does not know', async () => {
    const { user, wtb } = await seedAccount()

    const res = await send(user.id, 'PUT', `${base}/${wtb.id}/ordering`, {
      ordering: 'SIDEWAYS',
    })

    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────
// Copying one collection into another
// ─────────────────────────────────────────────

interface CopyBody {
  data: {
    added: number
    alreadyPresent: number
    skippedCompleted: number
    collection: DetailBody['data']
  }
}

describe('copying one collection into another', () => {
  it('adds only the levels the target lacks, in the source order', async () => {
    const { user, favorites } = await seedAccount()
    for (const levelId of ['300', '100', '200']) {
      await send(user.id, 'POST', `${base}/${favorites.id}/entries`, {
        levelId,
      })
    }
    const target = await seedCustom(user.id, 'Target', ['100'])

    const res = await send(user.id, 'POST', `${base}/${target}/entries/copy`, {
      sourceCollectionId: favorites.id,
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as CopyBody
    expect(body.data).toMatchObject({
      added: 2,
      alreadyPresent: 1,
      skippedCompleted: 0,
    })
    // 100 keeps its place; the rest append in Favorites' order.
    expect(body.data.collection.entries.map((e) => e.level.inGameId)).toEqual(
      ['100', '300', '200']
    )
    // The source is untouched.
    expect(
      await prisma.collectionEntry.count({
        where: { collectionId: favorites.id },
      })
    ).toBe(3)
  })

  it('appends an unordered source in level-ID order', async () => {
    const { user } = await seedAccount()
    const source = await seedCustom(
      user.id,
      'Backlog',
      ['300', '100'],
      'UNORDERED'
    )
    const target = await seedCustom(user.id, 'Target', [])

    const res = await send(user.id, 'POST', `${base}/${target}/entries/copy`, {
      sourceCollectionId: source,
    })

    const body = (await res.json()) as CopyBody
    expect(body.data.collection.entries.map((e) => e.level.inGameId)).toEqual(
      ['100', '300']
    )
  })

  it('skips beaten levels when the target is Want to Beat', async () => {
    const { user, wtb, favorites } = await seedAccount()
    for (const levelId of ['100', '200']) {
      await send(user.id, 'POST', `${base}/${favorites.id}/entries`, {
        levelId,
      })
    }
    await applyCompletion(user.id, {
      levelId: '200',
      dateUncertain: false,
      onStream: false,
      visibility: 'PUBLIC',
    } as Parameters<typeof applyCompletion>[1])

    const res = await send(user.id, 'POST', `${base}/${wtb.id}/entries/copy`, {
      sourceCollectionId: favorites.id,
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as CopyBody
    expect(body.data).toMatchObject({
      added: 1,
      alreadyPresent: 0,
      skippedCompleted: 1,
    })
    expect(body.data.collection.entries.map((e) => e.level.inGameId)).toEqual(
      ['100']
    )
  })

  it('rejects copying a collection into itself', async () => {
    const { user, favorites } = await seedAccount()

    const res = await send(
      user.id,
      'POST',
      `${base}/${favorites.id}/entries/copy`,
      { sourceCollectionId: favorites.id }
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: 'SAME_COLLECTION' })
  })

  it("will not read another user's collection as the source", async () => {
    const { user, favorites } = await seedAccount()
    await send(user.id, 'POST', `${base}/${favorites.id}/entries`, {
      levelId: '100',
    })
    const other = await seedUser(prisma)
    const theirs = await prisma.collection.create({
      data: { userId: other.id, name: 'Mine', type: 'CUSTOM' },
    })

    const res = await send(other.id, 'POST', `${base}/${theirs.id}/entries/copy`, {
      sourceCollectionId: favorites.id,
    })

    expect(res.status).toBe(404)
    expect(
      await prisma.collectionEntry.count({ where: { collectionId: theirs.id } })
    ).toBe(0)
  })
})

// ─────────────────────────────────────────────
// Browsing one collection
// ─────────────────────────────────────────────

interface BrowseBody {
  data: Array<{ inGameId: string; entryId: string }>
  nextCursor: string | null
}

describe('browsing a collection', () => {
  it("returns only that collection's levels, each with its entry id", async () => {
    const { user, favorites } = await seedAccount()
    const id = await seedCustom(user.id, 'Mine', ['300', '100'])
    // In another collection only — must not leak into this browse.
    await send(user.id, 'POST', `${base}/${favorites.id}/entries`, {
      levelId: '200',
    })

    const res = await send(user.id, 'GET', `${base}/${id}/levels?sort=levelId`)

    expect(res.status).toBe(200)
    const body = (await res.json()) as BrowseBody
    expect(body.data.map((r) => r.inGameId)).toEqual(['100', '300'])
    expect(body.nextCursor).toBeNull()
    const detail = (await (
      await send(user.id, 'GET', `${base}/${id}`)
    ).json()) as DetailBody
    const entryIdByLevel = new Map(
      detail.data.entries.map((e) => [e.level.inGameId, e.id])
    )
    for (const row of body.data) {
      expect(row.entryId).toBe(entryIdByLevel.get(row.inGameId))
    }
  })

  it('filters by name, and by level ID for a numeric query', async () => {
    const { user } = await seedAccount()
    const id = await seedCustom(user.id, 'Mine', ['100', '200', '300'])

    const byName = (await (
      await send(user.id, 'GET', `${base}/${id}/levels?sort=levelId&q=Zod`)
    ).json()) as BrowseBody
    const byId = (await (
      await send(user.id, 'GET', `${base}/${id}/levels?sort=levelId&q=200`)
    ).json()) as BrowseBody

    expect(byName.data.map((r) => r.inGameId)).toEqual(['300'])
    expect(byId.data.map((r) => r.inGameId)).toEqual(['200'])
  })

  it("404s for another user's collection", async () => {
    const { favorites } = await seedAccount()
    const other = await seedUser(prisma)

    const res = await send(other.id, 'GET', `${base}/${favorites.id}/levels`)

    expect(res.status).toBe(404)
  })

  it('400s on a malformed query', async () => {
    const { user, favorites } = await seedAccount()

    const res = await send(
      user.id,
      'GET',
      `${base}/${favorites.id}/levels?sort=sideways`
    )

    expect(res.status).toBe(400)
  })
})
