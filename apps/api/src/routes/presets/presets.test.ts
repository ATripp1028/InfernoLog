/**
 * Unit tests for list-preset CRUD.
 *
 * ListPreset.id is a bare UUID with no user scoping, so every by-id route has
 * to prove ownership before it touches the row — and report someone else's
 * preset as 404, not 403, so a stranger's id is indistinguishable from a
 * nonexistent one. That ownership gate is the bulk of what these tests pin.
 * Prisma is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
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

// Mounted through index.ts so the module's own onError handler is the one
// under test, not Hono's default.
const presetRoutes = (await import('./index')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const app = buildApp(presetRoutes)

const PRESET_ID = '11111111-2222-3333-4444-555555555555'
const OTHER_USER = 'user-999'

/** A well-formed create/replace body. */
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

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }),
  })
}

/** Stubs the ownership lookup with the given owner (or a missing row). */
function ownedBy(userId: string | null) {
  prisma.listPreset.findUnique.mockResolvedValue(
    userId === null ? null : ({ userId } as never)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.listPreset.findMany.mockReset().mockResolvedValue([] as never)
  prisma.listPreset.findUnique.mockReset()
  prisma.listPreset.create.mockReset().mockResolvedValue({ id: PRESET_ID } as never)
  prisma.listPreset.update.mockReset().mockResolvedValue({ id: PRESET_ID } as never)
  prisma.listPreset.delete.mockReset().mockResolvedValue({} as never)
})

// ─── GET ─────────────────────────────────────────────────────────────────────

describe('GET /me/list-presets', () => {
  it('returns the caller’s presets oldest-first', async () => {
    prisma.listPreset.findMany.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
    ] as never)

    const res = await send('GET', '/me/list-presets')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [{ id: 'a' }, { id: 'b' }] })
    expect(prisma.listPreset.findMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('returns an empty list rather than 404 when there are none', async () => {
    const res = await send('GET', '/me/list-presets')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [] })
  })
})

// ─── POST ────────────────────────────────────────────────────────────────────

describe('POST /me/list-presets', () => {
  it('creates the preset against the caller and 201s', async () => {
    const res = await send('POST', '/me/list-presets', validBody())

    expect(res.status).toBe(201)
    expect(prisma.listPreset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: TEST_USER_ID,
        name: 'My View',
        color: 'blue',
        hideTime: false,
      }),
    })
  })

  it('stores the four view-config blobs verbatim', async () => {
    // They are opaque to the API — no deep validation, no normalization.
    const sorts = [{ field: 'attempts', dir: 'asc', nested: { deep: true } }]
    await send('POST', '/me/list-presets', validBody({ sorts }))

    const { data } = prisma.listPreset.create.mock.lastCall![0] as {
      data: Record<string, unknown>
    }
    expect(data.sorts).toEqual(sorts)
  })

  it('defaults a missing description to null and hideTime to false', async () => {
    const body = validBody()
    delete (body as Record<string, unknown>).hideTime

    await send('POST', '/me/list-presets', body)

    expect(prisma.listPreset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ description: null, hideTime: false }),
    })
  })

  it.each([
    ['the name is empty', { name: '' }],
    ['the name is too long', { name: 'x'.repeat(51) }],
    ['the color is not a known preset colour', { color: 'chartreuse' }],
  ])('400s and writes nothing when %s', async (_label, overrides) => {
    const res = await send('POST', '/me/list-presets', validBody(overrides))

    expect(res.status).toBe(400)
    expect(prisma.listPreset.create).not.toHaveBeenCalled()
  })

  it('400s on a malformed JSON body instead of throwing', async () => {
    const res = await app.request('/me/list-presets', {
      method: 'POST',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
  })
})

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe('PATCH /me/list-presets/:id', () => {
  it('applies a partial update', async () => {
    ownedBy(TEST_USER_ID)

    const res = await send('PATCH', `/me/list-presets/${PRESET_ID}`, {
      name: 'Renamed',
    })

    expect(res.status).toBe(200)
    expect(prisma.listPreset.update).toHaveBeenCalledWith({
      where: { id: PRESET_ID },
      data: { name: 'Renamed' },
    })
  })

  it('omits fields the body left out rather than nulling them', async () => {
    // A partial update must not clear the blobs it says nothing about.
    ownedBy(TEST_USER_ID)

    await send('PATCH', `/me/list-presets/${PRESET_ID}`, { hideTime: true })

    const { data } = prisma.listPreset.update.mock.lastCall![0] as {
      data: Record<string, unknown>
    }
    expect(data).toEqual({ hideTime: true })
  })

  it('applies an explicit null description', async () => {
    ownedBy(TEST_USER_ID)

    await send('PATCH', `/me/list-presets/${PRESET_ID}`, { description: null })

    const { data } = prisma.listPreset.update.mock.lastCall![0] as {
      data: Record<string, unknown>
    }
    expect(data).toEqual({ description: null })
  })

  it('404s for another user’s preset, without updating it', async () => {
    ownedBy(OTHER_USER)

    const res = await send('PATCH', `/me/list-presets/${PRESET_ID}`, {
      name: 'Hijacked',
    })

    expect(res.status).toBe(404)
    expect(prisma.listPreset.update).not.toHaveBeenCalled()
  })

  it('404s for a preset that does not exist', async () => {
    ownedBy(null)

    const res = await send('PATCH', `/me/list-presets/${PRESET_ID}`, {
      name: 'Renamed',
    })

    expect(res.status).toBe(404)
  })

  it('checks ownership before validating the body', async () => {
    // Otherwise a 400 vs 404 difference would leak whether an id exists.
    ownedBy(OTHER_USER)

    const res = await send('PATCH', `/me/list-presets/${PRESET_ID}`, {
      name: '',
    })

    expect(res.status).toBe(404)
  })

  it('400s on an unparseable body rather than applying an empty update', async () => {
    // ListPresetUpdateSchema is a `.partial()`, so a `{}` fallback would be
    // valid — parseJsonBody rejects the unparseable body before that point.
    ownedBy(TEST_USER_ID)

    const res = await app.request(`/me/list-presets/${PRESET_ID}`, {
      method: 'PATCH',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
    expect(prisma.listPreset.update).not.toHaveBeenCalled()
  })

  it('400s on an invalid field for a preset the caller owns', async () => {
    ownedBy(TEST_USER_ID)

    const res = await send('PATCH', `/me/list-presets/${PRESET_ID}`, {
      color: 'chartreuse',
    })

    expect(res.status).toBe(400)
    expect(prisma.listPreset.update).not.toHaveBeenCalled()
  })
})

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe('DELETE /me/list-presets/:id', () => {
  it('deletes and returns 204 with no body', async () => {
    ownedBy(TEST_USER_ID)

    const res = await send('DELETE', `/me/list-presets/${PRESET_ID}`)

    expect(res.status).toBe(204)
    await expect(res.text()).resolves.toBe('')
    expect(prisma.listPreset.delete).toHaveBeenCalledWith({
      where: { id: PRESET_ID },
    })
  })

  it('404s for another user’s preset, without deleting it', async () => {
    ownedBy(OTHER_USER)

    const res = await send('DELETE', `/me/list-presets/${PRESET_ID}`)

    expect(res.status).toBe(404)
    expect(prisma.listPreset.delete).not.toHaveBeenCalled()
  })

  it('404s for a preset that does not exist', async () => {
    ownedBy(null)

    const res = await send('DELETE', `/me/list-presets/${PRESET_ID}`)

    expect(res.status).toBe(404)
    expect(prisma.listPreset.delete).not.toHaveBeenCalled()
  })
})
