/**
 * Integration tests for the import + export services. All Prisma calls hit the
 * local test database (started by globalSetup). Name resolution (RobTop) and
 * GDDL autofill are mocked, and every row uses a level_id, so the tests run
 * without network access.
 *
 * The flagship test is a full round-trip: import → export → reconstruct import
 * rows from that export → reimport into a second account → export again, and
 * assert the two exports are equivalent. The rest pin the trickier per-service
 * semantics (overwrite-merge, per-list/ranking replace, category creation).
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { getTestPrisma, seedUser, seedLevel, truncateAll } from '../test/utils'
import { Device, DifficultyOpinion, EntryVisibility } from '@infernolog/core'
import type {
  ImportCommitRow,
  ImportRankingEntry,
  ImportCollectionEntry,
  ImportRatingEntry,
  ExportResponse,
} from '@infernolog/core'

vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// No network: name search returns nothing (tests use level_ids) and GDDL
// autofill is a no-op.
vi.mock('../utils/robtop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/robtop')>()
  return { ...actual, searchRobtopByName: vi.fn(async () => []) }
})
vi.mock('../utils/gddl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/gddl')>()
  return { ...actual, fetchGddlTier: vi.fn(async () => null) }
})

const { commitImportBatch } = await import('./import')
const { commitImportRanking } = await import('./importRanking')
const { commitImportCollections } = await import('./importCollections')
const { commitImportRatings } = await import('./importRatings')
const { exportSection } = await import('./exportData')

const prisma = getTestPrisma()

// Assemble a full ExportResponse from the paginated section endpoint, using a
// deliberately tiny page size so the tests also exercise multi-page pagination
// (offset advancement, hasMore, ranking's rank offset).
async function fullExport(userId: string): Promise<ExportResponse> {
  const PAGE = 2
  const all = async (section: Parameters<typeof exportSection>[1]) => {
    const items: unknown[] = []
    let offset = 0
    for (;;) {
      const page = await exportSection(userId, section, offset, PAGE)
      items.push(...page.items)
      if (!page.hasMore) break
      offset += PAGE
    }
    return items
  }
  const categories = await exportSection(userId, 'categories', 0, 1000)
  return {
    completions: (await all('completions')) as ExportResponse['completions'],
    progress: (await all('progress')) as ExportResponse['progress'],
    dropped: (await all('dropped')) as ExportResponse['dropped'],
    ranking: (await all('ranking')) as ExportResponse['ranking'],
    collections: (await all('collections')) as ExportResponse['collections'],
    ratings: (await all('ratings')) as ExportResponse['ratings'],
    ratingCategories: categories.items as string[],
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// Seed the three levels the tests reference. Level 100 has user coins so its
// coinsCollected survives the server-side coin gate.
async function seedLevels() {
  await seedLevel(prisma, {
    inGameId: '100',
    name: 'Bloodbath',
    creator: 'Riot',
    inGameDifficulty: 'Extreme Demon',
    isDemon: true,
  })
  await prisma.level.update({ where: { inGameId: '100' }, data: { coins: 3 } })
  await seedLevel(prisma, {
    inGameId: '200',
    name: 'Cataclysm',
    creator: 'Ggb0y',
    inGameDifficulty: 'Extreme Demon',
    isDemon: true,
  })
  await seedLevel(prisma, {
    inGameId: '300',
    name: 'Future Funk',
    creator: 'Serponge',
    inGameDifficulty: 'Insane Demon',
    isDemon: true,
  })
}

// A representative account: two completions (one richly populated), one drop.
function completionRows(): ImportCommitRow[] {
  return [
    {
      type: 'completion',
      rowIndex: 0,
      data: {
        levelId: '100',
        date: '2024-12-25',
        attempts: 5000,
        percentage: 99,
        runFrom: 40,
        runTo: 100,
        onStream: true,
        fps: 360,
        device: Device.PC,
        enjoyment: 9, // 0-10 on the wire → stored 90
        difficultyOpinion: DifficultyOpinion.EXTREME,
        coinsCollected: 5, // coins 1 + 3
        visibility: EntryVisibility.PRIVATE,
        notes: 'clutch ending',
        levelNotes: 'overall a great level',
        videoUrl: 'https://youtube.com/watch?v=abc',
        userGddlTier: 24,
        // Historical: this level was dropped once, long before it was beaten.
        droppedAt: '2024-06-01',
        droppedReason: 'too hard at the time',
        attemptsAtDrop: 500,
      },
    },
    {
      type: 'completion',
      rowIndex: 1,
      data: {
        levelId: '200',
        date: '2024-11-01',
        attempts: 2000,
        enjoyment: 8,
      },
    },
    {
      type: 'dropped',
      rowIndex: 100000,
      data: {
        levelId: '300',
        bestProgress: 40,
        droppedAt: '2024-10-01',
        reason: 'shelved',
      },
    },
  ]
}

// Non-completion session logs: an early session on the level that was later
// completed, and one on the level that was later dropped.
function progressRows(): ImportCommitRow[] {
  return [
    {
      type: 'progress',
      rowIndex: 200000,
      data: {
        levelId: '100',
        date: '2024-12-01',
        attempts: 1000,
        percentage: 40,
        enjoyment: 6,
        notes: 'early session',
      },
    },
    {
      type: 'progress',
      rowIndex: 200001,
      data: {
        levelId: '300',
        date: '2024-09-15',
        runFrom: 10,
        runTo: 35,
        attempts: 500,
      },
    },
  ]
}

// Import a full account for `userId` (completions/drops/progress → ranking → lists → ratings).
async function importFullAccount(userId: string) {
  await commitImportBatch(userId, randomUUID(), [
    ...completionRows(),
    ...progressRows(),
  ])
  await commitImportRanking(userId, [
    { levelId: '200' },
    { levelId: '100' },
  ] satisfies ImportRankingEntry[])
  await commitImportCollections(userId, [
    { list: 'want_to_beat', levelId: '300', position: 1 },
    { list: 'favorites', levelId: '100', position: 1 },
    { list: 'My List', levelId: '200', position: 1 },
  ] satisfies ImportCollectionEntry[])
  await commitImportRatings(userId, [
    { levelId: '100', scores: { Gameplay: 80, Decoration: 90 } },
    { levelId: '200', scores: { Gameplay: 70 } },
  ] satisfies ImportRatingEntry[])
}

// Reconstruct import rows from an export, mirroring what the client does — the
// only scale change is enjoyment/simpleRating (0-100 export → 0-10 wire).
function completionRowsFromExport(exp: ExportResponse): ImportCommitRow[] {
  const completions: ImportCommitRow[] = exp.completions.map((c, i) => ({
    type: 'completion',
    rowIndex: i,
    data: {
      levelId: c.levelId,
      date: c.date,
      dateUncertain: c.dateUncertain,
      attempts: c.attempts,
      percentage: c.percentage,
      runFrom: c.runFrom,
      runTo: c.runTo,
      onStream: c.onStream,
      fps: c.fps,
      device: c.device as Device | null,
      enjoyment: c.enjoyment == null ? null : c.enjoyment / 10,
      simpleRating: c.simpleRating == null ? null : c.simpleRating / 10,
      difficultyOpinion: c.difficultyOpinion as DifficultyOpinion | null,
      difficultyOpinionStars: c.difficultyOpinionStars,
      coinsCollected: c.coinsCollected,
      twoPlayerSolo: c.twoPlayerSolo,
      twoPlayerPartner: c.twoPlayerPartner,
      visibility: c.visibility as EntryVisibility,
      notes: c.notes,
      levelNotes: c.levelNotes,
      userGddlTier: c.userGddlTier,
      videoUrl: c.videoUrl,
      highlightUrl: c.highlightUrl,
      droppedAt: c.droppedAt,
      droppedReason: c.droppedReason,
      attemptsAtDrop: c.attemptsAtDrop,
    },
  }))
  const drops: ImportCommitRow[] = exp.dropped.map((d, i) => ({
    type: 'dropped',
    rowIndex: 100000 + i,
    data: {
      levelId: d.levelId,
      bestProgress: d.bestProgress,
      attemptsAtDrop: d.attemptsAtDrop,
      droppedAt: d.droppedAt,
      reason: d.reason,
    },
  }))
  const progress: ImportCommitRow[] = exp.progress.map((p, i) => ({
    type: 'progress',
    rowIndex: 200000 + i,
    data: {
      // Carried through like a real client would — under a fresh account this
      // id belongs to no one, so it exercises the "unmatched → create" path.
      progressId: p.progressId,
      levelId: p.levelId,
      date: p.date,
      dateUncertain: p.dateUncertain,
      attempts: p.attempts,
      percentage: p.percentage,
      runFrom: p.runFrom,
      runTo: p.runTo,
      onStream: p.onStream,
      fps: p.fps,
      device: p.device as Device | null,
      enjoyment: p.enjoyment == null ? null : p.enjoyment / 10,
      notes: p.notes,
      highlightUrl: p.highlightUrl,
      visibility: p.visibility as EntryVisibility,
    },
  }))
  return [...completions, ...drops, ...progress]
}

// Order-independent projection for comparing two exports.
function normalize(exp: ExportResponse) {
  const byLevel = <T extends { levelId: string }>(a: T, b: T) =>
    a.levelId.localeCompare(b.levelId)
  return {
    completions: [...exp.completions].sort(byLevel),
    // progressId is minted fresh per account, so it's excluded from the
    // equivalence check; sort by level then percentage for a stable order.
    progress: [...exp.progress]
      .map((p) => ({
        levelId: p.levelId,
        levelName: p.levelName,
        creator: p.creator,
        date: p.date,
        dateUncertain: p.dateUncertain,
        attempts: p.attempts,
        percentage: p.percentage,
        runFrom: p.runFrom,
        runTo: p.runTo,
        onStream: p.onStream,
        fps: p.fps,
        device: p.device,
        enjoyment: p.enjoyment,
        notes: p.notes,
        highlightUrl: p.highlightUrl,
        visibility: p.visibility,
      }))
      .sort(
        (a, b) =>
          a.levelId.localeCompare(b.levelId) ||
          (a.percentage ?? -1) - (b.percentage ?? -1)
      ),
    dropped: [...exp.dropped].sort(byLevel),
    ranking: exp.ranking.map((r) => r.levelId), // order matters
    collections: [...exp.collections].sort(
      (a, b) =>
        a.list.localeCompare(b.list) || a.levelId.localeCompare(b.levelId)
    ),
    ratingCategories: [...exp.ratingCategories].sort(),
    ratings: [...exp.ratings].sort(byLevel),
  }
}

describe('import → export round-trip', () => {
  it('reproduces an equivalent export after reimporting into a fresh account', async () => {
    await seedLevels()
    const userA = await seedUser(prisma)
    await importFullAccount(userA.id)
    const expA = await fullExport(userA.id)

    // Sanity: the export reflects what was imported.
    expect(expA.completions).toHaveLength(2)
    expect(expA.progress).toHaveLength(2)
    expect(expA.progress.find((p) => p.levelId === '100')!.percentage).toBe(40)
    expect(expA.dropped.map((d) => d.levelId)).toEqual(['300'])
    expect(expA.ranking.map((r) => r.rank)).toEqual([1, 2])
    expect(expA.ranking.map((r) => r.levelId)).toEqual(['200', '100']) // hardest first
    const bb = expA.completions.find((c) => c.levelId === '100')!
    expect(bb.enjoyment).toBe(90) // stored internal 0-100
    expect(bb.percentage).toBe(99)
    expect(bb.coinsCollected).toBe(5)
    expect(bb.visibility).toBe('PRIVATE')
    expect(bb.userGddlTier).toBe(24)
    // Drop history survives past completion — same LevelProgress row.
    expect(bb.droppedAt).toBe('2024-06-01')
    expect(bb.droppedReason).toBe('too hard at the time')
    expect(bb.attemptsAtDrop).toBe(500)
    expect(expA.ratings.find((r) => r.levelId === '100')!.scores).toEqual({
      Gameplay: 80,
      Decoration: 90,
    })

    // Round-trip: reconstruct import rows from the export, load a fresh account.
    const userB = await seedUser(prisma)
    await commitImportBatch(
      userB.id,
      randomUUID(),
      completionRowsFromExport(expA)
    )
    await commitImportRanking(
      userB.id,
      expA.ranking.map((r) => ({ levelId: r.levelId }))
    )
    await commitImportCollections(
      userB.id,
      expA.collections.map((l) => ({
        list: l.list,
        levelId: l.levelId,
        position: l.position,
      }))
    )
    await commitImportRatings(
      userB.id,
      expA.ratings.map((r) => ({ levelId: r.levelId, scores: r.scores }))
    )
    const expB = await fullExport(userB.id)

    expect(normalize(expB)).toEqual(normalize(expA))
  })
})

describe('commitImportBatch — overwrite merge', () => {
  it('only overwrites provided fields and never wipes category ratings', async () => {
    await seedLevels()
    const user = await seedUser(prisma)
    await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'completion',
        rowIndex: 0,
        data: { levelId: '100', attempts: 1000, enjoyment: 7, notes: 'first' },
      },
    ])
    await commitImportRatings(user.id, [
      { levelId: '100', scores: { Gameplay: 80 } },
    ])

    // Re-import with overwrite, providing only attempts.
    await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'completion',
        rowIndex: 0,
        data: { levelId: '100', attempts: 4200 },
        conflictResolution: 'overwrite',
      },
    ])

    const exp = await fullExport(user.id)
    const c = exp.completions.find((x) => x.levelId === '100')!
    expect(c.attempts).toBe(4200) // overwritten
    expect(c.enjoyment).toBe(70) // untouched (not in the overwrite row)
    expect(c.notes).toBe('first') // untouched
    // Category rating survives the overwrite entirely.
    expect(exp.ratings.find((r) => r.levelId === '100')!.scores).toEqual({
      Gameplay: 80,
    })
  })

  it('skips an existing completion when resolution is not overwrite', async () => {
    await seedLevels()
    const user = await seedUser(prisma)
    await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'completion',
        rowIndex: 0,
        data: { levelId: '100', attempts: 1000 },
      },
    ])
    const res = await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'completion',
        rowIndex: 0,
        data: { levelId: '100', attempts: 9999 },
      },
    ])
    expect(res.outcomes[0]?.status).toBe('skipped')
    const exp = await fullExport(user.id)
    expect(exp.completions.find((x) => x.levelId === '100')!.attempts).toBe(
      1000
    )
  })
})

describe('commitImportBatch — progress rows', () => {
  it('creates additive session logs without touching level status', async () => {
    await seedLevels()
    const user = await seedUser(prisma)

    // Drop level 300 first, then import two progress rows against it.
    await commitImportBatch(user.id, randomUUID(), [
      { type: 'dropped', rowIndex: 100000, data: { levelId: '300' } },
      {
        type: 'progress',
        rowIndex: 200000,
        data: { levelId: '300', attempts: 100, percentage: 20 },
      },
      {
        type: 'progress',
        rowIndex: 200001,
        data: { levelId: '300', attempts: 300, percentage: 45 },
      },
    ])

    const exp = await fullExport(user.id)
    // Two independent session logs — not deduped/merged like completions.
    expect(exp.progress.filter((p) => p.levelId === '300')).toHaveLength(2)
    // Historical progress rows must not un-drop the level.
    expect(exp.dropped.map((d) => d.levelId)).toEqual(['300'])
  })

  it('creates an IN_PROGRESS-only level from a progress row alone', async () => {
    await seedLevels()
    const user = await seedUser(prisma)

    await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'progress',
        rowIndex: 200000,
        data: { levelId: '200', attempts: 50, percentage: 15 },
      },
    ])

    const exp = await fullExport(user.id)
    expect(exp.progress.map((p) => p.levelId)).toEqual(['200'])
    expect(exp.completions).toHaveLength(0)
    expect(exp.dropped).toHaveLength(0)
  })

  it('updates an existing entry in place when progress_id matches, and falls back to create otherwise', async () => {
    await seedLevels()
    const user = await seedUser(prisma)

    await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'progress',
        rowIndex: 200000,
        data: { levelId: '100', attempts: 100, percentage: 20, notes: 'v1' },
      },
    ])
    const firstId = (await fullExport(user.id)).progress[0]!.progressId

    // Re-import with the matching progress_id: merges in place (one entry).
    const res = await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'progress',
        rowIndex: 200000,
        data: { levelId: '100', progressId: firstId, attempts: 250 },
      },
    ])
    expect(res.outcomes[0]?.status).toBe('updated')
    let exp = await fullExport(user.id)
    expect(exp.progress).toHaveLength(1)
    expect(exp.progress[0]!.attempts).toBe(250)
    expect(exp.progress[0]!.percentage).toBe(20) // untouched — not in the merge row
    expect(exp.progress[0]!.notes).toBe('v1') // untouched

    // A progress_id that doesn't resolve to one of this user's entries for
    // this level (foreign/stale/wrong-level) creates a new entry instead of
    // silently failing or attaching to the wrong data.
    await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'progress',
        rowIndex: 200001,
        data: {
          levelId: '100',
          progressId: randomUUID(),
          attempts: 999,
          percentage: 80,
        },
      },
    ])
    exp = await fullExport(user.id)
    expect(exp.progress).toHaveLength(2)
  })
})

describe('commitImportRanking', () => {
  it('replaces the ranking and skips levels that are not completed', async () => {
    await seedLevels()
    const user = await seedUser(prisma)
    await commitImportBatch(user.id, randomUUID(), [
      { type: 'completion', rowIndex: 0, data: { levelId: '100' } },
      { type: 'completion', rowIndex: 1, data: { levelId: '200' } },
    ])

    await commitImportRanking(user.id, [{ levelId: '100' }, { levelId: '200' }])
    let exp = await fullExport(user.id)
    expect(exp.ranking.map((r) => r.levelId)).toEqual(['100', '200'])

    // Re-rank (reversed) + a non-completed level → replace + skip.
    const res = await commitImportRanking(user.id, [
      { levelId: '200' },
      { levelId: '100' },
      { levelId: '300' }, // dropped/never completed
    ])
    expect(res.placed).toBe(2)
    expect(res.skipped).toHaveLength(1)
    exp = await fullExport(user.id)
    expect(exp.ranking.map((r) => r.levelId)).toEqual(['200', '100'])
  })
})

describe('commitImportCollections', () => {
  it('resolves reserved + custom lists and replaces membership per list', async () => {
    await seedLevels()
    const user = await seedUser(prisma)

    await commitImportCollections(user.id, [
      { list: 'favorites', levelId: '100', position: 1 },
      { list: 'favorites', levelId: '200', position: 2 },
      { list: 'My List', levelId: '300', position: 1 },
    ])
    let exp = await fullExport(user.id)
    expect(
      exp.collections
        .filter((l) => l.list === 'favorites')
        .map((l) => l.levelId)
    ).toEqual(['100', '200'])
    expect(
      exp.collections.filter((l) => l.list === 'My List').map((l) => l.levelId)
    ).toEqual(['300'])

    // Replace favorites; leave the custom list alone (not mentioned).
    await commitImportCollections(user.id, [
      { list: 'favorites', levelId: '300', position: 1 },
    ])
    exp = await fullExport(user.id)
    expect(
      exp.collections
        .filter((l) => l.list === 'favorites')
        .map((l) => l.levelId)
    ).toEqual(['300'])
    expect(
      exp.collections.filter((l) => l.list === 'My List').map((l) => l.levelId)
    ).toEqual(['300'])
  })
})

describe('commitImportRatings', () => {
  it('creates missing categories and merges scores without wiping others', async () => {
    await seedLevels()
    const user = await seedUser(prisma)
    await commitImportBatch(user.id, randomUUID(), [
      { type: 'completion', rowIndex: 0, data: { levelId: '100' } },
    ])

    const res = await commitImportRatings(user.id, [
      { levelId: '100', scores: { Gameplay: 80, Decoration: 90 } },
    ])
    expect(res.scored).toBe(2)
    expect(res.categoriesCreated.sort()).toEqual(['Decoration', 'Gameplay'])

    // Merge: update Gameplay, add Song, leave Decoration untouched.
    await commitImportRatings(user.id, [
      { levelId: '100', scores: { Gameplay: 60, Song: 50 } },
    ])
    const exp = await fullExport(user.id)
    expect(exp.ratings.find((r) => r.levelId === '100')!.scores).toEqual({
      Gameplay: 60,
      Decoration: 90,
      Song: 50,
    })
  })

  it('skips ratings for a level that is not completed', async () => {
    await seedLevels()
    const user = await seedUser(prisma)
    // 300 is only dropped, never completed.
    await commitImportBatch(user.id, randomUUID(), [
      {
        type: 'dropped',
        rowIndex: 100000,
        data: { levelId: '300', bestProgress: 20 },
      },
    ])
    const res = await commitImportRatings(user.id, [
      { levelId: '300', scores: { Gameplay: 80 } },
    ])
    expect(res.scored).toBe(0)
    expect(res.skipped).toHaveLength(1)
  })
})
