/**
 * Unit tests for weighted-rating configuration.
 *
 * PUT /me/rating-config replaces the whole config in one transaction, because
 * the weights-sum-to-1.00 invariant makes single-row edits unvalidatable. The
 * things worth pinning: ids in the body must belong to the caller (a foreign id
 * is rejected outright, not silently dropped), removing a category takes its
 * rating scores with it (and every `cat:` reference to it in the caller's saved
 * List presets), and sortOrder is written in two phases so final positions
 * never collide. Prisma is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import { buildApp, TEST_USER_ID } from '../../test/utils'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const ratingRoutes = (await import('./ratings')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const app = buildApp(ratingRoutes)

const CAT_A = 'aaaaaaaa-1111-2222-3333-444444444444'
const CAT_B = 'bbbbbbbb-1111-2222-3333-444444444444'

/** Prisma's Decimal-ish shape, which the serializers call toNumber() on. */
function decimal(value: number) {
  return { toNumber: () => value }
}

/** A valid config body: weights sum to exactly 1.00. */
function config(overrides: Record<string, unknown> = {}) {
  return {
    categories: [
      { id: CAT_A, name: 'Gameplay', weight: 0.5 },
      { id: CAT_B, name: 'Decoration', weight: 0.5 },
    ],
    includeEnjoyment: false,
    enjoymentWeight: 0,
    enjoymentSortOrder: 0,
    ...overrides,
  }
}

function putConfig(body: unknown) {
  return app.request('/me/rating-config', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Stubs the pre-write ownership read with the ids the user actually has.
 *
 * That read also feeds the RATING_CONFIG_CHANGE diff, so the rows carry
 * name/weight/sortOrder — a bare `{ id }` would make every save look like it
 * renamed every category.
 */
function userOwns(
  ...categories: Array<
    string | { id: string; name: string; weight: number; sortOrder: number }
  >
) {
  prisma.ratingCategory.findMany.mockResolvedValue(
    categories.map((c, idx) =>
      typeof c === 'string'
        ? { id: c, name: `Category ${idx}`, weight: 0, sortOrder: idx }
        : c
    ) as never
  )
}

/** The `data` of the emitted RATING_CONFIG_CHANGE, or null when none was. */
function configEventData(): Record<string, unknown> | null {
  const call = prisma.activityLog.create.mock.lastCall
  return call ? (call[0] as { data: Record<string, unknown> }).data : null
}

/** The `data` of each ratingCategory.update call, in call order. */
function updateCalls() {
  return prisma.ratingCategory.update.mock.calls.map(
    (call) =>
      call[0] as { where: { id: string }; data: Record<string, unknown> }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.ratingCategory.findMany.mockReset().mockResolvedValue([] as never)
  prisma.ratingCategory.update.mockReset()
  prisma.ratingCategory.create.mockReset()
  prisma.ratingCategory.deleteMany.mockReset()
  prisma.ratingScore.deleteMany.mockReset()
  prisma.listPreset.findMany.mockReset().mockResolvedValue([] as never)
  prisma.listPreset.update.mockReset()
  prisma.user.update.mockReset()
  prisma.$transaction.mockReset().mockResolvedValue([] as never)
  prisma.activityLog.create.mockReset()
  // The pre-write read of the user's enjoyment settings, which the
  // RATING_CONFIG_CHANGE diff compares against.
  prisma.user.findUniqueOrThrow.mockReset().mockResolvedValue({
    includeEnjoyment: false,
    enjoymentWeight: decimal(0),
    enjoymentSortOrder: 99,
  } as never)
  prisma.user.findFirst.mockReset().mockResolvedValue({
    id: TEST_USER_ID,
    enjoymentWeight: decimal(0),
    ratingCategories: [],
  } as never)
})

// ─── GET /me/rating-categories ───────────────────────────────────────────────

describe('GET /me/rating-categories', () => {
  it('returns the caller’s categories in sort order', async () => {
    prisma.ratingCategory.findMany.mockResolvedValue([
      { id: CAT_A, name: 'Gameplay', weight: decimal(0.6), sortOrder: 0 },
      { id: CAT_B, name: 'Decoration', weight: decimal(0.4), sortOrder: 1 },
    ] as never)

    const res = await app.request('/me/rating-categories')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: [
        { id: CAT_A, name: 'Gameplay', weight: 0.6, sortOrder: 0 },
        { id: CAT_B, name: 'Decoration', weight: 0.4, sortOrder: 1 },
      ],
    })
    expect(prisma.ratingCategory.findMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, weight: true, sortOrder: true },
    })
  })

  it('converts the Decimal weight to a plain number for the wire', async () => {
    prisma.ratingCategory.findMany.mockResolvedValue([
      { id: CAT_A, name: 'Gameplay', weight: decimal(0.35), sortOrder: 0 },
    ] as never)

    const body = (await (
      await app.request('/me/rating-categories')
    ).json()) as {
      data: { weight: unknown }[]
    }
    expect(body.data[0]!.weight).toBe(0.35)
  })

  it('passes a weight through when the driver already gave a number', async () => {
    // The row type allows either a Decimal or a plain number; the adapter
    // decides which, so both shapes have to serialize the same.
    prisma.ratingCategory.findMany.mockResolvedValue([
      { id: CAT_A, name: 'Gameplay', weight: 0.35, sortOrder: 0 },
    ] as never)

    const body = (await (
      await app.request('/me/rating-categories')
    ).json()) as {
      data: { weight: unknown }[]
    }
    expect(body.data[0]!.weight).toBe(0.35)
  })

  it('returns an empty array when none are configured', async () => {
    const res = await app.request('/me/rating-categories')

    await expect(res.json()).resolves.toEqual({ data: [] })
  })
})

// ─── PUT /me/rating-config: validation ───────────────────────────────────────

describe('PUT /me/rating-config — validation', () => {
  it.each([
    [
      'weights do not sum to 1.00',
      config({
        categories: [{ id: CAT_A, name: 'Gameplay', weight: 0.3 }],
      }),
    ],
    [
      'two categories share a name',
      config({
        categories: [
          { id: CAT_A, name: 'Gameplay', weight: 0.5 },
          { id: CAT_B, name: 'gameplay', weight: 0.5 },
        ],
      }),
    ],
    [
      'a name is blank',
      config({
        categories: [
          { id: CAT_A, name: '   ', weight: 0.5 },
          { id: CAT_B, name: 'Decoration', weight: 0.5 },
        ],
      }),
    ],
    [
      'a weight has more than two decimals',
      config({
        categories: [
          { id: CAT_A, name: 'Gameplay', weight: 0.555 },
          { id: CAT_B, name: 'Decoration', weight: 0.445 },
        ],
      }),
    ],
    ['the body is not a config at all', { nope: true }],
  ])('400s and writes nothing when %s', async (_label, body) => {
    const res = await putConfig(body)

    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('400s on an unparseable body rather than throwing', async () => {
    // Unlike the import check, the `{}` fallback is safe here: every field of
    // RatingConfigSchema is required, so an empty object fails validation.
    const res = await app.request('/me/rating-config', {
      method: 'PUT',
      body: '{oops',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('counts the enjoyment weight toward the sum when it is active', async () => {
    userOwns(CAT_A)

    const res = await putConfig(
      config({
        categories: [{ id: CAT_A, name: 'Gameplay', weight: 0.7 }],
        includeEnjoyment: true,
        enjoymentWeight: 0.3,
      })
    )

    expect(res.status).toBe(200)
  })

  it('ignores the enjoyment weight when it is inactive', async () => {
    // Weights already total 1.00 without it, so a stray value must not break.
    userOwns(CAT_A)

    const res = await putConfig(
      config({
        categories: [{ id: CAT_A, name: 'Gameplay', weight: 1 }],
        includeEnjoyment: false,
        enjoymentWeight: 0.5,
      })
    )

    expect(res.status).toBe(200)
  })
})

// ─── PUT /me/rating-config: ownership ────────────────────────────────────────

describe('PUT /me/rating-config — ownership', () => {
  it('404s when the body names a category the caller does not own', async () => {
    // Rejected outright rather than silently dropped, so a mistaken client
    // never quietly loses an edit.
    userOwns(CAT_A)

    const res = await putConfig(config())

    expect(res.status).toBe(404)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('accepts a body of brand-new categories with no ids', async () => {
    userOwns()

    const res = await putConfig(
      config({
        categories: [
          { name: 'Gameplay', weight: 0.5 },
          { name: 'Decoration', weight: 0.5 },
        ],
      })
    )

    expect(res.status).toBe(200)
    expect(prisma.ratingCategory.create).toHaveBeenCalledTimes(2)
  })
})

// ─── PUT /me/rating-config: the write ────────────────────────────────────────

describe('PUT /me/rating-config — applying the config', () => {
  it('parks sortOrder negative before writing final positions', async () => {
    // Phase 1 then phase 2, so two rows swapping positions never collide.
    userOwns(CAT_A, CAT_B)

    await putConfig(
      config({
        categories: [
          { id: CAT_B, name: 'Decoration', weight: 0.5 },
          { id: CAT_A, name: 'Gameplay', weight: 0.5 },
        ],
      })
    )

    const calls = updateCalls()
    expect(calls).toHaveLength(4)
    expect(calls.slice(0, 2).map((c) => c.data.sortOrder)).toEqual([-1, -2])
    expect(calls.slice(2)).toEqual([
      {
        where: { id: CAT_B },
        data: { name: 'Decoration', weight: 0.5, sortOrder: 0 },
      },
      {
        where: { id: CAT_A },
        data: { name: 'Gameplay', weight: 0.5, sortOrder: 1 },
      },
    ])
  })

  it('takes sortOrder from the body order, not the stored order', async () => {
    userOwns(CAT_A)

    await putConfig(
      config({
        categories: [
          { name: 'New First', weight: 0.5 },
          { id: CAT_A, name: 'Gameplay', weight: 0.5 },
        ],
      })
    )

    expect(prisma.ratingCategory.create).toHaveBeenCalledWith({
      data: {
        userId: TEST_USER_ID,
        name: 'New First',
        weight: 0.5,
        sortOrder: 0,
      },
    })
    const calls = updateCalls()
    expect(calls[calls.length - 1]!.data.sortOrder).toBe(1)
  })

  it('deletes a dropped category along with its rating scores', async () => {
    // The scores have to go first or the FK would block the delete.
    userOwns(CAT_A, CAT_B)

    await putConfig(
      config({ categories: [{ id: CAT_A, name: 'Gameplay', weight: 1 }] })
    )

    expect(prisma.ratingScore.deleteMany).toHaveBeenCalledWith({
      where: { categoryId: { in: [CAT_B] } },
    })
    expect(prisma.ratingCategory.deleteMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID, id: { in: [CAT_B] } },
    })
  })

  it('purges the dropped category out of the caller’s list presets', async () => {
    userOwns(CAT_A, CAT_B)
    prisma.listPreset.findMany.mockResolvedValue([
      {
        id: 'preset-1',
        sorts: [
          { key: `cat:${CAT_B}`, dir: 'desc' },
          { key: 'date', dir: 'desc' },
        ],
        filters: {
          statuses: [],
          categoryRatings: { [CAT_A]: [0, 100], [CAT_B]: [50, 100] },
        },
        columns: { date: true, [`cat:${CAT_A}`]: true, [`cat:${CAT_B}`]: true },
        columnOrder: ['date', `cat:${CAT_A}`, `cat:${CAT_B}`],
      },
    ] as never)

    await putConfig(
      config({ categories: [{ id: CAT_A, name: 'Gameplay', weight: 1 }] })
    )

    expect(prisma.listPreset.update).toHaveBeenCalledWith({
      where: { id: 'preset-1' },
      data: {
        sorts: [{ key: 'date', dir: 'desc' }],
        filters: { statuses: [], categoryRatings: { [CAT_A]: [0, 100] } },
        columns: { date: true, [`cat:${CAT_A}`]: true },
        columnOrder: ['date', `cat:${CAT_A}`],
      },
    })
  })

  it('leaves presets that never referenced the dropped category alone', async () => {
    userOwns(CAT_A, CAT_B)
    prisma.listPreset.findMany.mockResolvedValue([
      {
        id: 'preset-1',
        sorts: [{ key: 'date', dir: 'desc' }],
        filters: { categoryRatings: { [CAT_A]: [0, 100] } },
        columns: { date: true },
        columnOrder: ['date'],
      },
    ] as never)

    await putConfig(
      config({ categories: [{ id: CAT_A, name: 'Gameplay', weight: 1 }] })
    )

    expect(prisma.listPreset.update).not.toHaveBeenCalled()
  })

  it('issues no delete when nothing was dropped', async () => {
    userOwns(CAT_A, CAT_B)

    await putConfig(config())

    expect(prisma.ratingScore.deleteMany).not.toHaveBeenCalled()
    expect(prisma.ratingCategory.deleteMany).not.toHaveBeenCalled()
    // No categories dropped means the presets are never even read.
    expect(prisma.listPreset.findMany).not.toHaveBeenCalled()
  })

  it('persists the enjoyment settings onto the user', async () => {
    userOwns(CAT_A)

    await putConfig(
      config({
        categories: [{ id: CAT_A, name: 'Gameplay', weight: 0.6 }],
        includeEnjoyment: true,
        enjoymentWeight: 0.4,
        enjoymentSortOrder: 2,
      })
    )

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: TEST_USER_ID },
      data: {
        includeEnjoyment: true,
        enjoymentWeight: 0.4,
        enjoymentSortOrder: 2,
      },
    })
  })

  it('applies every change in a single transaction', async () => {
    userOwns(CAT_A, CAT_B)

    await putConfig(config())

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('returns the refreshed me payload with the ciphertext stripped', async () => {
    userOwns(CAT_A, CAT_B)
    prisma.user.findFirst.mockResolvedValue({
      id: TEST_USER_ID,
      enjoymentWeight: decimal(0),
      gddlApiKeyEncrypted: 'ciphertext-blob',
      ratingCategories: [
        { id: CAT_A, name: 'Gameplay', weight: decimal(0.5), sortOrder: 0 },
      ],
    } as never)

    const body = (await (await putConfig(config())).json()) as {
      data: Record<string, unknown>
    }

    expect(body.data).not.toHaveProperty('gddlApiKeyEncrypted')
    expect(body.data.hasGddlApiKey).toBe(true)
    expect(body.data.ratingCategories).toEqual([
      { id: CAT_A, name: 'Gameplay', weight: 0.5, sortOrder: 0 },
    ])
  })

  it('409s when the write hits the unique-name constraint', async () => {
    // The zod duplicate-name check can be bypassed by a direct API hit, so the
    // DB constraint is the real guarantee — and needs its own status.
    userOwns(CAT_A, CAT_B)
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      })
    )

    const res = await putConfig(config())

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({
      error: 'Category names must be unique',
    })
  })

  it('does not dress a non-unique write failure up as a 409', async () => {
    // Only P2002 is translated; anything else falls through to the module's
    // onError, which is what reports it and sends it to Sentry.
    userOwns(CAT_A, CAT_B)
    prisma.$transaction.mockRejectedValue(new Error('connection lost'))

    const res = await putConfig(config())

    expect(res.status).toBe(500)
  })
})

// ─── the config-change event ─────────────────────────────────────────────────

describe('PUT /me/rating-config — the RATING_CONFIG_CHANGE event', () => {
  it('writes one user-scoped event with no impact rows', async () => {
    userOwns({ id: CAT_A, name: 'Gameplay', weight: 1, sortOrder: 0 })

    await putConfig(
      config({
        categories: [
          { id: CAT_A, name: 'Gameplay', weight: 0.5 },
          { name: 'Song', weight: 0.5 },
        ],
      })
    )

    const data = configEventData()
    expect(data).toMatchObject({ eventType: 'RATING_CONFIG_CHANGE' })
    // Rating config is a property of the account, not of any one level.
    expect(data).not.toHaveProperty('levelId')
    expect(data).not.toHaveProperty('levelImpacts')
  })

  it('writes nothing when the save changed nothing', async () => {
    // An event with no field changes is a feed entry with nothing to say.
    userOwns({ id: CAT_A, name: 'Gameplay', weight: 1, sortOrder: 0 })

    await putConfig(
      config({
        categories: [{ id: CAT_A, name: 'Gameplay', weight: 1 }],
        // Matching the stubbed user, so nothing at all differs.
        enjoymentSortOrder: 99,
      })
    )

    expect(configEventData()).toBeNull()
  })

  it('does not fire when the request is rejected before the write', async () => {
    userOwns({ id: CAT_A, name: 'Gameplay', weight: 1, sortOrder: 0 })

    const res = await putConfig(
      config({ categories: [{ id: CAT_B, name: 'Gameplay', weight: 1 }] })
    )

    expect(res.status).toBe(404)
    expect(configEventData()).toBeNull()
  })
})
