import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../test/utils'

// Real DB; the ranking flow has no external HTTP, so only infra is mocked.
vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: rankingApp } = await import('./ranking')

const prisma = getTestPrisma()

// ─────────────────────────────────────────────
// Request helpers
// ─────────────────────────────────────────────

function get(userId: string, path: string) {
  return buildApp(rankingApp, { userId }).request(path)
}

async function getRanking(userId: string): Promise<RankingBody> {
  const res = await get(userId, '/me/ranking/classic')
  return (await res.json()) as RankingBody
}

function send(
  userId: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown
) {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (payload !== undefined) init.body = JSON.stringify(payload)
  return buildApp(rankingApp, { userId }).request(path, init)
}

type RankingBody = {
  data: {
    placed: Array<{
      rank: number
      levelProgressId: string
      rankingIndex: number
      hasPendingUpdate: boolean
      attempts: number | null
      level: { inGameId: string; isRated: boolean }
      badge: { listSource: string; tierOrRank: string } | null
    }>
    unplaced: Array<{
      levelProgressId: string
      hasPendingUpdate: boolean
      attempts: number | null
      badge: { listSource: string; tierOrRank: string } | null
    }>
  }
}

// ─────────────────────────────────────────────
// Seed helpers — a completion is a COMPLETED level_progress with one
// isCompletion=true update; placing it adds a ClassicRanking row.
// ─────────────────────────────────────────────

let levelSeq = 1000

async function seedCompletion(
  userId: string,
  opts: {
    listRefs?: Array<{ listSource: string; tierOrRank: string }>
    levelOverrides?: Parameters<typeof seedLevel>[1]
    attempts?: number
  } = {}
) {
  const inGameId = String(levelSeq++)
  await seedLevel(prisma, { inGameId, isDemon: true, ...opts.levelOverrides })
  const lp = await prisma.levelProgress.create({
    data: { userId, levelId: inGameId, status: 'COMPLETED' },
  })
  await prisma.progressUpdate.create({
    data: {
      levelProgressId: lp.id,
      isCompletion: true,
      ...(opts.attempts != null ? { attempts: opts.attempts } : {}),
      ...(opts.listRefs
        ? {
            listReferences: {
              create: opts.listRefs.map((r) => ({
                listSource: r.listSource as never,
                tierOrRank: r.tierOrRank,
                atTimeOfLogging: true,
              })),
            },
          }
        : {}),
    },
  })
  return lp
}

async function seedPlaced(
  userId: string,
  rankingIndex: string | number,
  opts: Parameters<typeof seedCompletion>[1] = {}
) {
  const lp = await seedCompletion(userId, opts)
  await prisma.classicRanking.create({
    data: { userId, levelProgressId: lp.id, rankingIndex: String(rankingIndex) },
  })
  return lp
}

async function indexOf(levelProgressId: string): Promise<number> {
  const row = await prisma.classicRanking.findFirstOrThrow({
    where: { levelProgressId },
    select: { rankingIndex: true },
  })
  return Number(row.rankingIndex)
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─────────────────────────────────────────────
// GET /me/ranking/classic
// ─────────────────────────────────────────────

describe('GET /me/ranking/classic', () => {
  it('returns placed entries ordered hardest-first with 1-based ranks', async () => {
    const user = await seedUser(prisma)
    const easy = await seedPlaced(user.id, 1)
    const hard = await seedPlaced(user.id, 3)
    const mid = await seedPlaced(user.id, 2)

    const res = await get(user.id, '/me/ranking/classic')
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as RankingBody

    expect(data.placed.map((e) => e.levelProgressId)).toEqual([
      hard.id,
      mid.id,
      easy.id,
    ])
    expect(data.placed.map((e) => e.rank)).toEqual([1, 2, 3])
    expect(data.unplaced).toHaveLength(0)
  })

  it('lists completed classic demons with no ranking row as unplaced', async () => {
    const user = await seedUser(prisma)
    const unplaced = await seedCompletion(user.id)
    await seedPlaced(user.id, 1)

    const { data } = await getRanking(user.id)

    expect(data.unplaced).toHaveLength(1)
    expect(data.unplaced[0]?.levelProgressId).toBe(unplaced.id)
  })

  it('excludes non-demon and platformer completions from unplaced', async () => {
    const user = await seedUser(prisma)
    await seedCompletion(user.id, {
      levelOverrides: { isDemon: false },
    })
    await seedCompletion(user.id, {
      levelOverrides: { levelType: 'PLATFORMER' },
    })

    const { data } = await getRanking(user.id)

    expect(data.placed).toHaveLength(0)
    expect(data.unplaced).toHaveLength(0)
  })

  it('derives the badge GDDL → AREDL, ignoring NLW/OTHER', async () => {
    const user = await seedUser(prisma)
    // GDDL wins when present alongside others.
    await seedPlaced(user.id, 3, {
      listRefs: [
        { listSource: 'NLW', tierOrRank: 'Hard' },
        { listSource: 'AREDL', tierOrRank: '12' },
        { listSource: 'GDDL', tierOrRank: '28' },
      ],
    })
    // AREDL is the fallback when there's no GDDL.
    await seedPlaced(user.id, 2, {
      listRefs: [{ listSource: 'AREDL', tierOrRank: '40' }],
    })
    // NLW-only → no badge.
    await seedPlaced(user.id, 1, {
      listRefs: [{ listSource: 'NLW', tierOrRank: 'Insane' }],
    })

    const { data } = await getRanking(user.id)

    expect(data.placed[0]?.badge).toEqual({ listSource: 'GDDL', tierOrRank: '28' })
    expect(data.placed[1]?.badge).toEqual({
      listSource: 'AREDL',
      tierOrRank: '40',
    })
    expect(data.placed[2]?.badge).toBeNull()
  })

  it('prefers AREDL over GDDL for extreme demons', async () => {
    const user = await seedUser(prisma)
    await seedPlaced(user.id, 2, {
      levelOverrides: { inGameDifficulty: 'Extreme Demon' },
      listRefs: [
        { listSource: 'GDDL', tierOrRank: '35' },
        { listSource: 'AREDL', tierOrRank: '7' },
      ],
    })
    // A non-extreme demon with the same refs still leads with GDDL.
    await seedPlaced(user.id, 1, {
      levelOverrides: { inGameDifficulty: 'Insane Demon' },
      listRefs: [
        { listSource: 'GDDL', tierOrRank: '30' },
        { listSource: 'AREDL', tierOrRank: '99' },
      ],
    })

    const { data } = await getRanking(user.id)

    expect(data.placed[0]?.badge).toEqual({ listSource: 'AREDL', tierOrRank: '7' })
    expect(data.placed[1]?.badge).toEqual({
      listSource: 'GDDL',
      tierOrRank: '30',
    })
  })

  it('surfaces hasPendingUpdate, isRated, and attempts on entries', async () => {
    const user = await seedUser(prisma)
    await seedPlaced(user.id, 1, {
      levelOverrides: { isDemon: true, isRated: false, hasPendingUpdate: true },
      attempts: 14231,
    })

    const { data } = await getRanking(user.id)

    expect(data.placed[0]?.hasPendingUpdate).toBe(true)
    expect(data.placed[0]?.level.isRated).toBe(false)
    expect(data.placed[0]?.attempts).toBe(14231)
  })

  it('scopes the ranking to the authed user', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedPlaced(other.id, 1)

    const { data } = await getRanking(user.id)

    expect(data.placed).toHaveLength(0)
    expect(data.unplaced).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────
// POST /me/ranking/classic — place
// ─────────────────────────────────────────────

describe('POST /me/ranking/classic', () => {
  it('places the first entry into an empty ranking', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)

    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: lp.id,
    })

    expect(res.status).toBe(201)
    const { data } = (await res.json()) as RankingBody
    expect(data.placed.map((e) => e.levelProgressId)).toEqual([lp.id])
    expect(data.unplaced).toHaveLength(0)
  })

  it('bisects between two neighbours (above = harder, below = easier)', async () => {
    const user = await seedUser(prisma)
    const hard = await seedPlaced(user.id, 4)
    const easy = await seedPlaced(user.id, 2)
    const lp = await seedCompletion(user.id)

    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: lp.id,
      aboveId: hard.id,
      belowId: easy.id,
    })

    expect(res.status).toBe(201)
    const { data } = (await res.json()) as RankingBody
    expect(data.placed.map((e) => e.levelProgressId)).toEqual([
      hard.id,
      lp.id,
      easy.id,
    ])
    expect(await indexOf(lp.id)).toBe(3) // midpoint of 4 and 2
  })

  it('drops at the top (no aboveId) and bottom (no belowId)', async () => {
    const user = await seedUser(prisma)
    const anchor = await seedPlaced(user.id, 5)
    const top = await seedCompletion(user.id)
    const bottom = await seedCompletion(user.id)

    await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: top.id,
      belowId: anchor.id,
    })
    await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: bottom.id,
      aboveId: anchor.id,
    })

    expect(await indexOf(top.id)).toBe(6) // anchor + 1
    expect(await indexOf(bottom.id)).toBe(4) // anchor - 1

    const { data } = await getRanking(user.id)
    expect(data.placed.map((e) => e.levelProgressId)).toEqual([
      top.id,
      anchor.id,
      bottom.id,
    ])
  })

  it('renormalises to integers when the neighbour gap is too tight', async () => {
    const user = await seedUser(prisma)
    // Two neighbours 0.00005 apart — below the 0.0001 rebalance threshold.
    const easy = await seedPlaced(user.id, '1')
    const hard = await seedPlaced(user.id, '1.00005')
    const lp = await seedCompletion(user.id)

    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: lp.id,
      aboveId: hard.id,
      belowId: easy.id,
    })

    expect(res.status).toBe(201)
    // The originals were renormalised to clean integers (1 and 2), and the new
    // entry bisects them at 1.5 — order preserved hard > new > easy.
    expect(await indexOf(easy.id)).toBe(1)
    expect(await indexOf(hard.id)).toBe(2)
    expect(await indexOf(lp.id)).toBe(1.5)

    const { data } = (await res.json()) as RankingBody
    expect(data.placed.map((e) => e.levelProgressId)).toEqual([
      hard.id,
      lp.id,
      easy.id,
    ])
  })

  it('rejects placing a non-demon (400)', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id, {
      levelOverrides: { isDemon: false },
    })

    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: lp.id,
    })
    expect(res.status).toBe(400)
  })

  it('rejects placing an in-progress (non-completion) entry (400)', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '7000', isDemon: true })
    const lp = await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '7000', status: 'IN_PROGRESS' },
    })

    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: lp.id,
    })
    expect(res.status).toBe(400)
  })

  it('rejects placing an already-placed entry (400)', async () => {
    const user = await seedUser(prisma)
    const lp = await seedPlaced(user.id, 1)

    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: lp.id,
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when placing another user’s entry', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const lp = await seedCompletion(other.id)

    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: lp.id,
    })
    expect(res.status).toBe(404)
  })

  it('rejects a malformed body (400)', async () => {
    const user = await seedUser(prisma)
    const res = await send(user.id, 'POST', '/me/ranking/classic', {
      levelProgressId: 'not-a-uuid',
    })
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────
// PATCH /me/ranking/classic/:levelProgressId — reorder
// ─────────────────────────────────────────────

describe('PATCH /me/ranking/classic/:levelProgressId', () => {
  it('moves a placed entry between new neighbours', async () => {
    const user = await seedUser(prisma)
    const a = await seedPlaced(user.id, 6) // hardest
    const b = await seedPlaced(user.id, 4)
    const c = await seedPlaced(user.id, 2) // easiest

    // Move c up between a and b.
    const res = await send(
      user.id,
      'PATCH',
      `/me/ranking/classic/${c.id}`,
      { aboveId: a.id, belowId: b.id }
    )

    expect(res.status).toBe(200)
    const { data } = (await res.json()) as RankingBody
    expect(data.placed.map((e) => e.levelProgressId)).toEqual([a.id, c.id, b.id])
    expect(await indexOf(c.id)).toBe(5) // midpoint of 6 and 4
  })

  it('rejects making an entry its own neighbour (400)', async () => {
    const user = await seedUser(prisma)
    const lp = await seedPlaced(user.id, 1)

    const res = await send(
      user.id,
      'PATCH',
      `/me/ranking/classic/${lp.id}`,
      { aboveId: lp.id }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when reordering an entry that is not placed', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id) // unplaced

    const res = await send(
      user.id,
      'PATCH',
      `/me/ranking/classic/${lp.id}`,
      {}
    )
    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────
// DELETE /me/ranking/classic/:levelProgressId — unplace
// ─────────────────────────────────────────────

describe('DELETE /me/ranking/classic/:levelProgressId', () => {
  it('removes the ranking row and returns the entry to unplaced', async () => {
    const user = await seedUser(prisma)
    const lp = await seedPlaced(user.id, 1)

    const res = await send(
      user.id,
      'DELETE',
      `/me/ranking/classic/${lp.id}`
    )

    expect(res.status).toBe(200)
    const { data } = (await res.json()) as RankingBody
    expect(data.placed).toHaveLength(0)
    expect(data.unplaced.map((e) => e.levelProgressId)).toEqual([lp.id])

    // The completion itself survives — only the ClassicRanking row is gone.
    const lpRow = await prisma.levelProgress.findUnique({
      where: { id: lp.id },
    })
    expect(lpRow?.status).toBe('COMPLETED')
    expect(await prisma.classicRanking.count()).toBe(0)
  })

  it('returns 404 when the entry is not placed', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)

    const res = await send(
      user.id,
      'DELETE',
      `/me/ranking/classic/${lp.id}`
    )
    expect(res.status).toBe(404)
  })

  it('does not let a user unplace another user’s entry (404)', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const lp = await seedPlaced(other.id, 1)

    const res = await send(
      user.id,
      'DELETE',
      `/me/ranking/classic/${lp.id}`
    )
    expect(res.status).toBe(404)
    expect(await prisma.classicRanking.count()).toBe(1)
  })
})
