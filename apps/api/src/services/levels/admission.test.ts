/**
 * Unit tests for the level cache's admission rule.
 *
 * The rule is one boolean, and it is the whole of the enforcement: progress,
 * collection entries and demon list placements all reference `levels` by
 * foreign key, so a level this refuses cannot be logged, collected or ranked by
 * any path. That is why the cases below spell out the combinations rather than
 * just asserting the happy one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})
vi.mock('../../utils/prisma', () => ({ default: prismaMock }))

const { isAdmissible, notADemonBody, purgeIfUnused, NOT_A_DEMON_MESSAGE } =
  await import('./admission')
const { Prisma } = await import('@prisma/client')

type PrismaLike = {
  level: { deleteMany: ReturnType<typeof vi.fn> }
}
const prisma = prismaMock as unknown as PrismaLike

beforeEach(() => {
  vi.clearAllMocks()
})

describe('isAdmissible', () => {
  it('refuses a rated non-demon, and nothing else', () => {
    expect(isAdmissible({ isRated: true, isDemon: false })).toBe(false)

    expect(isAdmissible({ isRated: true, isDemon: true })).toBe(true)
    // Unrated levels are admitted whatever the demon flag says: GD has not
    // decided what they are, and an unrated level is loggable.
    expect(isAdmissible({ isRated: false, isDemon: false })).toBe(true)
    expect(isAdmissible({ isRated: false, isDemon: true })).toBe(true)
  })
})

describe('notADemonBody', () => {
  it('names the level so the client can say which one was refused', () => {
    expect(
      notADemonBody('1', {
        name: 'Stereo Madness',
        creator: 'RobTop',
        inGameDifficulty: 'Easy',
      })
    ).toEqual({
      error: NOT_A_DEMON_MESSAGE,
      reason: 'not_a_demon',
      level: {
        inGameId: '1',
        name: 'Stereo Madness',
        creator: 'RobTop',
        inGameDifficulty: 'Easy',
      },
    })
  })
})

describe('purgeIfUnused', () => {
  it('deletes only when nothing references the level', async () => {
    prisma.level.deleteMany.mockResolvedValue({ count: 1 })

    await expect(purgeIfUnused('123')).resolves.toBe(true)
    expect(prisma.level.deleteMany).toHaveBeenCalledWith({
      where: {
        inGameId: '123',
        levelProgress: { none: {} },
        collectionEntries: { none: {} },
      },
    })
  })

  it('reports a level in use as kept rather than deleted', async () => {
    prisma.level.deleteMany.mockResolvedValue({ count: 0 })

    await expect(purgeIfUnused('123')).resolves.toBe(false)
  })

  it('treats a foreign-key violation as "in use"', async () => {
    // The reference check and the delete are one statement, so a reference
    // inserted concurrently surfaces here instead of racing: the level is in
    // use, and deleting it would take that user's data with it.
    prisma.level.deleteMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK violation', {
        code: 'P2003',
        clientVersion: '5.22.0',
      })
    )

    await expect(purgeIfUnused('123')).resolves.toBe(false)
  })

  it('rethrows anything else, rather than reporting a failed delete as a keep', async () => {
    prisma.level.deleteMany.mockRejectedValue(new Error('connection lost'))

    await expect(purgeIfUnused('123')).rejects.toThrow('connection lost')
  })
})
