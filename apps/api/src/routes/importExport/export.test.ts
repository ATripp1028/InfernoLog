/**
 * Unit tests for GET /me/export.
 *
 * Almost all of this route is query-param coercion, and it is the kind that
 * fails quietly: a NaN limit or a negative offset would reach the service and
 * either throw deep in Prisma or silently return the wrong page of a drain the
 * client assumes is complete. The service itself is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, TEST_USER_ID } from '../../test/utils'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { mockExportSection } = vi.hoisted(() => ({ mockExportSection: vi.fn() }))

vi.mock('../../services/importExport/export', () => ({
  exportSection: mockExportSection,
  EXPORT_DEFAULT_LIMIT: 500,
  EXPORT_MAX_LIMIT: 1000,
}))
vi.mock('../../utils/prisma', () => ({ default: {} }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))

// Mounted through index.ts so the module's own onError handler is the one
// under test, not Hono's default.
const exportRoutes = (await import('./index')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const app = buildApp(exportRoutes)

/** The (userId, section, offset, limit) the service was called with. */
function lastCall() {
  const [userId, section, offset, limit] = mockExportSection.mock.lastCall as [
    string,
    string,
    number,
    number,
  ]
  return { userId, section, offset, limit }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExportSection
    .mockReset()
    .mockResolvedValue({ items: [], total: 0, offset: 0, limit: 500 })
})

// ─── section validation ──────────────────────────────────────────────────────

describe('GET /me/export — section', () => {
  it.each([
    'completions',
    'progress',
    'dropped',
    'ranking',
    'collections',
    'ratings',
    'categories',
  ])('accepts the %s section', async (section) => {
    const res = await app.request(`/me/export?section=${section}`)

    expect(res.status).toBe(200)
    expect(lastCall().section).toBe(section)
  })

  it('scopes the export to the authenticated user', async () => {
    await app.request('/me/export?section=completions')

    expect(lastCall().userId).toBe(TEST_USER_ID)
  })

  it.each([
    ['no section is given', ''],
    ['the section is unknown', '?section=everything'],
    ['the section is empty', '?section='],
  ])('400s when %s', async (_label, query) => {
    const res = await app.request(`/me/export${query}`)

    expect(res.status).toBe(400)
    expect(mockExportSection).not.toHaveBeenCalled()
  })

  it('names the valid sections in the error', async () => {
    const body = (await (
      await app.request('/me/export?section=nope')
    ).json()) as { error: string }

    expect(body.error).toContain('completions')
    expect(body.error).toContain('categories')
  })

  it('returns the service page verbatim', async () => {
    const page = { items: [{ id: 1 }], total: 1, offset: 0, limit: 500 }
    mockExportSection.mockResolvedValue(page)

    const res = await app.request('/me/export?section=completions')

    await expect(res.json()).resolves.toEqual(page)
  })
})

// ─── pagination coercion ─────────────────────────────────────────────────────

describe('GET /me/export — offset', () => {
  it('defaults to 0', async () => {
    await app.request('/me/export?section=completions')
    expect(lastCall().offset).toBe(0)
  })

  it('passes a valid offset through', async () => {
    await app.request('/me/export?section=completions&offset=250')
    expect(lastCall().offset).toBe(250)
  })

  it.each([
    ['a negative offset', 'offset=-5', 0],
    ['a fractional offset', 'offset=12.9', 12],
    ['a non-numeric offset', 'offset=abc', 0],
  ])('clamps %s', async (_label, query, expected) => {
    await app.request(`/me/export?section=completions&${query}`)
    expect(lastCall().offset).toBe(expected)
  })
})

describe('GET /me/export — limit', () => {
  it('defaults to the service default', async () => {
    await app.request('/me/export?section=completions')
    expect(lastCall().limit).toBe(500)
  })

  it('passes a valid limit through', async () => {
    await app.request('/me/export?section=completions&limit=100')
    expect(lastCall().limit).toBe(100)
  })

  it.each([
    ['caps at the maximum', 'limit=99999', 1000],
    ['floors at 1 for zero', 'limit=0', 1],
    ['floors at 1 for a negative', 'limit=-10', 1],
    ['truncates a fraction', 'limit=10.7', 10],
    ['falls back to the default for a non-number', 'limit=abc', 500],
  ])('%s', async (_label, query, expected) => {
    await app.request(`/me/export?section=completions&${query}`)
    expect(lastCall().limit).toBe(expected)
  })

  it('never hands the service a NaN', async () => {
    // Prisma would throw deep in the query builder rather than 400 here.
    for (const query of ['limit=abc&offset=xyz', 'limit=&offset=']) {
      await app.request(`/me/export?section=completions&${query}`)
      const { offset, limit } = lastCall()
      expect(Number.isFinite(offset)).toBe(true)
      expect(Number.isFinite(limit)).toBe(true)
    }
  })
})
