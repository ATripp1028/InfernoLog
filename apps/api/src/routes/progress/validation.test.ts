/**
 * Unit tests for the progress routes' request gates and error mapping.
 *
 * These are the write endpoints for the logging flow, so the thing worth
 * pinning is that a body which doesn't parse or doesn't validate never reaches
 * a write. The module's onError mapping is also covered here: two service
 * errors are client-input problems and must read as 400, while anything else
 * stays a 500 — collapsing that distinction would either hide real faults or
 * blame the user for ours. Prisma and the progress service are mocked.
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

const {
  mockApplyCompletion,
  mockApplyProgress,
  mockApplyDrop,
  mockApplyEdit,
} = vi.hoisted(() => ({
  mockApplyCompletion: vi.fn(),
  mockApplyProgress: vi.fn(),
  mockApplyDrop: vi.fn(),
  mockApplyEdit: vi.fn(),
}))

vi.mock('../../services/progress', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/progress')>()
  return {
    ...actual,
    applyCompletion: mockApplyCompletion,
    applyProgress: mockApplyProgress,
    applyDrop: mockApplyDrop,
    applyEdit: mockApplyEdit,
  }
})

const { LevelNotFoundError, ProgressFieldsNotApplicableError } = await import(
  '../../services/progress'
)
const progressApp = (await import('./index')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const app = buildApp(progressApp)

function send(method: string, path: string, body: unknown) {
  return app.request(path, {
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const WRITE_ROUTES: [string, string][] = [
  ['POST', '/me/completions'],
  ['POST', '/me/progress'],
  ['POST', '/me/drops'],
  ['PATCH', '/me/progress/12345'],
]

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyCompletion.mockReset().mockResolvedValue({})
  mockApplyProgress.mockReset().mockResolvedValue({})
  mockApplyDrop.mockReset().mockResolvedValue({})
  mockApplyEdit.mockReset().mockResolvedValue({})
})

/** No write path was invoked. */
function assertNoWrites() {
  expect(mockApplyCompletion).not.toHaveBeenCalled()
  expect(mockApplyProgress).not.toHaveBeenCalled()
  expect(mockApplyDrop).not.toHaveBeenCalled()
  expect(mockApplyEdit).not.toHaveBeenCalled()
}

// ─── body gates ──────────────────────────────────────────────────────────────

describe('progress routes — body validation', () => {
  it.each(WRITE_ROUTES)('%s %s 400s on an unparseable body', async (m, p) => {
    const res = await send(m, p, '{oops')

    expect(res.status).toBe(400)
    assertNoWrites()
  })

  it.each(WRITE_ROUTES)(
    '%s %s 400s on a body that fails validation',
    async (m, p) => {
      const res = await send(m, p, { levelId: 'not-numeric', attempts: -1 })

      expect(res.status).toBe(400)
      assertNoWrites()
    }
  )
})

// ─── edits ───────────────────────────────────────────────────────────────────

describe('PATCH /me/progress/:levelId', () => {
  it('404s when the service finds no entry to edit', async () => {
    // The service returns null rather than throwing for a miss.
    mockApplyEdit.mockResolvedValue(null)

    const res = await send('PATCH', '/me/progress/12345', { notes: 'x' })

    expect(res.status).toBe(404)
  })
})

// ─── onError mapping ─────────────────────────────────────────────────────────

describe('progress routes — error mapping', () => {
  it('maps a not-cached level to 400, not 500', async () => {
    // Client sequencing: the flow resolves the level before any write.
    mockApplyEdit.mockRejectedValue(new LevelNotFoundError('12345'))

    const res = await send('PATCH', '/me/progress/12345', { notes: 'x' })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('12345'),
    })
  })

  it('maps percentage-on-a-non-progress-entry to 400', async () => {
    mockApplyEdit.mockRejectedValue(
      new ProgressFieldsNotApplicableError('COMPLETION')
    )

    const res = await send('PATCH', '/me/progress/12345', { percentage: 50 })

    expect(res.status).toBe(400)
  })

  it('leaves an unrecognized failure as a 500', async () => {
    // Falling through to the default is what keeps real faults visible.
    mockApplyEdit.mockRejectedValue(new Error('connection lost'))

    const res = await send('PATCH', '/me/progress/12345', { notes: 'x' })

    expect(res.status).toBe(500)
  })
})
