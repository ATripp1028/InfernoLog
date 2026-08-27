/**
 * Unit tests for the classic-ranking routes' request gates and error mapping.
 *
 * The onError split is the part with teeth: a missing target is a 404 and a
 * rule violation (already placed, bad neighbours) is a caller-fixable 400,
 * while anything else must stay a 500. Collapsing those would either hide real
 * faults or tell the user to fix something that isn't theirs. Prisma and the
 * ranking service are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const { mockPlaceCompletion, mockReorderEntry } = vi.hoisted(() => ({
  mockPlaceCompletion: vi.fn(),
  mockReorderEntry: vi.fn(),
}))

vi.mock('../../services/demonList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/demonList')>()
  return {
    ...actual,
    placeCompletion: mockPlaceCompletion,
    reorderEntry: mockReorderEntry,
  }
})

const { RankingError, RankingNotFoundError } =
  await import('../../services/demonList')
const rankingApp = (await import('./index')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const app = buildApp(rankingApp)
const LP_ID = '11111111-2222-3333-4444-555555555555'

function send(method: string, path: string, body: unknown) {
  return app.request(path, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPlaceCompletion.mockReset().mockResolvedValue({})
  mockReorderEntry.mockReset().mockResolvedValue({})
})

// ─── body gates ──────────────────────────────────────────────────────────────

describe('ranking routes — body validation', () => {
  it('POST 400s on an unparseable body', async () => {
    // levelProgressId is required, so the `{}` fallback fails validation.
    const res = await send('POST', '/me/demon-list/classic', '{oops')

    expect(res.status).toBe(400)
    expect(mockPlaceCompletion).not.toHaveBeenCalled()
  })

  it('400s on an unparseable reorder body rather than moving the entry', async () => {
    // ReorderDemonListInputSchema is `{ aboveId?, belowId? }`, so a `{}` fallback
    // would be VALID and reach the service as a neighbourless reorder —
    // computeIndex bisects (null, null) to index 1, silently relocating the
    // entry to the easiest end. parseJsonBody rejects it first.
    const res = await send('PATCH', `/me/demon-list/classic/${LP_ID}`, '{oops')

    expect(res.status).toBe(400)
    expect(mockReorderEntry).not.toHaveBeenCalled()
  })

  it('400s on a reorder body whose neighbour is the wrong type', async () => {
    const res = await send('PATCH', `/me/demon-list/classic/${LP_ID}`, {
      aboveId: 42,
    })

    expect(res.status).toBe(400)
    expect(mockReorderEntry).not.toHaveBeenCalled()
  })
})

// ─── onError mapping ─────────────────────────────────────────────────────────

describe('ranking routes — error mapping', () => {
  it('maps a missing target to 404', async () => {
    mockPlaceCompletion.mockRejectedValue(
      new RankingNotFoundError('No completion for that level')
    )

    const res = await send('POST', '/me/demon-list/classic', {
      levelProgressId: LP_ID,
    })

    expect(res.status).toBe(404)
  })

  it('maps a caller-fixable rule violation to 400', async () => {
    mockPlaceCompletion.mockRejectedValue(
      new RankingError('Level is already ranked')
    )

    const res = await send('POST', '/me/demon-list/classic', {
      levelProgressId: LP_ID,
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Level is already ranked',
    })
  })

  it('leaves an unrecognized failure as a 500', async () => {
    mockPlaceCompletion.mockRejectedValue(new Error('connection lost'))

    const res = await send('POST', '/me/demon-list/classic', {
      levelProgressId: LP_ID,
    })

    expect(res.status).toBe(500)
  })
})
