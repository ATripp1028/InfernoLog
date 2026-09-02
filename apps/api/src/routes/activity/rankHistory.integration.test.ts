/**
 * Integration tests for GET /v1/me/levels/:levelId/rank-history.
 *
 * The half worth testing here is the reconstruction, and it can only be tested
 * against real emission: an INDIRECT shift is by definition a move that wrote
 * NO row for this level, so it exists only as the gap between what the demon list
 * endpoints recorded and where the level actually ended up.
 *
 * The other two properties are about what must never appear. A rebalance is
 * read to re-anchor the index map and never returned. And a shift the walk can
 * prove but cannot attribute — the hole a deleted entry leaves — comes back as
 * an UNATTRIBUTED entry rather than being silently swallowed or wrongly blamed
 * on the event that revealed it.
 *
 * Every test seeds a baseline rebalance over the demon list it set up, because
 * that is what production has: migration 20260825120000_rank_history_baseline
 * writes one per user, and without it the index map holds only levels touched
 * since event logging shipped. A test that skipped it would be exercising a
 * state the database cannot be in.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RankHistoryResponse } from '@infernolog/core'
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

const { default: activityApp } = await import('./index')
const { default: rankingApp } = await import('../demonList/index')
const { default: progressApp } = await import('../progress/index')

const prisma = getTestPrisma()

let levelSeq = 7000

async function seedCompletion(userId: string, name?: string) {
  const inGameId = String(levelSeq++)
  await seedLevel(prisma, {
    inGameId,
    isDemon: true,
    name: name ?? `Level ${inGameId}`,
  })
  const lp = await prisma.levelProgress.create({
    data: { userId, levelId: inGameId, status: 'COMPLETED' },
  })
  await prisma.progressUpdate.create({
    data: { levelProgressId: lp.id, kind: 'COMPLETION' },
  })
  return { ...lp, inGameId }
}

async function seedPlaced(userId: string, listIndex: number, name?: string) {
  const lp = await seedCompletion(userId, name)
  await prisma.classicDemonList.create({
    data: {
      userId,
      levelProgressId: lp.id,
      listIndex: String(listIndex),
    },
  })
  return lp
}

/**
 * The baseline event the rank-history migration writes: one DEMON_LIST_REBALANCE
 * carrying every currently placed level's index and position. Mirrors
 * 20260825120000_rank_history_baseline.
 */
async function seedBaseline(userId: string) {
  const placed = await prisma.classicDemonList.findMany({
    where: { userId },
    orderBy: { listIndex: 'desc' },
    select: {
      listIndex: true,
      levelProgress: {
        select: { levelId: true, level: { select: { name: true } } },
      },
    },
  })
  if (placed.length === 0) return
  await prisma.activityLog.create({
    data: {
      userId,
      eventType: 'DEMON_LIST_REBALANCE',
      levelImpacts: {
        create: placed.map((row, i) => ({
          levelId: row.levelProgress.levelId,
          levelName: row.levelProgress.level.name,
          role: 'MOVER' as const,
          orderIndex: row.listIndex,
          positionBefore: i + 1,
          positionAfter: i + 1,
        })),
      },
    },
  })
}

function send(
  app: Parameters<typeof buildApp>[0],
  userId: string,
  method: string,
  path: string,
  payload?: unknown
) {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  }
  if (payload !== undefined) init.body = JSON.stringify(payload)
  return buildApp(app, { userId }).request(path, init)
}

async function history(userId: string, levelId: string) {
  const res = await buildApp(activityApp, { userId }).request(
    `/me/levels/${levelId}/rank-history`
  )
  expect(res.status).toBe(200)
  return (await res.json()) as RankHistoryResponse
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /v1/me/levels/:levelId/rank-history', () => {
  it('returns an empty history and no position for a level never placed', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)

    const result = await history(user.id, lp.inGameId)
    expect(result.data).toEqual([])
    expect(result.currentPosition).toBeNull()
  })

  it('reports a placement with the positions the event recorded', async () => {
    const user = await seedUser(prisma)
    const anchor = await seedPlaced(user.id, 10, 'Tartarus')
    await seedBaseline(user.id)
    const fresh = await seedCompletion(user.id, 'Acheron')

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      belowId: anchor.id,
    })

    const result = await history(user.id, fresh.inGameId)
    expect(result.currentPosition).toBe(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      kind: 'DIRECT',
      eventType: 'DEMON_LIST_PLACEMENT',
      positionBefore: null,
      positionAfter: 1,
    })
    // The neighbour it landed next to travels with the entry.
    expect(result.data[0]!.neighbors.map((n) => n.levelName)).toEqual([
      'Tartarus',
    ])
  })

  it('reconstructs a shift caused by a level it has no row on', async () => {
    // Placing at the top records the mover and its one neighbour. The level two
    // positions further down gets no row at all, and its shift exists only as
    // the difference between the demon list before and after.
    const user = await seedUser(prisma)
    const top = await seedPlaced(user.id, 30, 'Slaughterhouse')
    await seedPlaced(user.id, 20, 'Bloodbath')
    const target = await seedPlaced(user.id, 10, 'Cataclysm')
    await seedBaseline(user.id)
    const fresh = await seedCompletion(user.id, 'Avernus')

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      belowId: top.id,
    })

    const result = await history(user.id, target.inGameId)
    expect(result.currentPosition).toBe(4)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      kind: 'INDIRECT',
      eventType: 'DEMON_LIST_PLACEMENT',
      positionBefore: 3,
      positionAfter: 4,
    })
    // Unattributed is the fallback, not the default: the mover is named.
    expect(result.data[0]!.cause).toMatchObject({ levelName: 'Avernus' })
  })

  it('reports no shift for a placement that landed below it', async () => {
    const user = await seedUser(prisma)
    const target = await seedPlaced(user.id, 30, 'Slaughterhouse')
    const bottom = await seedPlaced(user.id, 10, 'Cataclysm')
    await seedBaseline(user.id)
    const fresh = await seedCompletion(user.id, 'Avernus')

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      aboveId: bottom.id,
    })

    const result = await history(user.id, target.inGameId)
    expect(result.currentPosition).toBe(1)
    expect(result.data).toEqual([])
  })

  it('records leaving the demon list and the position it left from', async () => {
    const user = await seedUser(prisma)
    const top = await seedPlaced(user.id, 30)
    const target = await seedPlaced(user.id, 20)
    await seedPlaced(user.id, 10)
    await seedBaseline(user.id)

    await send(
      rankingApp,
      user.id,
      'DELETE',
      `/me/demon-list/classic/${target.id}`
    )

    const result = await history(user.id, target.inGameId)
    expect(result.currentPosition).toBeNull()
    expect(result.data[0]).toMatchObject({
      kind: 'DIRECT',
      eventType: 'DEMON_LIST_REMOVED',
      positionBefore: 2,
      positionAfter: null,
    })
    // The levels it left behind are untouched by its departure.
    expect((await history(user.id, top.inGameId)).currentPosition).toBe(1)
  })

  it('never returns a rebalance', async () => {
    const user = await seedUser(prisma)
    const target = await seedPlaced(user.id, 10)
    await seedBaseline(user.id)
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        eventType: 'DEMON_LIST_REBALANCE',
        levelImpacts: {
          create: [
            {
              levelId: target.levelId,
              levelName: 'Cataclysm',
              role: 'MOVER',
              orderIndex: '10',
              positionBefore: 1,
              positionAfter: 1,
            },
          ],
        },
      },
    })

    const result = await history(user.id, target.inGameId)
    expect(result.data).toEqual([])
  })

  it('reports a bulk replace as one entry carrying the levels it touched', async () => {
    // An import swapping the two levels: one event for the whole replace, with
    // the per-level detail in its impact rows.
    const user = await seedUser(prisma)
    const target = await seedPlaced(user.id, 30, 'Target')
    const other = await seedPlaced(user.id, 20, 'Other')
    await seedBaseline(user.id)

    await prisma.classicDemonList.updateMany({
      where: { levelProgressId: target.id },
      data: { listIndex: '20' },
    })
    await prisma.classicDemonList.updateMany({
      where: { levelProgressId: other.id },
      data: { listIndex: '30' },
    })
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        eventType: 'DEMON_LIST_BULK_REPLACE',
        levelImpacts: {
          create: [
            {
              levelId: target.levelId,
              levelName: 'Target',
              role: 'MOVER',
              orderIndex: '20',
              positionBefore: 1,
              positionAfter: 2,
            },
            {
              levelId: other.levelId,
              levelName: 'Other',
              role: 'MOVER',
              orderIndex: '30',
              positionBefore: 2,
              positionAfter: 1,
            },
          ],
        },
      },
    })

    const result = await history(user.id, target.inGameId)
    expect(result.currentPosition).toBe(2)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      kind: 'DIRECT',
      eventType: 'DEMON_LIST_BULK_REPLACE',
      positionBefore: 1,
      positionAfter: 2,
      levelsTouched: 2,
    })
  })

  it('returns an unattributed shift where a deleted entry left a hole', async () => {
    // Deleting a level's entry deletes that level's own events, and the delete
    // itself emits nothing — so the levels beneath it move up with nothing in
    // the data to say why. Its impact rows on OTHER events survive, so the
    // index map goes on counting it. The live ranking wins over the recomputed
    // position and the difference comes back with no cause named.
    const user = await seedUser(prisma)
    const top = await seedPlaced(user.id, 30, 'Slaughterhouse')
    const middle = await seedPlaced(user.id, 20, 'Bloodbath')
    await seedBaseline(user.id)
    const target = await seedCompletion(user.id, 'Cataclysm')

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: target.id,
      aboveId: middle.id,
    })

    await send(progressApp, user.id, 'DELETE', `/me/progress/${top.levelId}`)

    const result = await history(user.id, target.inGameId)
    expect(result.currentPosition).toBe(2)
    expect(result.data[0]).toMatchObject({
      kind: 'UNATTRIBUTED',
      eventType: null,
      positionBefore: 3,
      positionAfter: 2,
      cause: null,
    })
    // The move the user actually made is still reported, unchanged.
    expect(result.data[1]).toMatchObject({
      kind: 'DIRECT',
      eventType: 'DEMON_LIST_PLACEMENT',
      positionAfter: 3,
    })
  })

  it('never returns another user’s history', async () => {
    const mine = await seedUser(prisma)
    const theirs = await seedUser(prisma)
    const anchor = await seedPlaced(theirs.id, 10)
    const fresh = await seedCompletion(theirs.id)
    await send(rankingApp, theirs.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      belowId: anchor.id,
    })

    const result = await history(mine.id, fresh.inGameId)
    expect(result.data).toEqual([])
    expect(result.currentPosition).toBeNull()
  })
})
