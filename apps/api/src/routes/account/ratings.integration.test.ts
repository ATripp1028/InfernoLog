/**
 * Integration tests for the weighted-rating configuration.
 *
 * PUT /me/rating-config writes sortOrder in two phases — parking existing rows
 * at negative indices before rewriting the final positions — specifically so a
 * reorder can't collide. A mocked test can only assert the two batches of calls
 * were issued in order; whether the resulting rows actually land in the right
 * order, and whether deleting a category takes its rating scores with it
 * without tripping a foreign key, is a question only Postgres answers.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: accountApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

function putConfig(userId: string, body: unknown) {
  return buildApp(accountApp, { userId }).request('/me/rating-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Seeds `names` as categories with equal-ish weights summing to 1.00. */
async function seedCategories(userId: string, names: string[]) {
  const each = Math.floor(100 / names.length) / 100
  const rows = []
  for (const [i, name] of names.entries()) {
    rows.push(
      await prisma.ratingCategory.create({
        data: { userId, name, weight: each, sortOrder: i },
      })
    )
  }
  return rows
}

/** The user's categories in stored display order. */
async function storedOrder(userId: string) {
  const cats = await prisma.ratingCategory.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  })
  return cats.map((c) => c.name)
}

/** A config body whose weights sum to exactly 1.00. */
function config(categories: { id?: string; name: string; weight: number }[]) {
  return {
    categories,
    includeEnjoyment: false,
    enjoymentWeight: 0,
    enjoymentSortOrder: 0,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── GET ─────────────────────────────────────────────────────────────────────

describe('GET /me/rating-categories', () => {
  it('returns the stored categories in sort order with numeric weights', async () => {
    const user = await seedUser(prisma)
    await seedCategories(user.id, ['Gameplay', 'Decoration'])

    const res = await buildApp(accountApp, { userId: user.id }).request(
      '/me/rating-categories'
    )
    const body = (await res.json()) as {
      data: { name: string; weight: number }[]
    }

    expect(res.status).toBe(200)
    expect(body.data.map((c) => c.name)).toEqual(['Gameplay', 'Decoration'])
    // Decimal(3,2) comes back as a Decimal instance; the serializer converts it.
    expect(typeof body.data[0]!.weight).toBe('number')
  })

  it('returns only the caller’s categories', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedCategories(user.id, ['Mine'])
    await seedCategories(other.id, ['Theirs'])

    const res = await buildApp(accountApp, { userId: user.id }).request(
      '/me/rating-categories'
    )
    const body = (await res.json()) as { data: { name: string }[] }

    expect(body.data.map((c) => c.name)).toEqual(['Mine'])
  })
})

// ─── PUT: the two-phase reorder ──────────────────────────────────────────────

describe('PUT /me/rating-config — reordering', () => {
  it('swaps two categories without colliding on sortOrder', async () => {
    // The reason for the negative-index parking phase: writing final positions
    // directly would have both rows briefly at the same index.
    const user = await seedUser(prisma)
    const [gameplay, deco] = await seedCategories(user.id, [
      'Gameplay',
      'Decoration',
    ])

    const res = await putConfig(
      user.id,
      config([
        { id: deco!.id, name: 'Decoration', weight: 0.5 },
        { id: gameplay!.id, name: 'Gameplay', weight: 0.5 },
      ])
    )

    expect(res.status).toBe(200)
    expect(await storedOrder(user.id)).toEqual(['Decoration', 'Gameplay'])
  })

  it('reverses a longer list end to end', async () => {
    const user = await seedUser(prisma)
    const cats = await seedCategories(user.id, ['A', 'B', 'C', 'D'])

    await putConfig(
      user.id,
      config(
        [...cats]
          .reverse()
          .map((c) => ({ id: c.id, name: c.name, weight: 0.25 }))
      )
    )

    expect(await storedOrder(user.id)).toEqual(['D', 'C', 'B', 'A'])
  })

  it('leaves no negative sortOrder behind', async () => {
    // Phase 1 parks rows at -1, -2, …; phase 2 must overwrite every one.
    const user = await seedUser(prisma)
    const cats = await seedCategories(user.id, ['A', 'B', 'C'])

    await putConfig(
      user.id,
      config(cats.map((c) => ({ id: c.id, name: c.name, weight: 0.33 })))
    )

    const stored = await prisma.ratingCategory.findMany({
      where: { userId: user.id },
    })
    expect(stored.every((c) => c.sortOrder >= 0)).toBe(true)
  })

  it('interleaves new categories with existing ones by body position', async () => {
    const user = await seedUser(prisma)
    const [existing] = await seedCategories(user.id, ['Existing'])

    await putConfig(
      user.id,
      config([
        { name: 'First', weight: 0.5 },
        { id: existing!.id, name: 'Existing', weight: 0.5 },
      ])
    )

    expect(await storedOrder(user.id)).toEqual(['First', 'Existing'])
  })
})

// ─── PUT: deletes ────────────────────────────────────────────────────────────

describe('PUT /me/rating-config — removing a category', () => {
  it('deletes the category and its rating scores together', async () => {
    // RatingScore.categoryId has no cascade, so the scores must be cleared
    // first or Postgres rejects the delete with a foreign key violation.
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '100' })
    const [keep, drop] = await seedCategories(user.id, ['Keep', 'Drop'])
    const lp = await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '100', status: 'COMPLETED' },
    })
    await prisma.ratingScore.createMany({
      data: [
        { levelProgressId: lp.id, categoryId: keep!.id, score: 80 },
        { levelProgressId: lp.id, categoryId: drop!.id, score: 60 },
      ],
    })

    const res = await putConfig(
      user.id,
      config([{ id: keep!.id, name: 'Keep', weight: 1 }])
    )

    expect(res.status).toBe(200)
    expect(await storedOrder(user.id)).toEqual(['Keep'])
    const scores = await prisma.ratingScore.findMany({
      where: { levelProgressId: lp.id },
    })
    expect(scores.map((s) => s.categoryId)).toEqual([keep!.id])
  })

  it('rejects an id belonging to another user without touching anything', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const [theirs] = await seedCategories(other.id, ['Theirs'])
    await seedCategories(user.id, ['Mine'])

    const res = await putConfig(
      user.id,
      config([{ id: theirs!.id, name: 'Hijacked', weight: 1 }])
    )

    expect(res.status).toBe(404)
    expect(await storedOrder(user.id)).toEqual(['Mine'])
    expect(await storedOrder(other.id)).toEqual(['Theirs'])
  })
})

// ─── PUT: constraints and the response ───────────────────────────────────────

describe('PUT /me/rating-config — constraints', () => {
  it('400s on duplicate names before reaching the constraint', async () => {
    // The zod check compares case-insensitively, so it catches this pair first;
    // @@unique([userId, name]) is the backstop for a direct API hit that races
    // past it, which is why the handler still maps P2002 to a 409.
    const user = await seedUser(prisma)
    await seedCategories(user.id, ['Gameplay'])

    const res = await putConfig(
      user.id,
      config([
        { name: 'Dupe', weight: 0.5 },
        { name: 'Dupe', weight: 0.5 },
      ])
    )

    expect(res.status).toBe(400)
  })

  it('persists the enjoyment settings alongside the categories', async () => {
    const user = await seedUser(prisma)

    const res = await putConfig(user.id, {
      categories: [{ name: 'Gameplay', weight: 0.6 }],
      includeEnjoyment: true,
      enjoymentWeight: 0.4,
      enjoymentSortOrder: 2,
    })

    expect(res.status).toBe(200)
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })
    expect(stored.includeEnjoyment).toBe(true)
    expect(Number(stored.enjoymentWeight)).toBe(0.4)
    expect(stored.enjoymentSortOrder).toBe(2)
  })

  it('returns the refreshed me payload reflecting the new config', async () => {
    const user = await seedUser(prisma)

    const res = await putConfig(
      user.id,
      config([
        { name: 'Gameplay', weight: 0.5 },
        { name: 'Decoration', weight: 0.5 },
      ])
    )
    const body = (await res.json()) as {
      data: { ratingCategories: { name: string }[] }
    }

    expect(body.data.ratingCategories.map((c) => c.name)).toEqual([
      'Gameplay',
      'Decoration',
    ])
  })
})
