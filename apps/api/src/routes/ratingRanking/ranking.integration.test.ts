// The MANUAL rating ordering's endpoints, against a real database.
//
// The interesting cases are the ones the fractional index makes possible:
// dropping between two neighbours, at either end, and the renormalisation that
// fires when a gap closes too far. The event side of each write is covered by
// services/invariants.integration.test.ts, which sweeps for an index written
// without a matching event.

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

const { default: rankingApp } = await import('./index')

const prisma = getTestPrisma()

function send(
  userId: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

type Body = {
  ranked: { rank: number; levelProgressId: string; ratingIndex: number }[]
  unranked: { levelProgressId: string }[]
}

async function read(userId: string): Promise<Body> {
  const res = await send(userId, 'GET', '/me/ranking')
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: Body }
  return body.data
}

let levelSeq = 9000

async function seedCompletion(userId: string, status = 'COMPLETED') {
  const inGameId = String(levelSeq++)
  await seedLevel(prisma, { inGameId, isDemon: true })
  return prisma.levelProgress.create({
    data: { userId, levelId: inGameId, status: status as 'COMPLETED' },
  })
}

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /me/ranking', () => {
  it('starts with every completion unranked', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)

    const body = await read(user.id)

    expect(body.ranked).toEqual([])
    expect(body.unranked.map((u) => u.levelProgressId)).toEqual([lp.id])
  })
})

describe('POST /me/ranking', () => {
  it('ranks a completion and moves it out of the unranked pile', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)

    const res = await send(user.id, 'POST', '/me/ranking', {
      levelProgressId: lp.id,
    })

    expect(res.status).toBe(201)
    const body = await read(user.id)
    expect(body.ranked.map((r) => r.levelProgressId)).toEqual([lp.id])
    expect(body.unranked).toEqual([])
  })

  it('drops between two neighbours', async () => {
    const user = await seedUser(prisma)
    const best = await seedCompletion(user.id)
    const worst = await seedCompletion(user.id)
    const middle = await seedCompletion(user.id)

    await send(user.id, 'POST', '/me/ranking', { levelProgressId: worst.id })
    await send(user.id, 'POST', '/me/ranking', {
      levelProgressId: best.id,
      belowId: worst.id,
    })
    await send(user.id, 'POST', '/me/ranking', {
      levelProgressId: middle.id,
      aboveId: best.id,
      belowId: worst.id,
    })

    const body = await read(user.id)
    expect(body.ranked.map((r) => r.levelProgressId)).toEqual([
      best.id,
      middle.id,
      worst.id,
    ])
    expect(body.ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('refuses a completion that is already ranked', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)
    await send(user.id, 'POST', '/me/ranking', { levelProgressId: lp.id })

    const res = await send(user.id, 'POST', '/me/ranking', {
      levelProgressId: lp.id,
    })

    expect(res.status).toBe(400)
  })

  // The ranking is of levels you have finished; an in-progress entry has no
  // place in it yet.
  it('refuses an entry that is not a completion', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id, 'IN_PROGRESS')

    const res = await send(user.id, 'POST', '/me/ranking', {
      levelProgressId: lp.id,
    })

    expect(res.status).toBe(400)
  })

  it("refuses another user's entry", async () => {
    const owner = await seedUser(prisma)
    const stranger = await seedUser(prisma, { email: 'other@example.com' })
    const lp = await seedCompletion(owner.id)

    const res = await send(stranger.id, 'POST', '/me/ranking', {
      levelProgressId: lp.id,
    })

    expect(res.status).toBe(404)
  })
})

describe('PATCH /me/ranking/:levelProgressId', () => {
  it('moves an entry past its neighbour', async () => {
    const user = await seedUser(prisma)
    const a = await seedCompletion(user.id)
    const b = await seedCompletion(user.id)
    await send(user.id, 'POST', '/me/ranking', { levelProgressId: a.id })
    await send(user.id, 'POST', '/me/ranking', {
      levelProgressId: b.id,
      belowId: a.id,
    })

    // b is #1; send it below a.
    const res = await send(user.id, 'PATCH', `/me/ranking/${b.id}`, {
      aboveId: a.id,
    })

    expect(res.status).toBe(200)
    const body = await read(user.id)
    expect(body.ranked.map((r) => r.levelProgressId)).toEqual([a.id, b.id])
  })

  it('refuses to make an entry its own neighbour', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)
    await send(user.id, 'POST', '/me/ranking', { levelProgressId: lp.id })

    const res = await send(user.id, 'PATCH', `/me/ranking/${lp.id}`, {
      aboveId: lp.id,
    })

    expect(res.status).toBe(400)
  })

  it('404s an entry that is not ranked', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)

    const res = await send(user.id, 'PATCH', `/me/ranking/${lp.id}`, {})

    expect(res.status).toBe(404)
  })
})

describe('DELETE /me/ranking/:levelProgressId', () => {
  it('returns the entry to the unranked pile, keeping the completion', async () => {
    const user = await seedUser(prisma)
    const lp = await seedCompletion(user.id)
    await send(user.id, 'POST', '/me/ranking', { levelProgressId: lp.id })

    const res = await send(user.id, 'DELETE', `/me/ranking/${lp.id}`)

    expect(res.status).toBe(200)
    const body = await read(user.id)
    expect(body.ranked).toEqual([])
    expect(body.unranked.map((u) => u.levelProgressId)).toEqual([lp.id])
    // The completion itself is untouched.
    expect(
      await prisma.levelProgress.count({ where: { id: lp.id } })
    ).toBe(1)
  })
})

// Bisecting the same gap repeatedly closes it past the rebalance threshold; the
// service renormalises the whole list inline and the insert lands in the new
// coordinate system. Nothing about the ORDER may change.
describe('renormalisation', () => {
  it('keeps the order when a gap closes too far', async () => {
    const user = await seedUser(prisma)
    const top = await seedCompletion(user.id)
    const bottom = await seedCompletion(user.id)
    await send(user.id, 'POST', '/me/ranking', { levelProgressId: bottom.id })
    await send(user.id, 'POST', '/me/ranking', {
      levelProgressId: top.id,
      belowId: bottom.id,
    })

    const inserted: string[] = []
    for (let i = 0; i < 20; i++) {
      const lp = await seedCompletion(user.id)
      await send(user.id, 'POST', '/me/ranking', {
        levelProgressId: lp.id,
        aboveId: top.id,
        belowId: inserted[0] ?? bottom.id,
      })
      inserted.unshift(lp.id)
    }

    const body = await read(user.id)
    expect(body.ranked.map((r) => r.levelProgressId)).toEqual([
      top.id,
      ...inserted,
      bottom.id,
    ])
    // Every position is still distinct and contiguous.
    expect(body.ranked.map((r) => r.rank)).toEqual(
      body.ranked.map((_, i) => i + 1)
    )
  })
})
