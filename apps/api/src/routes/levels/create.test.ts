/**
 * Unit tests for manual level creation.
 *
 * This is the fallback when GD can't supply a level, so the row it writes is
 * explicitly marked `manual` / unverified — that's what lets the sync worker
 * later upgrade it rather than treating it as authoritative. `inGameId` is the
 * primary key, so a duplicate is an ordinary user-facing case (someone already
 * added it) and must read as 409, not a 500. Prisma is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import { buildApp } from '../../test/utils'

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

const createRoutes = (await import('./create')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const app = buildApp(createRoutes)

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    inGameId: '12345',
    name: 'DeathMoon',
    creator: 'Riot',
    difficulty: 'Extreme Demon',
    ...overrides,
  }
}

function post(body: unknown) {
  return app.request('/levels', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The `data` of the single level.create call. */
function createData(): Record<string, unknown> {
  return (prisma.level.create.mock.lastCall?.[0] as { data: Record<string, unknown> })
    .data
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.level.create.mockReset().mockResolvedValue({ inGameId: '12345' } as never)
})

// ─── success ─────────────────────────────────────────────────────────────────

describe('POST /levels', () => {
  it('creates the level and 201s', async () => {
    const res = await post(validBody())

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ data: { inGameId: '12345' } })
  })

  it('marks the row manual and unverified so sync can upgrade it later', async () => {
    const res = await post(validBody())

    expect(res.status).toBe(201)
    expect(createData()).toMatchObject({
      dataSource: 'manual',
      verified: false,
    })
  })

  it('maps difficulty onto the inGameDifficulty column', async () => {
    await post(validBody())

    expect(createData()).toMatchObject({
      inGameId: '12345',
      name: 'DeathMoon',
      creator: 'Riot',
      inGameDifficulty: 'Extreme Demon',
    })
  })

  it('defaults the optional flags rather than writing undefined', async () => {
    await post(validBody())

    expect(createData()).toMatchObject({
      isDemon: false,
      isRated: false,
      length: null,
      songName: null,
      songAuthor: null,
    })
  })

  it('carries the optional fields through when supplied', async () => {
    await post(
      validBody({
        isDemon: true,
        isRated: true,
        length: 'Long',
        songName: 'At the Speed of Light',
        songAuthor: 'Dimrain47',
      })
    )

    expect(createData()).toMatchObject({
      isDemon: true,
      isRated: true,
      length: 'Long',
      songName: 'At the Speed of Light',
      songAuthor: 'Dimrain47',
    })
  })
})

// ─── rejections ──────────────────────────────────────────────────────────────

describe('POST /levels — rejections', () => {
  it('400s and writes nothing when the id is not numeric', async () => {
    const res = await post(validBody({ inGameId: 'abc' }))

    expect(res.status).toBe(400)
    expect(prisma.level.create).not.toHaveBeenCalled()
  })

  it('400s and writes nothing when a required field is missing', async () => {
    const body = validBody()
    delete (body as Record<string, unknown>).name

    const res = await post(body)

    expect(res.status).toBe(400)
    expect(prisma.level.create).not.toHaveBeenCalled()
  })

  it('400s on an unparseable body rather than throwing', async () => {
    const res = await post('{oops')

    expect(res.status).toBe(400)
  })

  it('409s when the level already exists', async () => {
    // inGameId is the primary key, so this is a real user-facing case
    // (someone already added it), not a server fault.
    prisma.level.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      })
    )

    const res = await post(validBody())

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Level already exists' })
  })

  it('does not dress an unrelated write failure up as a 409', async () => {
    prisma.level.create.mockRejectedValue(new Error('connection lost'))

    const res = await post(validBody())

    expect(res.status).toBe(500)
  })
})
