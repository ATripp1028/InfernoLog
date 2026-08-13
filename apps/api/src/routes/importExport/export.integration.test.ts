/**
 * Integration tests for GET /me/export.
 *
 * The client drains every section to completion and stitches the spreadsheet
 * itself, so the contract that matters is that paging through a section yields
 * each row exactly once and `hasMore` goes false at the right point. That is a
 * property of the real offset queries and their ORDER BY — a mocked Prisma
 * returns whatever the stub says and can't get it wrong.
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

const { default: importExportApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchSection(
  userId: string,
  section: string,
  query = ''
): Promise<{ status: number; items: unknown[]; hasMore: boolean }> {
  const res = await buildApp(importExportApp, { userId }).request(
    `/me/export?section=${section}${query}`
  )
  const body = (await res.json()) as { items?: unknown[]; hasMore?: boolean }
  return {
    status: res.status,
    items: body.items ?? [],
    hasMore: body.hasMore ?? false,
  }
}

/** Seeds `count` completed levels for the user, ids '100'…. */
async function seedCompletions(userId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const levelId = String(100 + i)
    await seedLevel(prisma, { inGameId: levelId, name: `Level ${i}` })
    const lp = await prisma.levelProgress.create({
      data: { userId, levelId, status: 'COMPLETED' },
    })
    await prisma.progressUpdate.create({
      data: { levelProgressId: lp.id, kind: 'COMPLETION', attempts: i },
    })
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── sections ────────────────────────────────────────────────────────────────

describe('GET /me/export — sections', () => {
  it.each([
    'completions',
    'progress',
    'dropped',
    'ranking',
    'collections',
    'ratings',
    'categories',
  ])('serves the %s section for an empty account', async (section) => {
    const user = await seedUser(prisma)

    const { status, items, hasMore } = await fetchSection(user.id, section)

    expect(status).toBe(200)
    expect(items).toEqual([])
    expect(hasMore).toBe(false)
  })

  it('400s for an unknown section', async () => {
    const user = await seedUser(prisma)

    expect((await fetchSection(user.id, 'everything')).status).toBe(400)
  })

  it('exports the caller’s completions', async () => {
    const user = await seedUser(prisma)
    await seedCompletions(user.id, 2)

    const { items } = await fetchSection(user.id, 'completions')

    expect(items).toHaveLength(2)
  })

  it('does not leak another user’s rows', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedCompletions(other.id, 3)

    const { items } = await fetchSection(user.id, 'completions')

    expect(items).toEqual([])
  })

  it('reports categories as a single unpaginated page', async () => {
    // The categories section ignores offset/limit — it is always short.
    const user = await seedUser(prisma)
    await prisma.ratingCategory.createMany({
      data: [
        { userId: user.id, name: 'Gameplay', weight: 0.5, sortOrder: 0 },
        { userId: user.id, name: 'Decoration', weight: 0.5, sortOrder: 1 },
      ],
    })

    const { items, hasMore } = await fetchSection(user.id, 'categories', '&limit=1')

    expect(items).toHaveLength(2)
    expect(hasMore).toBe(false)
  })
})

// ─── draining a section ──────────────────────────────────────────────────────

describe('GET /me/export — pagination', () => {
  it('yields every row exactly once across pages', async () => {
    // The client stitches these together; a duplicated or skipped row would
    // corrupt the export silently.
    const user = await seedUser(prisma)
    await seedCompletions(user.id, 5)

    const seen: unknown[] = []
    let offset = 0
    for (;;) {
      const page = await fetchSection(
        user.id,
        'completions',
        `&offset=${offset}&limit=2`
      )
      seen.push(...page.items)
      if (!page.hasMore) break
      offset += 2
    }

    expect(seen).toHaveLength(5)
    const ids = seen.map((r) => (r as { levelId: string }).levelId)
    expect(new Set(ids).size).toBe(5)
  })

  it('reports hasMore only while a full page came back', async () => {
    const user = await seedUser(prisma)
    await seedCompletions(user.id, 3)

    expect((await fetchSection(user.id, 'completions', '&limit=2')).hasMore).toBe(
      true
    )
    expect(
      (await fetchSection(user.id, 'completions', '&offset=2&limit=2')).hasMore
    ).toBe(false)
  })

  it('returns an empty final page past the end', async () => {
    const user = await seedUser(prisma)
    await seedCompletions(user.id, 2)

    const { items, hasMore } = await fetchSection(
      user.id,
      'completions',
      '&offset=99&limit=10'
    )

    expect(items).toEqual([])
    expect(hasMore).toBe(false)
  })

  it('clamps a negative offset to the first page', async () => {
    const user = await seedUser(prisma)
    await seedCompletions(user.id, 2)

    const { status, items } = await fetchSection(
      user.id,
      'completions',
      '&offset=-5'
    )

    expect(status).toBe(200)
    expect(items).toHaveLength(2)
  })

  it('does not hand Postgres a NaN limit', async () => {
    // Prisma would throw deep in the query builder rather than answer.
    const user = await seedUser(prisma)
    await seedCompletions(user.id, 1)

    const { status, items } = await fetchSection(
      user.id,
      'completions',
      '&limit=abc&offset=xyz'
    )

    expect(status).toBe(200)
    expect(items).toHaveLength(1)
  })
})
