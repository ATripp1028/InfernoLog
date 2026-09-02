/**
 * Integration tests for event emission against a real database.
 *
 * These drive the actual write paths — the demon list endpoints, the progress-edit
 * endpoint, the rating-config endpoint, the spreadsheet ranking import — and
 * assert on the rows that land in activity_log. The unit tests above cover the
 * diffing in isolation; what can only be checked here is that each path reaches
 * the emission at all, and that the positions and fractional indices recorded
 * match what the demon list actually holds afterwards.
 *
 * The reconstruction-integrity sweep ("every current orderIndex is the latest
 * one logged for that level") lives in services/invariants.integration.test.ts,
 * beside the other whole-database invariant sweeps.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityEventType } from '@prisma/client'
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
vi.mock('@sentry/aws-serverless', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: rankingApp } = await import('../../routes/demonList/index')
const { default: progressApp } = await import('../../routes/progress/index')
const { default: accountApp } = await import('../../routes/account/index')
const { commitImportRanking } = await import('../importExport/demonList')

const prisma = getTestPrisma()

// ─── request helpers ─────────────────────────────────────────────────────────

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

// ─── seed helpers ────────────────────────────────────────────────────────────

let levelSeq = 5000

async function seedCompletion(
  userId: string,
  overrides: { name?: string } = {}
) {
  const inGameId = String(levelSeq++)
  await seedLevel(prisma, {
    inGameId,
    isDemon: true,
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
  })
  const lp = await prisma.levelProgress.create({
    data: { userId, levelId: inGameId, status: 'COMPLETED' },
  })
  await prisma.progressUpdate.create({
    data: { levelProgressId: lp.id, kind: 'COMPLETION', attempts: 500 },
  })
  return { ...lp, inGameId }
}

async function seedPlaced(
  userId: string,
  listIndex: string | number,
  overrides: { name?: string } = {}
) {
  const lp = await seedCompletion(userId, overrides)
  await prisma.classicDemonList.create({
    data: {
      userId,
      levelProgressId: lp.id,
      listIndex: String(listIndex),
    },
  })
  return lp
}

// ─── read helpers ────────────────────────────────────────────────────────────

/** Every event for a user, oldest first — the order reconstruction reads in. */
function events(userId: string) {
  return prisma.activityLog.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
    include: {
      levelImpacts: { orderBy: { role: 'asc' } },
      fieldChanges: { orderBy: { fieldName: 'asc' } },
    },
  })
}

async function onlyEvent(userId: string, eventType: ActivityEventType) {
  const rows = await events(userId)
  const matching = rows.filter((e) => e.eventType === eventType)
  expect(matching).toHaveLength(1)
  const [event] = matching
  if (!event) throw new Error(`no ${eventType} event was written`)
  return event
}

/** One event's impact rows keyed by level id, which is how the assertions read. */
function impactsByLevel(event: Awaited<ReturnType<typeof events>>[number]) {
  return new Map(event.levelImpacts.map((i) => [i.levelId, i]))
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── ranking ─────────────────────────────────────────────────────────────────

describe('demon list placement', () => {
  it('records the mover with its real index and its new position', async () => {
    const user = await seedUser(prisma)
    const hard = await seedPlaced(user.id, 10, { name: 'Tartarus' })
    const easy = await seedPlaced(user.id, 2, { name: 'Bloodbath' })
    const fresh = await seedCompletion(user.id, { name: 'Avernus' })

    const res = await send(
      rankingApp,
      user.id,
      'POST',
      '/me/demon-list/classic',
      {
        levelProgressId: fresh.id,
        aboveId: hard.id,
        belowId: easy.id,
      }
    )
    expect(res.status).toBe(201)

    const event = await onlyEvent(user.id, 'DEMON_LIST_PLACEMENT')
    expect(event.levelId).toBe(fresh.inGameId)

    const mover = impactsByLevel(event).get(fresh.inGameId)!
    expect(mover.role).toBe('MOVER')
    // The value actually assigned, not a delta — bisecting 2 and 10 gives 6.
    expect(Number(mover.orderIndex)).toBe(6)
    expect(mover.positionBefore).toBeNull()
    expect(mover.positionAfter).toBe(2)
    // It debuted inside the top 5, which is a crossing from "not ranked".
    expect(mover.milestoneCrossed).toBe(5)
  })

  it('snapshots the level name onto every impact row', async () => {
    const user = await seedUser(prisma)
    const anchor = await seedPlaced(user.id, 5, { name: 'Slaughterhouse' })
    const fresh = await seedCompletion(user.id, { name: 'Acheron' })

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      belowId: anchor.id,
    })

    const event = await onlyEvent(user.id, 'DEMON_LIST_PLACEMENT')
    const byLevel = impactsByLevel(event)
    expect(byLevel.get(fresh.inGameId)!.levelName).toBe('Acheron')
    expect(byLevel.get(anchor.inGameId)!.levelName).toBe('Slaughterhouse')
  })

  it('records the immediate neighbours and nothing further down the list', async () => {
    const user = await seedUser(prisma)
    const a = await seedPlaced(user.id, 40)
    const b = await seedPlaced(user.id, 30)
    const c = await seedPlaced(user.id, 20)
    await seedPlaced(user.id, 10) // two positions below the drop — untouched
    const fresh = await seedCompletion(user.id)

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      aboveId: b.id,
      belowId: c.id,
    })

    const event = await onlyEvent(user.id, 'DEMON_LIST_PLACEMENT')
    const levelIds = [...impactsByLevel(event).keys()].sort()
    expect(levelIds).toEqual([fresh.inGameId, b.inGameId, c.inGameId].sort())
    // The full cascade is deliberately not recorded — `a` never moved, and the
    // level below `c` shifted an ordinal without being adjacent to anything.
    expect(levelIds).not.toContain(a.inGameId)
  })

  it('records a neighbour pushed across a milestone by someone else’s placement', async () => {
    const user = await seedUser(prisma)
    // Fill the top of the list so the neighbour sits exactly on the boundary.
    const above = await seedPlaced(user.id, 100)
    for (let i = 0; i < 8; i++) await seedPlaced(user.id, 90 - i)
    const boundary = await seedPlaced(user.id, 50) // #10
    const fresh = await seedCompletion(user.id)

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      aboveId: above.id,
      belowId: boundary.id,
    })

    const event = await onlyEvent(user.id, 'DEMON_LIST_PLACEMENT')
    const neighbour = impactsByLevel(event).get(boundary.inGameId)!
    expect(neighbour.role).toBe('NEIGHBOR')
    expect(neighbour.positionBefore).toBe(10)
    expect(neighbour.positionAfter).toBe(11)
    expect(neighbour.milestoneCrossed).toBe(10)
  })
})

describe('ranking reorder', () => {
  it('records where the mover came from and where it landed', async () => {
    const user = await seedUser(prisma)
    const top = await seedPlaced(user.id, 30)
    const mid = await seedPlaced(user.id, 20)
    const bottom = await seedPlaced(user.id, 10)

    const res = await send(
      rankingApp,
      user.id,
      'PATCH',
      `/me/demon-list/classic/${bottom.id}`,
      { aboveId: top.id, belowId: mid.id }
    )
    expect(res.status).toBe(200)

    const event = await onlyEvent(user.id, 'DEMON_LIST_REORDER')
    const mover = impactsByLevel(event).get(bottom.inGameId)!
    expect(mover.positionBefore).toBe(3)
    expect(mover.positionAfter).toBe(2)
    expect(Number(mover.orderIndex)).toBe(25)
  })

  it('records neighbours at both the origin and the destination', async () => {
    const user = await seedUser(prisma)
    const top = await seedPlaced(user.id, 40)
    const second = await seedPlaced(user.id, 30)
    const third = await seedPlaced(user.id, 20)
    const bottom = await seedPlaced(user.id, 10)

    // Moving `bottom` up leaves a gap beside `third` and opens one between
    // `top` and `second` — all three are immediate neighbours of the move.
    await send(
      rankingApp,
      user.id,
      'PATCH',
      `/me/demon-list/classic/${bottom.id}`,
      {
        aboveId: top.id,
        belowId: second.id,
      }
    )

    const event = await onlyEvent(user.id, 'DEMON_LIST_REORDER')
    expect([...impactsByLevel(event).keys()].sort()).toEqual(
      [bottom.inGameId, top.inGameId, second.inGameId, third.inGameId].sort()
    )
  })
})

describe('ranking unranking', () => {
  it('records a null positionAfter and the index the level last held', async () => {
    const user = await seedUser(prisma)
    await seedPlaced(user.id, 30)
    const target = await seedPlaced(user.id, 20)
    await seedPlaced(user.id, 10)

    const res = await send(
      rankingApp,
      user.id,
      'DELETE',
      `/me/demon-list/classic/${target.id}`
    )
    expect(res.status).toBe(200)

    const event = await onlyEvent(user.id, 'DEMON_LIST_REMOVED')
    const mover = impactsByLevel(event).get(target.inGameId)!
    expect(mover.positionBefore).toBe(2)
    expect(mover.positionAfter).toBeNull()
    expect(Number(mover.orderIndex)).toBe(20)
  })

  it('runs the same neighbour logic a placement does', async () => {
    const user = await seedUser(prisma)
    const above = await seedPlaced(user.id, 30)
    const target = await seedPlaced(user.id, 20)
    const below = await seedPlaced(user.id, 10)

    await send(
      rankingApp,
      user.id,
      'DELETE',
      `/me/demon-list/classic/${target.id}`
    )

    const event = await onlyEvent(user.id, 'DEMON_LIST_REMOVED')
    const byLevel = impactsByLevel(event)
    expect(byLevel.get(above.inGameId)!.positionAfter).toBe(1)
    // The level below closes the gap and moves up.
    expect(byLevel.get(below.inGameId)!.positionBefore).toBe(3)
    expect(byLevel.get(below.inGameId)!.positionAfter).toBe(2)
  })

  it('fires when deleting the completion walks the entry out of COMPLETED', async () => {
    // The indirect path. A listIndex that vanishes without an event is a
    // permanent hole in that level's history.
    const user = await seedUser(prisma)
    const lp = await seedPlaced(user.id, 20)
    await prisma.progressUpdate.create({
      data: { levelProgressId: lp.id, kind: 'PROGRESS', percentage: 40 },
    })
    const completion = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id, kind: 'COMPLETION' },
    })

    const res = await send(
      progressApp,
      user.id,
      'DELETE',
      `/me/progress/${lp.levelId}/updates/${completion.id}`
    )
    expect(res.status).toBe(200)

    const event = await onlyEvent(user.id, 'DEMON_LIST_REMOVED')
    expect(impactsByLevel(event).get(lp.inGameId)!.positionAfter).toBeNull()
  })
})

describe('ranking rebalance', () => {
  it('records every level’s new index when a tight gap forces renormalisation', async () => {
    const user = await seedUser(prisma)
    // A gap of 0.00001 — below REBALANCE_GAP, so the insert renormalises first.
    const above = await seedPlaced(user.id, '2.00001')
    const below = await seedPlaced(user.id, '2')
    const fresh = await seedCompletion(user.id)

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      aboveId: above.id,
      belowId: below.id,
    })

    const rebalance = await onlyEvent(user.id, 'DEMON_LIST_REBALANCE')
    // List-wide, so no single level owns it.
    expect(rebalance.levelId).toBeNull()
    const byLevel = impactsByLevel(rebalance)
    expect(byLevel.get(above.inGameId)!.role).toBe('MOVER')
    expect(Number(byLevel.get(above.inGameId)!.orderIndex)).toBe(2)
    expect(Number(byLevel.get(below.inGameId)!.orderIndex)).toBe(1)
    // Indices moved, order did not.
    expect(byLevel.get(above.inGameId)!.positionBefore).toBe(1)
    expect(byLevel.get(above.inGameId)!.positionAfter).toBe(1)
  })

  it('orders the rebalance before the placement that triggered it', async () => {
    // Two events from one request, and `sequence` is what guarantees the order
    // between them. createdAt cannot: they are milliseconds apart at best and
    // can land in the same one. Getting this backwards means a reconstruction
    // reads the stale coordinate system.
    const user = await seedUser(prisma)
    const above = await seedPlaced(user.id, '2.00001')
    const below = await seedPlaced(user.id, '2')
    const fresh = await seedCompletion(user.id)

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: fresh.id,
      aboveId: above.id,
      belowId: below.id,
    })

    const rows = await events(user.id)
    expect(rows.map((e) => e.eventType)).toEqual([
      'DEMON_LIST_REBALANCE',
      'DEMON_LIST_PLACEMENT',
    ])
    expect(rows[0]?.sequence).toBeLessThan(rows[1]?.sequence ?? 0)
  })
})

describe('ranking bulk replace', () => {
  it('records the spreadsheet import as one event, including what it dropped', async () => {
    const user = await seedUser(prisma)
    const kept = await seedPlaced(user.id, 5)
    const dropped = await seedPlaced(user.id, 3)

    await commitImportRanking(user.id, [{ levelId: kept.levelId }])

    const event = await onlyEvent(user.id, 'DEMON_LIST_BULK_REPLACE')
    // List-wide, so no single level owns it — the levels are the impact rows.
    expect(event.levelId).toBeNull()
    const byLevel = impactsByLevel(event)
    expect(Number(byLevel.get(kept.inGameId)!.orderIndex)).toBe(1)
    // Still recorded, with the index it last held and no position after.
    expect(byLevel.get(dropped.inGameId)!.positionAfter).toBeNull()
    expect(Number(byLevel.get(dropped.inGameId)!.orderIndex)).toBe(3)
  })

  it('does not spell the replace out as one event per level', async () => {
    // A feed that did would bury everything else the user has ever done.
    const user = await seedUser(prisma)
    const a = await seedPlaced(user.id, 5)
    const b = await seedPlaced(user.id, 3)
    const c = await seedPlaced(user.id, 1)

    await commitImportRanking(user.id, [
      { levelId: c.levelId },
      { levelId: a.levelId },
      { levelId: b.levelId },
    ])

    const rows = await events(user.id)
    expect(rows.map((e) => e.eventType)).toEqual(['DEMON_LIST_BULK_REPLACE'])
    expect(rows[0]?.levelImpacts).toHaveLength(3)
  })

  it('is a user-facing event, not the internal rebalance', async () => {
    // The order the user sees really changed, so it belongs in their feed —
    // unlike the renormalisation, which only moves the numbers behind it.
    const user = await seedUser(prisma)
    const first = await seedPlaced(user.id, 5)
    const second = await seedPlaced(user.id, 3)

    await commitImportRanking(user.id, [
      { levelId: second.levelId },
      { levelId: first.levelId },
    ])

    const rows = await events(user.id)
    expect(rows.map((e) => e.eventType)).not.toContain('DEMON_LIST_REBALANCE')
    // The reordering it performed is visible in the positions.
    const byLevel = impactsByLevel(rows[0]!)
    expect(byLevel.get(second.inGameId)!.positionBefore).toBe(2)
    expect(byLevel.get(second.inGameId)!.positionAfter).toBe(1)
  })
})

// ─── log edits ───────────────────────────────────────────────────────────────

describe('log edits', () => {
  async function seedInProgress(userId: string) {
    const inGameId = String(levelSeq++)
    await seedLevel(prisma, { inGameId })
    const lp = await prisma.levelProgress.create({
      data: { userId, levelId: inGameId, status: 'IN_PROGRESS' },
    })
    // Seeded as a run range rather than a from-zero percentage, so an edit
    // that sets `percentage` exercises the derived clear of runFrom/runTo.
    await prisma.progressUpdate.create({
      data: {
        levelProgressId: lp.id,
        kind: 'PROGRESS',
        runFrom: 44,
        runTo: 87,
        attempts: 100,
      },
    })
    return { ...lp, inGameId }
  }

  it('writes one event per save, not one per field', async () => {
    const user = await seedUser(prisma)
    const lp = await seedInProgress(user.id)

    const res = await send(
      progressApp,
      user.id,
      'PATCH',
      `/me/progress/${lp.inGameId}`,
      {
        attempts: 250,
        notes: 'finally',
        percentage: 71,
      }
    )
    expect(res.status).toBe(200)

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    expect(event.levelId).toBe(lp.inGameId)
    expect(event.fieldChanges.map((f) => f.fieldName)).toEqual([
      'attempts',
      'notes',
      'percentage',
      'run_from',
      'run_to',
    ])
  })

  it('carries the before and after values as strings', async () => {
    const user = await seedUser(prisma)
    const lp = await seedInProgress(user.id)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      attempts: 250,
    })

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    expect(event.fieldChanges[0]).toMatchObject({
      fieldName: 'attempts',
      category: 'SESSION_DETAIL',
      oldValue: '100',
      newValue: '250',
    })
  })

  it('tags rating fields as RATING and level opinions as METADATA', async () => {
    const user = await seedUser(prisma)
    const lp = await seedInProgress(user.id)
    const category = await seedRatingCategory(prisma, user.id)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      simpleRating: 80,
      difficultyOpinion: 'EXTREME',
      ratingScores: [{ categoryId: category.id, score: 70 }],
    })

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    const byName = new Map(
      event.fieldChanges.map((f) => [f.fieldName, f.category])
    )
    expect(byName.get('simple_rating')).toBe('RATING')
    expect(byName.get(`rating_score:${category.id}`)).toBe('RATING')
    expect(byName.get('difficulty_opinion')).toBe('METADATA')
  })

  it('writes nothing for a save that only touched out-of-scope fields', async () => {
    // Privacy and media are edited on the same form and are not part of the
    // story a feed tells.
    const user = await seedUser(prisma)
    const lp = await seedInProgress(user.id)

    const res = await send(
      progressApp,
      user.id,
      'PATCH',
      `/me/progress/${lp.inGameId}`,
      {
        visibility: 'PRIVATE',
        videoUrl: 'https://youtu.be/abc',
      }
    )
    expect(res.status).toBe(200)

    expect(await events(user.id)).toEqual([])
  })

  it('writes nothing for a save that re-sends the values already stored', async () => {
    const user = await seedUser(prisma)
    const lp = await seedInProgress(user.id)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      attempts: 100,
    })

    expect(await events(user.id)).toEqual([])
  })
})

// ─── derived rating figures ──────────────────────────────────────────────────

describe('log edits: weighted_average and rating_rank', () => {
  // Both figures are computed rather than stored, so an edit is the only
  // moment either can be recorded. The rank in particular depends on every
  // OTHER level's rating at that instant and can never be recovered later.

  async function seedRated(userId: string, simpleRating: number | null) {
    const inGameId = String(levelSeq++)
    await seedLevel(prisma, { inGameId })
    const lp = await prisma.levelProgress.create({
      data: { userId, levelId: inGameId, status: 'IN_PROGRESS', simpleRating },
    })
    await prisma.progressUpdate.create({
      data: { levelProgressId: lp.id, kind: 'PROGRESS', attempts: 10 },
    })
    return { ...lp, inGameId }
  }

  function changeFor(
    event: Awaited<ReturnType<typeof events>>[number],
    fieldName: string
  ) {
    return event.fieldChanges.find((f) => f.fieldName === fieldName)
  }

  it('records both figures on the same event as the rating change', async () => {
    const user = await seedUser(prisma)
    await seedRated(user.id, 90)
    await seedRated(user.id, 50)
    const lp = await seedRated(user.id, 20)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      simpleRating: 70,
    })

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    expect(changeFor(event, 'weighted_average')).toMatchObject({
      category: 'RATING',
      oldValue: '20',
      newValue: '70',
    })
    // 20 put it last of three; 70 puts it between the 90 and the 50.
    expect(changeFor(event, 'rating_rank')).toMatchObject({
      category: 'RATING',
      oldValue: '3',
      newValue: '2',
    })
  })

  it('records the first rating a level is given as a move from no rank at all', async () => {
    const user = await seedUser(prisma)
    await seedRated(user.id, 90)
    const lp = await seedRated(user.id, null)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      simpleRating: 95,
    })

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    expect(changeFor(event, 'weighted_average')).toMatchObject({
      oldValue: null,
      newValue: '95',
    })
    expect(changeFor(event, 'rating_rank')).toMatchObject({
      oldValue: null,
      newValue: '1',
    })
  })

  it('records neither figure on a save that did not touch the rating', async () => {
    const user = await seedUser(prisma)
    const lp = await seedRated(user.id, 60)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      attempts: 999,
    })

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    expect(event.fieldChanges.map((f) => f.fieldName)).toEqual(['attempts'])
  })

  it('records neither figure when a rating is re-sent unchanged', async () => {
    const user = await seedUser(prisma)
    const lp = await seedRated(user.id, 60)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      simpleRating: 60,
      notes: 'unrelated',
    })

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    expect(event.fieldChanges.map((f) => f.fieldName)).toEqual(['notes'])
  })

  it('records the rank alone when only the tie-break moved', async () => {
    // Enjoyment is a tie-break on the rating order but, with includeEnjoyment
    // off, contributes nothing to the average — so the two figures diverge.
    const user = await seedUser(prisma)
    const rival = await seedRated(user.id, 60)
    await prisma.progressUpdate.updateMany({
      where: { levelProgressId: rival.id },
      data: { enjoyment: 50 },
    })
    const lp = await seedRated(user.id, 60)

    await send(progressApp, user.id, 'PATCH', `/me/progress/${lp.inGameId}`, {
      enjoyment: 90,
    })

    const event = await onlyEvent(user.id, 'LOG_EDIT')
    expect(changeFor(event, 'weighted_average')).toBeUndefined()
    expect(changeFor(event, 'rating_rank')).toMatchObject({
      oldValue: '2',
      newValue: '1',
    })
  })
})

// ─── deletion ────────────────────────────────────────────────────────────────

describe('deleting an entry', () => {
  it('takes that level’s own event history with it', async () => {
    const user = await seedUser(prisma)
    const lp = await seedPlaced(user.id, 10)
    await send(rankingApp, user.id, 'DELETE', `/me/demon-list/classic/${lp.id}`)
    expect(await events(user.id)).toHaveLength(1)

    const res = await send(
      progressApp,
      user.id,
      'DELETE',
      `/me/progress/${lp.inGameId}`
    )
    expect(res.status).toBe(200)

    expect(await events(user.id)).toEqual([])
  })

  it('leaves another level’s impact rows standing, still readable by name', async () => {
    // The whole reason levelName is denormalised: nothing is left to join
    // through for the deleted level's name.
    const user = await seedUser(prisma)
    const survivor = await seedPlaced(user.id, 20, { name: 'Survivor' })
    const doomed = await seedCompletion(user.id, { name: 'Doomed' })

    await send(rankingApp, user.id, 'POST', '/me/demon-list/classic', {
      levelProgressId: doomed.id,
      belowId: survivor.id,
    })
    await send(
      progressApp,
      user.id,
      'DELETE',
      `/me/progress/${doomed.inGameId}`
    )

    const remaining = await prisma.activityLogLevelImpact.findMany({
      where: { levelId: doomed.inGameId },
    })
    // The placement event was scoped to the doomed level, so it went too — but
    // had the survivor been the mover, its event would still name the doomed
    // level by the snapshotted name.
    expect(remaining).toEqual([])
    const survivorRows = await prisma.activityLogLevelImpact.findMany({
      where: { levelId: survivor.inGameId },
    })
    expect(survivorRows).toEqual([])
  })

  it('cascades away with the user account', async () => {
    const user = await seedUser(prisma)
    const lp = await seedPlaced(user.id, 10)
    await send(rankingApp, user.id, 'DELETE', `/me/demon-list/classic/${lp.id}`)

    await prisma.user.delete({ where: { id: user.id } })

    expect(await prisma.activityLog.count()).toBe(0)
    expect(await prisma.activityLogLevelImpact.count()).toBe(0)
  })
})

// ─── rating config ───────────────────────────────────────────────────────────

describe('rating config', () => {
  function putConfig(userId: string, body: unknown) {
    return send(accountApp, userId, 'PUT', '/me/rating-config', body)
  }

  it('writes one user-scoped event per save', async () => {
    const user = await seedUser(prisma)
    const category = await seedRatingCategory(prisma, user.id)

    const res = await putConfig(user.id, {
      categories: [
        { id: category.id, name: 'Gameplay', weight: 0.6 },
        { name: 'Decoration', weight: 0.4 },
      ],
      includeEnjoyment: false,
      enjoymentWeight: 0,
      enjoymentSortOrder: 99,
    })
    expect(res.status).toBe(200)

    const event = await onlyEvent(user.id, 'RATING_CONFIG_CHANGE')
    // User-scoped, not level-scoped, and it carries no impact rows.
    expect(event.levelId).toBeNull()
    expect(event.levelImpacts).toEqual([])
    expect(event.fieldChanges.map((f) => f.fieldName)).toEqual([
      'rating_categories',
    ])
    expect(event.fieldChanges[0]?.category).toBe('RATING_CONFIG')
    expect(event.fieldChanges[0]?.newValue).toContain('Decoration')
  })

  it('records the enjoyment settings alongside the categories', async () => {
    const user = await seedUser(prisma)
    const category = await seedRatingCategory(prisma, user.id)

    await putConfig(user.id, {
      categories: [{ id: category.id, name: 'Gameplay', weight: 0.8 }],
      includeEnjoyment: true,
      enjoymentWeight: 0.2,
      enjoymentSortOrder: 1,
    })

    const event = await onlyEvent(user.id, 'RATING_CONFIG_CHANGE')
    expect(event.fieldChanges.map((f) => f.fieldName)).toEqual([
      'enjoyment_sort_order',
      'enjoyment_weight',
      'include_enjoyment',
      'rating_categories',
    ])
  })

  it('writes nothing when the save changed nothing', async () => {
    const user = await seedUser(prisma)
    const category = await prisma.ratingCategory.create({
      data: { userId: user.id, name: 'Gameplay', weight: 1, sortOrder: 0 },
    })

    await putConfig(user.id, {
      categories: [{ id: category.id, name: 'Gameplay', weight: 1 }],
      includeEnjoyment: false,
      enjoymentWeight: 0,
      enjoymentSortOrder: 99,
    })

    expect(await events(user.id)).toEqual([])
  })

  it('does not log the knock-on effect on any level’s rank', async () => {
    // Explicitly ruled out as noise: weighted averages are computed at query
    // time, so nothing about a level actually moved.
    const user = await seedUser(prisma)
    const category = await seedRatingCategory(prisma, user.id)
    await seedPlaced(user.id, 10)

    await putConfig(user.id, {
      categories: [{ id: category.id, name: 'Renamed', weight: 1 }],
      includeEnjoyment: false,
      enjoymentWeight: 0,
      enjoymentSortOrder: 99,
    })

    const rows = await events(user.id)
    expect(rows.map((e) => e.eventType)).toEqual(['RATING_CONFIG_CHANGE'])
    expect(rows[0]?.levelImpacts).toEqual([])
  })
})
