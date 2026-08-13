/**
 * Integration tests for list-preset CRUD.
 *
 * Two things the mocked unit tests can't answer. First, the four view-config
 * fields are opaque JSON columns the API stores verbatim — whether an arbitrary
 * nested structure survives a Postgres round-trip unchanged is a property of
 * the column type, not of the handler. Second, the ownership gate reports
 * another user's preset as 404; that only means anything against real rows
 * belonging to two real users.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, getTestPrisma, truncateAll, seedUser } from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: presetsApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

function send(userId: string, method: string, path: string, body?: unknown) {
  return buildApp(presetsApp, { userId }).request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** A well-formed create body. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'My View',
    color: 'blue',
    sorts: [{ field: 'date', dir: 'desc' }],
    filters: { difficulty: ['extreme'] },
    columns: { date: true },
    columnOrder: ['date'],
    hideTime: false,
    ...overrides,
  }
}

/** Creates a preset directly, bypassing the route. */
async function seedPreset(userId: string, overrides: Record<string, unknown> = {}) {
  return prisma.listPreset.create({
    data: {
      userId,
      name: 'Seeded',
      color: 'red',
      sorts: [],
      filters: {},
      columns: {},
      columnOrder: [],
      ...overrides,
    },
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── create and read ─────────────────────────────────────────────────────────

describe('POST /me/list-presets', () => {
  it('persists a preset owned by the caller', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'POST', '/me/list-presets', validBody())

    expect(res.status).toBe(201)
    const stored = await prisma.listPreset.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(stored.name).toBe('My View')
    expect(stored.color).toBe('blue')
    expect(stored.hideTime).toBe(false)
  })

  it('round-trips an arbitrary nested view config unchanged', async () => {
    // The four config fields are opaque to the API — no validation, no
    // normalization — so whatever goes in has to come back identical.
    const user = await seedUser(prisma)
    const sorts = [
      { field: 'attempts', dir: 'asc', nested: { deep: [1, 2, { x: null }] } },
    ]
    const filters = { difficulty: ['extreme'], stars: { min: 1, max: 10 } }

    await send(user.id, 'POST', '/me/list-presets', validBody({ sorts, filters }))

    const res = await send(user.id, 'GET', '/me/list-presets')
    const body = (await res.json()) as {
      data: { sorts: unknown; filters: unknown }[]
    }
    expect(body.data[0]!.sorts).toEqual(sorts)
    expect(body.data[0]!.filters).toEqual(filters)
  })

  it('stores a null description when none is given', async () => {
    const user = await seedUser(prisma)

    await send(user.id, 'POST', '/me/list-presets', validBody())

    const stored = await prisma.listPreset.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(stored.description).toBeNull()
  })
})

describe('GET /me/list-presets', () => {
  it('returns the caller’s presets oldest first', async () => {
    const user = await seedUser(prisma)
    await seedPreset(user.id, { name: 'First' })
    await seedPreset(user.id, { name: 'Second' })

    const res = await send(user.id, 'GET', '/me/list-presets')
    const body = (await res.json()) as { data: { name: string }[] }

    expect(body.data.map((p) => p.name)).toEqual(['First', 'Second'])
  })

  it('does not return another user’s presets', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedPreset(other.id, { name: 'Theirs' })

    const res = await send(user.id, 'GET', '/me/list-presets')

    await expect(res.json()).resolves.toEqual({ data: [] })
  })
})

// ─── update ──────────────────────────────────────────────────────────────────

describe('PATCH /me/list-presets/:id', () => {
  it('applies a partial update and leaves the rest alone', async () => {
    const user = await seedUser(prisma)
    const preset = await seedPreset(user.id, {
      name: 'Original',
      sorts: [{ field: 'date' }],
    })

    const res = await send(user.id, 'PATCH', `/me/list-presets/${preset.id}`, {
      name: 'Renamed',
    })

    expect(res.status).toBe(200)
    const stored = await prisma.listPreset.findUniqueOrThrow({
      where: { id: preset.id },
    })
    expect(stored.name).toBe('Renamed')
    expect(stored.sorts).toEqual([{ field: 'date' }])
    expect(stored.color).toBe('red')
  })

  it('replaces a config blob wholesale rather than merging it', async () => {
    const user = await seedUser(prisma)
    const preset = await seedPreset(user.id, {
      filters: { difficulty: ['extreme'], stars: 10 },
    })

    await send(user.id, 'PATCH', `/me/list-presets/${preset.id}`, {
      filters: { length: ['long'] },
    })

    const stored = await prisma.listPreset.findUniqueOrThrow({
      where: { id: preset.id },
    })
    expect(stored.filters).toEqual({ length: ['long'] })
  })

  it('404s for another user’s preset and leaves it untouched', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const preset = await seedPreset(other.id, { name: 'Theirs' })

    const res = await send(user.id, 'PATCH', `/me/list-presets/${preset.id}`, {
      name: 'Hijacked',
    })

    expect(res.status).toBe(404)
    const stored = await prisma.listPreset.findUniqueOrThrow({
      where: { id: preset.id },
    })
    expect(stored.name).toBe('Theirs')
  })

  it('404s for an id that does not exist', async () => {
    const user = await seedUser(prisma)

    const res = await send(
      user.id,
      'PATCH',
      '/me/list-presets/11111111-2222-3333-4444-555555555555',
      { name: 'Renamed' }
    )

    expect(res.status).toBe(404)
  })
})

// ─── delete ──────────────────────────────────────────────────────────────────

describe('DELETE /me/list-presets/:id', () => {
  it('removes the row and returns 204', async () => {
    const user = await seedUser(prisma)
    const preset = await seedPreset(user.id)

    const res = await send(user.id, 'DELETE', `/me/list-presets/${preset.id}`)

    expect(res.status).toBe(204)
    expect(
      await prisma.listPreset.findUnique({ where: { id: preset.id } })
    ).toBeNull()
  })

  it('404s for another user’s preset and leaves it in place', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const preset = await seedPreset(other.id)

    const res = await send(user.id, 'DELETE', `/me/list-presets/${preset.id}`)

    expect(res.status).toBe(404)
    expect(
      await prisma.listPreset.findUnique({ where: { id: preset.id } })
    ).not.toBeNull()
  })

  it('cascades away when the owner deletes their account', async () => {
    const user = await seedUser(prisma)
    await seedPreset(user.id)

    await prisma.user.delete({ where: { id: user.id } })

    expect(await prisma.listPreset.count({ where: { userId: user.id } })).toBe(0)
  })
})
