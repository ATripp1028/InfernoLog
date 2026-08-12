/**
 * Unit tests for the fire-and-forget GDDL record submission.
 *
 * The completion is already committed before this runs, so the contract is
 * narrow but strict: users without a key are a silent no-op, and the payload is
 * assembled from the stored update rather than from anything the caller passes.
 * Note this function does NOT swallow its own errors — the caller attaches the
 * `.catch`, which the tests pin so that responsibility doesn't silently move.
 * Prisma, KMS and the GDDL client are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockDecryptSecret } = vi.hoisted(() => ({ mockDecryptSecret: vi.fn() }))
vi.mock('../../utils/kms', () => ({ decryptSecret: mockDecryptSecret }))

const { mockSubmitGddlRecord } = vi.hoisted(() => ({
  mockSubmitGddlRecord: vi.fn(),
}))
vi.mock('../../utils/gddl', () => ({ submitGddlRecord: mockSubmitGddlRecord }))

const { submitCompletionRecordToGddl } = await import('./record')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const CIPHERTEXT = 'ciphertext-blob'
const PLAINTEXT_KEY = 'gddl-plaintext-key'

const PARAMS = {
  userId: 'user-1',
  progressUpdateId: 'pu-1',
  levelId: '12345',
  videoUrl: 'https://youtu.be/abc',
}

/** Stubs the stored progress update the payload is built from. */
function storedUpdate(
  overrides: Record<string, unknown> = {},
  userGddlTier: number | null = 18
) {
  prisma.progressUpdate.findUnique.mockResolvedValue({
    attempts: 4021,
    fps: 240,
    enjoyment: 85,
    device: 'pc',
    levelProgress: { userGddlTier },
    ...overrides,
  } as never)
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
  prisma.progressUpdate.findUnique.mockReset()
  storedUpdate()
  mockDecryptSecret.mockReset().mockResolvedValue(PLAINTEXT_KEY)
  mockSubmitGddlRecord.mockReset().mockResolvedValue({ accepted: true })
})

// ─── the no-key no-op ────────────────────────────────────────────────────────

describe('submitCompletionRecordToGddl — without a key', () => {
  it.each([
    ['the user has no key configured', { gddlApiKeyEncrypted: null }],
    ['the user row is missing', null],
  ])('does nothing when %s', async (_label, user) => {
    prisma.user.findUnique.mockResolvedValue(user as never)

    await expect(submitCompletionRecordToGddl(PARAMS)).resolves.toBeUndefined()
    expect(prisma.progressUpdate.findUnique).not.toHaveBeenCalled()
    expect(mockDecryptSecret).not.toHaveBeenCalled()
    expect(mockSubmitGddlRecord).not.toHaveBeenCalled()
  })
})

// ─── the payload ─────────────────────────────────────────────────────────────

describe('submitCompletionRecordToGddl — the payload', () => {
  it('submits with the decrypted key', async () => {
    await submitCompletionRecordToGddl(PARAMS)

    expect(mockDecryptSecret).toHaveBeenCalledWith(CIPHERTEXT)
    expect(mockSubmitGddlRecord.mock.lastCall?.[0]).toBe(PLAINTEXT_KEY)
  })

  it('builds the record from the stored update and the caller’s level/video', async () => {
    await submitCompletionRecordToGddl(PARAMS)

    expect(lastRecord()).toEqual({
      levelId: '12345',
      videoUrl: 'https://youtu.be/abc',
      attempts: 4021,
      fps: 240,
      enjoyment: 85,
      gddlTier: 18,
      device: 'pc',
    })
  })

  it('reads the update by its id', async () => {
    await submitCompletionRecordToGddl(PARAMS)

    expect(prisma.progressUpdate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pu-1' } })
    )
  })

  it('sends nulls for the fields the completion left blank', async () => {
    storedUpdate(
      { attempts: null, fps: null, enjoyment: null, device: null },
      null
    )

    await submitCompletionRecordToGddl({ ...PARAMS, videoUrl: null })

    expect(lastRecord()).toEqual({
      levelId: '12345',
      videoUrl: null,
      attempts: null,
      fps: null,
      enjoyment: null,
      gddlTier: null,
      device: null,
    })
  })

  it('still submits when the update row has vanished', async () => {
    // The completion is already committed; a missing update row must not stop
    // the level/video pair reaching GDDL.
    prisma.progressUpdate.findUnique.mockResolvedValue(null)

    await submitCompletionRecordToGddl(PARAMS)

    expect(lastRecord()).toMatchObject({
      levelId: '12345',
      videoUrl: 'https://youtu.be/abc',
      attempts: null,
      gddlTier: null,
    })
  })

  it('normalizes a NaN tier to null', async () => {
    // A NaN would serialize to `null` in JSON anyway, but only after being
    // treated as a number everywhere in between.
    storedUpdate({}, NaN)

    await submitCompletionRecordToGddl(PARAMS)

    expect(lastRecord().gddlTier).toBeNull()
  })

  it('keeps a zero tier — it is a value, not an absence', async () => {
    storedUpdate({}, 0)

    await submitCompletionRecordToGddl(PARAMS)

    expect(lastRecord().gddlTier).toBe(0)
  })
})

// ─── error propagation ───────────────────────────────────────────────────────

describe('submitCompletionRecordToGddl — errors', () => {
  it.each([
    [
      'GDDL rejects the submission',
      () => mockSubmitGddlRecord.mockRejectedValue(new Error('GDDL 422')),
    ],
    [
      'decryption fails',
      () => mockDecryptSecret.mockRejectedValue(new Error('kms down')),
    ],
  ])('rejects rather than swallowing when %s', async (_label, arrange) => {
    // The `.catch` lives at the call site, not here. If this ever started
    // swallowing, the caller's handling would silently become dead code.
    arrange()

    await expect(submitCompletionRecordToGddl(PARAMS)).rejects.toThrow()
  })
})
