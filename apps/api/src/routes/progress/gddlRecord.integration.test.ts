/**
 * Integration tests for the manual GDDL record submission.
 *
 * This is the blocking retry for a completion that didn't reach GDDL, so what
 * it sends has to come from the stored completion rather than from the request.
 * The route reads through a LevelProgress → ProgressUpdate join filtered to
 * kind=COMPLETION; against real rows that proves it picks the completion and
 * not some other update on the same level, which a stubbed Prisma cannot.
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
vi.mock('../../utils/kms', () => ({
  encryptSecret: vi.fn(async () => 'ciphertext-blob'),
  decryptSecret: vi.fn(async () => 'plaintext-key'),
}))

// Typed with the real signature so `mock.lastCall` exposes both arguments —
// an argless mock type makes the args tuple empty.
const { mockSubmitRecord } = vi.hoisted(() => ({
  mockSubmitRecord: vi.fn<
    (
      apiKey: string,
      record: Record<string, unknown>
    ) => Promise<{ accepted: boolean }>
  >(async () => ({ accepted: true })),
}))
vi.mock('../../utils/gddl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/gddl')>()),
  submitGddlRecord: mockSubmitRecord,
}))

const { default: progressApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

const LEVEL_ID = '100'

function submit(userId: string, levelId = LEVEL_ID) {
  return buildApp(progressApp, { userId }).request(
    `/me/gddl-records/${levelId}`,
    { method: 'POST' }
  )
}

/** The record argument of the most recent GDDL submission. */
function lastRecord(): Record<string, unknown> {
  return mockSubmitRecord.mock.lastCall![1]
}

/** A keyed user with a completed level, plus the level itself. */
async function seedCompletedLevel(
  completion: Record<string, unknown> = {},
  lpFields: Record<string, unknown> = {}
) {
  const user = await seedUser(prisma, { gddlApiKeyEncrypted: 'ciphertext-blob' })
  await seedLevel(prisma, { inGameId: LEVEL_ID })
  const lp = await prisma.levelProgress.create({
    data: {
      userId: user.id,
      levelId: LEVEL_ID,
      status: 'COMPLETED',
      userGddlTier: 18,
      ...lpFields,
    },
  })
  await prisma.progressUpdate.create({
    data: {
      levelProgressId: lp.id,
      kind: 'COMPLETION',
      videoUrl: 'https://youtu.be/abc',
      attempts: 4021,
      fps: 240,
      enjoyment: 85,
      device: 'pc',
      ...completion,
    },
  })
  return { user, lp }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
  mockSubmitRecord.mockResolvedValue({ accepted: true })
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── submitting ──────────────────────────────────────────────────────────────

describe('POST /me/gddl-records/:levelId', () => {
  it('submits the stored completion with the decrypted key', async () => {
    const { user } = await seedCompletedLevel()

    const res = await submit(user.id)

    expect(res.status).toBe(200)
    expect(mockSubmitRecord.mock.lastCall![0]).toBe('plaintext-key')
    expect(lastRecord()).toMatchObject({
      levelId: LEVEL_ID,
      videoUrl: 'https://youtu.be/abc',
      attempts: 4021,
      fps: 240,
      enjoyment: 85,
      gddlTier: 18,
    })
  })

  it('reads the completion, not another update on the same level', async () => {
    // A level accumulates PROGRESS and DROP rows too; the select filters to
    // kind=COMPLETION, which only real sibling rows can demonstrate.
    const { user, lp } = await seedCompletedLevel()
    await prisma.progressUpdate.createMany({
      data: [
        { levelProgressId: lp.id, kind: 'PROGRESS', attempts: 1 },
        { levelProgressId: lp.id, kind: 'DROP', attempts: 2 },
      ],
    })

    await submit(user.id)

    expect(lastRecord().attempts).toBe(4021)
  })

  it('sends the level’s stored GDDL tier', async () => {
    const { user } = await seedCompletedLevel({}, { userGddlTier: 25 })

    await submit(user.id)

    expect(lastRecord().gddlTier).toBe(25)
  })

  it('sends null for fields the completion never recorded', async () => {
    const { user } = await seedCompletedLevel(
      { videoUrl: null, attempts: null, fps: null, enjoyment: null, device: null },
      { userGddlTier: null }
    )

    await submit(user.id)

    expect(lastRecord()).toMatchObject({
      videoUrl: null,
      attempts: null,
      fps: null,
      enjoyment: null,
      gddlTier: null,
      device: null,
    })
  })
})

// ─── rejections ──────────────────────────────────────────────────────────────

describe('POST /me/gddl-records/:levelId — rejections', () => {
  it('400s without a configured key and submits nothing', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: LEVEL_ID })

    const res = await submit(user.id)

    expect(res.status).toBe(400)
    expect(mockSubmitRecord).not.toHaveBeenCalled()
  })

  it('404s when the level has progress but no completion', async () => {
    const user = await seedUser(prisma, { gddlApiKeyEncrypted: 'ciphertext-blob' })
    await seedLevel(prisma, { inGameId: LEVEL_ID })
    const lp = await prisma.levelProgress.create({
      data: { userId: user.id, levelId: LEVEL_ID, status: 'IN_PROGRESS' },
    })
    await prisma.progressUpdate.create({
      data: { levelProgressId: lp.id, kind: 'PROGRESS', percentage: 50 },
    })

    const res = await submit(user.id)

    expect(res.status).toBe(404)
    expect(mockSubmitRecord).not.toHaveBeenCalled()
  })

  it('404s for a level the user has no progress on', async () => {
    const user = await seedUser(prisma, { gddlApiKeyEncrypted: 'ciphertext-blob' })
    await seedLevel(prisma, { inGameId: LEVEL_ID })

    expect((await submit(user.id)).status).toBe(404)
  })

  it('does not submit another user’s completion', async () => {
    // The LevelProgress lookup is keyed on (userId, levelId).
    const { user } = await seedCompletedLevel()
    const other = await seedUser(prisma, {
      gddlApiKeyEncrypted: 'ciphertext-blob',
    })

    const res = await submit(other.id)

    expect(res.status).toBe(404)
    expect(mockSubmitRecord).not.toHaveBeenCalled()
    expect(user.id).not.toBe(other.id)
  })

  it('surfaces a GDDL rejection as an actionable 422', async () => {
    const { GddlError } = await import('../../utils/gddl')
    const { user } = await seedCompletedLevel()
    mockSubmitRecord.mockRejectedValue(
      new GddlError('Proof link is not a valid video')
    )

    const res = await submit(user.id)

    expect(res.status).toBe(422)
    await expect(res.json()).resolves.toEqual({
      error: 'Proof link is not a valid video',
    })
  })

  it('never puts the stored key in a response', async () => {
    const { GddlError } = await import('../../utils/gddl')
    const { user } = await seedCompletedLevel()
    mockSubmitRecord.mockRejectedValue(new GddlError('rejected'))

    const text = await (await submit(user.id)).text()

    expect(text).not.toContain('plaintext-key')
    expect(text).not.toContain('ciphertext-blob')
  })
})
