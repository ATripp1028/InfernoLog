/**
 * Unit tests for the manual GDDL record submission.
 *
 * This is the blocking counterpart to the fire-and-forget submit on
 * POST /me/completions: it exists so the user gets a real answer, which means a
 * GDDL rejection has to surface as an actionable 422 rather than a 500. It also
 * decrypts the stored API key, so the tests check the key never appears in a
 * response. Prisma, KMS and the GDDL client are mocked.
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

const { mockDecryptSecret } = vi.hoisted(() => ({ mockDecryptSecret: vi.fn() }))
vi.mock('../../utils/kms', () => ({ decryptSecret: mockDecryptSecret }))

const { mockSubmitGddlRecord } = vi.hoisted(() => ({
  mockSubmitGddlRecord: vi.fn(),
}))
vi.mock('../../utils/gddl', () => {
  class GddlError extends Error {}
  return { GddlError, submitGddlRecord: mockSubmitGddlRecord }
})

const { GddlError } = await import('../../utils/gddl')
const gddlRecordRoutes = (await import('./gddlRecord')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const app = buildApp(gddlRecordRoutes)

const LEVEL_ID = '12345'
const CIPHERTEXT = 'ciphertext-blob'
const PLAINTEXT_KEY = 'gddl-plaintext-key'

/** A completion as the route selects it. */
function completion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pu-1',
    videoUrl: 'https://youtu.be/abc',
    attempts: 4021,
    fps: 240,
    enjoyment: 85,
    twoPlayerSolo: true,
    device: 'pc',
    ...overrides,
  }
}

/** Stubs the LevelProgress read with the given completion (or none). */
function withCompletion(
  update: Record<string, unknown> | null,
  userGddlTier: number | null = 18
) {
  prisma.levelProgress.findUnique.mockResolvedValue(
    (update === null
      ? { userGddlTier, progressUpdates: [] }
      : { userGddlTier, progressUpdates: [update] }) as never
  )
}

function submit(levelId = LEVEL_ID) {
  return app.request(`/me/gddl-records/${levelId}`, { method: 'POST' })
}

/** The record argument of the most recent GDDL submission. */
function lastRecord(): Record<string, unknown> {
  return mockSubmitGddlRecord.mock.lastCall?.[1] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.user.findUnique
    .mockReset()
    .mockResolvedValue({ gddlApiKeyEncrypted: CIPHERTEXT } as never)
  prisma.levelProgress.findUnique.mockReset()
  withCompletion(completion())
  mockDecryptSecret.mockReset().mockResolvedValue(PLAINTEXT_KEY)
  mockSubmitGddlRecord.mockReset().mockResolvedValue({ accepted: true })
})

// ─── preconditions ───────────────────────────────────────────────────────────

describe('POST /me/gddl-records/:levelId — preconditions', () => {
  it.each([
    ['no key is configured', { gddlApiKeyEncrypted: null }],
    ['the user row is missing', null],
  ])('400s when %s, without decrypting anything', async (_label, user) => {
    prisma.user.findUnique.mockResolvedValue(user as never)

    const res = await submit()

    expect(res.status).toBe(400)
    expect(mockDecryptSecret).not.toHaveBeenCalled()
    expect(mockSubmitGddlRecord).not.toHaveBeenCalled()
  })

  it('404s when the level has no completion', async () => {
    withCompletion(null)

    const res = await submit()

    expect(res.status).toBe(404)
    expect(mockSubmitGddlRecord).not.toHaveBeenCalled()
  })

  it('404s when the user has no progress on the level at all', async () => {
    prisma.levelProgress.findUnique.mockResolvedValue(null)

    const res = await submit()

    expect(res.status).toBe(404)
  })

  it('reads the progress scoped to the caller and level', async () => {
    await submit('99999')

    expect(prisma.levelProgress.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_levelId: { userId: TEST_USER_ID, levelId: '99999' } },
      })
    )
  })
})

// ─── submission ──────────────────────────────────────────────────────────────

describe('POST /me/gddl-records/:levelId — submission', () => {
  it('submits the completion with the decrypted key and 200s', async () => {
    const res = await submit()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { submitted: true } })
    expect(mockDecryptSecret).toHaveBeenCalledWith(CIPHERTEXT)
    expect(mockSubmitGddlRecord.mock.lastCall?.[0]).toBe(PLAINTEXT_KEY)
  })

  it('sends the stored completion fields and the level’s GDDL tier', async () => {
    await submit()

    expect(lastRecord()).toEqual({
      levelId: LEVEL_ID,
      videoUrl: 'https://youtu.be/abc',
      attempts: 4021,
      fps: 240,
      enjoyment: 85,
      gddlTier: 18,
      isSolo: true,
      device: 'pc',
    })
  })

  it('nulls the optional fields the completion does not have', async () => {
    withCompletion(
      completion({
        videoUrl: null,
        attempts: null,
        fps: null,
        enjoyment: null,
        device: null,
      }),
      null
    )

    await submit()

    expect(lastRecord()).toMatchObject({
      videoUrl: null,
      attempts: null,
      fps: null,
      enjoyment: null,
      gddlTier: null,
      device: null,
    })
  })

  it('defaults a null twoPlayerSolo to solo', async () => {
    withCompletion(completion({ twoPlayerSolo: null }))

    await submit()

    expect(lastRecord().isSolo).toBe(true)
  })

  it('preserves an explicit two-player completion', async () => {
    withCompletion(completion({ twoPlayerSolo: false }))

    await submit()

    expect(lastRecord().isSolo).toBe(false)
  })

  it('reports 200 even when GDDL declines to accept the record', async () => {
    // The endpoint reports that the submission was made; acceptance is GDDL's
    // own verdict and is not an error here.
    mockSubmitGddlRecord.mockResolvedValue({ accepted: false })

    const res = await submit()

    expect(res.status).toBe(200)
  })
})

// ─── failures ────────────────────────────────────────────────────────────────

describe('POST /me/gddl-records/:levelId — failures', () => {
  it('surfaces a GDDL rejection as an actionable 422', async () => {
    // The whole reason this blocking endpoint exists: the user needs to see
    // what GDDL said (bad video link, duplicate record).
    mockSubmitGddlRecord.mockRejectedValue(
      new GddlError('Proof link is not a valid video')
    )

    const res = await submit()

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({
      error: 'Proof link is not a valid video',
    })
  })

  it('does not translate a non-GDDL failure into a 422', async () => {
    mockSubmitGddlRecord.mockRejectedValue(new Error('connection lost'))

    const res = await submit()

    expect(res.status).toBe(500)
  })

  it('does not answer 200 when decryption fails', async () => {
    mockDecryptSecret.mockRejectedValue(new Error('kms unavailable'))

    const res = await submit()

    expect(res.status).toBe(500)
    expect(mockSubmitGddlRecord).not.toHaveBeenCalled()
  })

  it('never puts the API key in a response body', async () => {
    mockSubmitGddlRecord.mockRejectedValue(new GddlError('rejected'))

    const body = await (await submit()).text()

    expect(body).not.toContain(PLAINTEXT_KEY)
    expect(body).not.toContain(CIPHERTEXT)
  })
})
