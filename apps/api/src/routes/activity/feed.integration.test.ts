/**
 * Integration tests for GET /v1/me/activity against a real database.
 *
 * Three things can only be checked here. The merge has to interleave two tables
 * by recorded time and stay stable across a page boundary, which needs real
 * rows with real timestamps. RANKING_REBALANCE has to be absent from every
 * response, which is a property of the query rather than of any mapper. And the
 * level filter has to be a UNION over activity_log.levelId and the impact rows,
 * so an import that moved a level still appears in that level's history.
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

const { default: activityApp } = await import('./index')

const prisma = getTestPrisma()

let levelSeq = 9000

async function seedProgressUpdate(
  userId: string,
  opts: { loggedAt: Date; kind?: 'PROGRESS' | 'DROP' | 'COMPLETION' }
) {
  const inGameId = String(levelSeq++)
  await seedLevel(prisma, { inGameId, name: `Level ${inGameId}` })
  const lp = await prisma.levelProgress.create({
    data: { userId, levelId: inGameId, status: 'IN_PROGRESS' },
  })
  const update = await prisma.progressUpdate.create({
    data: {
      levelProgressId: lp.id,
      kind: opts.kind ?? 'PROGRESS',
      percentage: 42,
      loggedAt: opts.loggedAt,
    },
  })
  return { ...update, inGameId }
}

async function seedEvent(
  userId: string,
  opts: {
    eventType:
      | 'RANKING_PLACEMENT'
      | 'RANKING_REBALANCE'
      | 'RANKING_BULK_REPLACE'
      | 'LOG_EDIT'
      | 'RATING_CONFIG_CHANGE'
    createdAt: Date
    levelId?: string
    impactLevelIds?: string[]
    fieldChanges?: {
      fieldName: string
      category: 'RATING' | 'SESSION_DETAIL' | 'METADATA' | 'RATING_CONFIG'
    }[]
  }
) {
  return prisma.activityLog.create({
    data: {
      userId,
      eventType: opts.eventType,
      createdAt: opts.createdAt,
      levelId: opts.levelId ?? null,
      levelImpacts: {
        create: (opts.impactLevelIds ?? []).map((levelId, i) => ({
          levelId,
          levelName: `Level ${levelId}`,
          role: 'MOVER' as const,
          rankingIndex: String(10 - i),
          positionBefore: i + 1,
          positionAfter: i + 1,
        })),
      },
      fieldChanges: {
        create: (opts.fieldChanges ?? []).map((f) => ({
          ...f,
          oldValue: '1',
          newValue: '2',
        })),
      },
    },
  })
}

function get(userId: string, query = '') {
  return buildApp(activityApp, { userId }).request(`/me/activity${query}`)
}

async function feed(userId: string, query = '') {
  const res = await get(userId, query)
  expect(res.status).toBe(200)
  return (await res.json()) as {
    data: Array<Record<string, unknown>>
    nextCursor: string | null
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /v1/me/activity', () => {
  it('merges both tables newest-first by recorded time', async () => {
    const user = await seedUser(prisma)
    const older = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T10:00:00Z'),
    })
    const newer = await seedEvent(user.id, {
      eventType: 'LOG_EDIT',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      levelId: older.inGameId,
      fieldChanges: [{ fieldName: 'notes', category: 'SESSION_DETAIL' }],
    })

    const { data } = await feed(user.id)
    expect(data.map((r) => r.id)).toEqual([newer.id, older.id])
    expect(data[0]!.source).toBe('EVENT')
    expect(data[1]!.source).toBe('PROGRESS')
  })

  it('puts the event before the progress update it followed on a tie', async () => {
    // An event normally follows the write that triggered it, so a tie reads in
    // causal order rather than in whatever order the union returned.
    const user = await seedUser(prisma)
    const at = new Date('2026-08-25T12:00:00Z')
    const update = await seedProgressUpdate(user.id, { loggedAt: at })
    const event = await seedEvent(user.id, {
      eventType: 'RANKING_PLACEMENT',
      createdAt: at,
      levelId: update.inGameId,
      impactLevelIds: [update.inGameId],
    })

    const { data } = await feed(user.id)
    expect(data.map((r) => r.id)).toEqual([event.id, update.id])
  })

  it('never returns a rebalance', async () => {
    // The one hidden event type. Excluded in the query, not styled quiet.
    const user = await seedUser(prisma)
    const level = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T09:00:00Z'),
    })
    await seedEvent(user.id, {
      eventType: 'RANKING_REBALANCE',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      impactLevelIds: [level.inGameId],
    })

    const { data } = await feed(user.id)
    expect(data.map((r) => r.source)).toEqual(['PROGRESS'])
  })

  it('excludes a rebalance from a level-filtered feed too', async () => {
    const user = await seedUser(prisma)
    const level = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T09:00:00Z'),
    })
    await seedEvent(user.id, {
      eventType: 'RANKING_REBALANCE',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      impactLevelIds: [level.inGameId],
    })

    const { data } = await feed(user.id, `?levelId=${level.inGameId}`)
    expect(data.every((r) => r.eventType !== 'RANKING_REBALANCE')).toBe(true)
  })

  it('matches a level through its impact rows, not just the event column', async () => {
    // A bulk replace has a null levelId and belongs to every level it touched.
    const user = await seedUser(prisma)
    const level = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T09:00:00Z'),
    })
    const replace = await seedEvent(user.id, {
      eventType: 'RANKING_BULK_REPLACE',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      impactLevelIds: [level.inGameId],
    })

    const { data } = await feed(user.id, `?levelId=${level.inGameId}`)
    expect(data.map((r) => r.id)).toContain(replace.id)
  })

  it('reports the true impact total alongside the capped preview', async () => {
    const user = await seedUser(prisma)
    const levelIds: string[] = []
    for (let i = 0; i < 14; i++) {
      const inGameId = String(levelSeq++)
      await seedLevel(prisma, { inGameId })
      levelIds.push(inGameId)
    }
    await seedEvent(user.id, {
      eventType: 'RANKING_BULK_REPLACE',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      impactLevelIds: levelIds,
    })

    const { data } = await feed(user.id)
    expect(data[0]!.impactCount).toBe(14)
    expect((data[0]!.levelImpacts as unknown[]).length).toBe(10)
  })

  it('narrows the Edits chip on field category, not on field names', async () => {
    const user = await seedUser(prisma)
    const level = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T09:00:00Z'),
    })
    const rating = await seedEvent(user.id, {
      eventType: 'LOG_EDIT',
      createdAt: new Date('2026-08-25T11:00:00Z'),
      levelId: level.inGameId,
      fieldChanges: [{ fieldName: 'simple_rating', category: 'RATING' }],
    })
    await seedEvent(user.id, {
      eventType: 'LOG_EDIT',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      levelId: level.inGameId,
      fieldChanges: [{ fieldName: 'notes', category: 'SESSION_DETAIL' }],
    })

    const { data } = await feed(user.id, '?kind=EDITS&category=RATING')
    expect(data.map((r) => r.id)).toEqual([rating.id])
  })

  it('returns only progress updates for the Progress chip', async () => {
    const user = await seedUser(prisma)
    const update = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T09:00:00Z'),
      kind: 'COMPLETION',
    })
    await seedEvent(user.id, {
      eventType: 'RANKING_PLACEMENT',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      levelId: update.inGameId,
      impactLevelIds: [update.inGameId],
    })

    const { data } = await feed(user.id, '?kind=PROGRESS')
    expect(data.map((r) => r.id)).toEqual([update.id])
  })

  it('returns the four visible ranking types for the Ranking chip', async () => {
    // And still not the fifth. A chip that named event types by hand would be
    // one edit away from letting the hidden one through.
    const user = await seedUser(prisma)
    const level = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T08:00:00Z'),
    })
    const placement = await seedEvent(user.id, {
      eventType: 'RANKING_PLACEMENT',
      createdAt: new Date('2026-08-25T09:00:00Z'),
      levelId: level.inGameId,
      impactLevelIds: [level.inGameId],
    })
    const replace = await seedEvent(user.id, {
      eventType: 'RANKING_BULK_REPLACE',
      createdAt: new Date('2026-08-25T10:00:00Z'),
      impactLevelIds: [level.inGameId],
    })
    await seedEvent(user.id, {
      eventType: 'RANKING_REBALANCE',
      createdAt: new Date('2026-08-25T11:00:00Z'),
      impactLevelIds: [level.inGameId],
    })
    await seedEvent(user.id, {
      eventType: 'LOG_EDIT',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      levelId: level.inGameId,
      fieldChanges: [{ fieldName: 'notes', category: 'SESSION_DETAIL' }],
    })

    const { data } = await feed(user.id, '?kind=RANKING')
    expect(data.map((r) => r.id)).toEqual([replace.id, placement.id])
  })

  it('returns the account-scoped events for the Settings chip', async () => {
    const user = await seedUser(prisma)
    await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T09:00:00Z'),
    })
    const config = await seedEvent(user.id, {
      eventType: 'RATING_CONFIG_CHANGE',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      fieldChanges: [{ fieldName: 'rating_mode', category: 'RATING_CONFIG' }],
    })

    const { data } = await feed(user.id, '?kind=SETTINGS')
    expect(data.map((r) => r.id)).toEqual([config.id])
  })

  it('unions the chips rather than intersecting them', async () => {
    const user = await seedUser(prisma)
    const update = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T09:00:00Z'),
    })
    const config = await seedEvent(user.id, {
      eventType: 'RATING_CONFIG_CHANGE',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      fieldChanges: [{ fieldName: 'rating_mode', category: 'RATING_CONFIG' }],
    })
    await seedEvent(user.id, {
      eventType: 'LOG_EDIT',
      createdAt: new Date('2026-08-25T11:00:00Z'),
      levelId: update.inGameId,
      fieldChanges: [{ fieldName: 'notes', category: 'SESSION_DETAIL' }],
    })

    const { data } = await feed(user.id, '?kind=PROGRESS&kind=SETTINGS')
    expect(data.map((r) => r.id)).toEqual([config.id, update.id])
  })

  it('bounds the range on recorded time', async () => {
    const user = await seedUser(prisma)
    const inRange = await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T12:00:00Z'),
    })
    await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-20T12:00:00Z'),
    })

    const { data } = await feed(user.id, '?from=2026-08-24T00:00:00.000Z')
    expect(data.map((r) => r.id)).toEqual([inRange.id])
  })

  it('paginates a batch that shares one timestamp without skipping or repeating', async () => {
    // The import writes its progress updates in one createMany, so a whole
    // batch shares one loggedAt — exactly the case the third sort key exists
    // for. Without it a page boundary landing mid-batch loses rows.
    const user = await seedUser(prisma)
    const at = new Date('2026-08-25T12:00:00Z')
    const expected: string[] = []
    for (let i = 0; i < 35; i++) {
      const update = await seedProgressUpdate(user.id, { loggedAt: at })
      expected.push(update.id)
    }

    const first = await feed(user.id)
    expect(first.data).toHaveLength(30)
    expect(first.nextCursor).not.toBeNull()

    const second = await feed(
      user.id,
      `?cursor=${encodeURIComponent(first.nextCursor!)}`
    )
    expect(second.nextCursor).toBeNull()

    const seen = [...first.data, ...second.data].map((r) => r.id as string)
    expect(new Set(seen).size).toBe(35)
    expect([...seen].sort()).toEqual([...expected].sort())
  })

  it('never returns another user’s rows', async () => {
    const mine = await seedUser(prisma)
    const theirs = await seedUser(prisma)
    await seedProgressUpdate(theirs.id, {
      loggedAt: new Date('2026-08-25T12:00:00Z'),
    })
    await seedEvent(theirs.id, {
      eventType: 'RATING_CONFIG_CHANGE',
      createdAt: new Date('2026-08-25T12:00:00Z'),
      fieldChanges: [{ fieldName: 'rating_mode', category: 'RATING_CONFIG' }],
    })

    const { data } = await feed(mine.id)
    expect(data).toEqual([])
  })

  it('starts from the first page when handed a malformed cursor', async () => {
    const user = await seedUser(prisma)
    await seedProgressUpdate(user.id, {
      loggedAt: new Date('2026-08-25T12:00:00Z'),
    })

    const { data } = await feed(user.id, '?cursor=not-a-cursor')
    expect(data).toHaveLength(1)
  })
})
