/**
 * Integration tests for rating-category ownership on the logging write paths.
 *
 * `RatingScore.categoryId` is a bare foreign key into `rating_categories` — the
 * column carries no user of its own, so Postgres accepts ANY existing category
 * id here, including one belonging to a different account. The scoping is
 * purely application-level (assertOwnedCategories in services/progress), which
 * is exactly the kind of rule a real database is worth exercising against: a
 * unit test with a mocked client can only prove we called `count`, not that the
 * FK would otherwise have let the row through.
 *
 * Two accounts are seeded so the "someone else's category" case is a genuine
 * cross-account id rather than a made-up UUID that no row matches.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
  seedRatingCategory,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: progressApp } = await import('./index')

const prisma = getTestPrisma()
const LEVEL_ID = '77001'

function post(userId: string, body: unknown) {
  return buildApp(progressApp, { userId }).request('/me/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patch(userId: string, body: unknown) {
  return buildApp(progressApp, { userId }).request(`/me/progress/${LEVEL_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

let victimCategoryId: string
let ownCategoryId: string
let attackerId: string

beforeEach(async () => {
  await truncateAll(prisma)
  await seedLevel(prisma, { inGameId: LEVEL_ID })

  const victim = await seedUser(prisma, { username: 'victim' })
  const attacker = await seedUser(prisma, { username: 'attacker' })
  attackerId = attacker.id

  victimCategoryId = (await seedRatingCategory(prisma, victim.id, 'Decoration'))
    .id
  ownCategoryId = (await seedRatingCategory(prisma, attacker.id, 'Gameplay')).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('POST /me/completions — rating category scoping', () => {
  it('accepts the caller’s own category', async () => {
    const res = await post(attackerId, {
      levelId: LEVEL_ID,
      ratingScores: [{ categoryId: ownCategoryId, score: 80 }],
    })

    expect(res.status).toBe(201)
    expect(await prisma.ratingScore.count()).toBe(1)
  })

  it('rejects another account’s category and writes nothing', async () => {
    const res = await post(attackerId, {
      levelId: LEVEL_ID,
      ratingScores: [{ categoryId: victimCategoryId, score: 80 }],
    })

    expect(res.status).toBe(400)
    // The whole transaction rolls back — no orphan level_progress either.
    expect(await prisma.ratingScore.count()).toBe(0)
    expect(await prisma.levelProgress.count()).toBe(0)
  })

  it('rejects a mixed payload rather than applying the owned half', async () => {
    const res = await post(attackerId, {
      levelId: LEVEL_ID,
      ratingScores: [
        { categoryId: ownCategoryId, score: 80 },
        { categoryId: victimCategoryId, score: 60 },
      ],
    })

    expect(res.status).toBe(400)
    expect(await prisma.ratingScore.count()).toBe(0)
  })
})

describe('PATCH /me/progress/:levelId — rating category scoping', () => {
  beforeEach(async () => {
    // An existing completion for the attacker, so the edit path has a target.
    await post(attackerId, {
      levelId: LEVEL_ID,
      ratingScores: [{ categoryId: ownCategoryId, score: 80 }],
    })
  })

  it('rejects another account’s category and leaves the existing scores intact', async () => {
    const res = await patch(attackerId, {
      ratingScores: [{ categoryId: victimCategoryId, score: 99 }],
    })

    expect(res.status).toBe(400)
    // applyEdit deletes the old scores before inserting the new ones, so a
    // check that ran too late would leave the entry with NO ratings at all.
    const scores = await prisma.ratingScore.findMany()
    expect(scores).toHaveLength(1)
    expect(scores[0]!.categoryId).toBe(ownCategoryId)
  })

  it('still accepts the caller’s own category', async () => {
    const res = await patch(attackerId, {
      ratingScores: [{ categoryId: ownCategoryId, score: 55 }],
    })

    expect(res.status).toBe(200)
    const scores = await prisma.ratingScore.findMany()
    expect(scores).toHaveLength(1)
    expect(scores[0]!.score).toBe(55)
  })
})
