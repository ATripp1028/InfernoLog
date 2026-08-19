/**
 * Unit tests for the spreadsheet difficulty cell.
 *
 * The property this file protects is the round trip: whatever
 * {@link toSheetDifficulty} writes for a level must, when parsed back by the
 * importer's difficulty filter, still match that same level. Every case here
 * asserts the written cell AND feeds it through `resolveByName` against the
 * level it came from. Prisma and RobTop are mocked; no DB, no network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { RobtopSearchResult } from '../../utils/robtop'

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})
vi.mock('../../utils/prisma', () => ({ default: prismaMock }))

const mockSearchRobtopByName = vi.hoisted(() =>
  vi.fn<() => Promise<RobtopSearchResult[]>>()
)
vi.mock('../../utils/robtop', () => ({
  searchRobtopByName: mockSearchRobtopByName,
}))

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: class {
    send = vi.fn()
  },
  SendMessageBatchCommand: class {},
}))

const { toSheetDifficulty } = await import('./sheetDifficulty')
const { resolveByName } = await import('./import/levelResolution')

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

beforeEach(() => {
  vi.clearAllMocks()
  prisma.level.findMany.mockReset().mockResolvedValue([] as never)
  mockSearchRobtopByName.mockReset().mockResolvedValue([])
})

/**
 * Asserts the cell a level exports as, then re-imports that cell: the level
 * must be the one it resolves back to, out of a candidate list that also holds
 * a same-named demon (the wrong answer the old face-label cell produced).
 */
async function expectRoundTrip(
  level: { inGameId: string; stars: number | null; inGameDifficulty: string },
  cell: string
) {
  expect(toSheetDifficulty(level)).toBe(cell)

  prisma.level.findMany.mockResolvedValue([
    { ...level, name: 'Round Trip', creator: null },
    {
      inGameId: 'decoy',
      name: 'Round Trip',
      creator: null,
      inGameDifficulty: 'Insane Demon',
      stars: 10,
    },
  ] as never)

  await expect(resolveByName('Round Trip', null, cell)).resolves.toEqual({
    levelId: level.inGameId,
  })
}

describe('toSheetDifficulty', () => {
  it('writes the star count for a rated non-demon', async () => {
    await expectRoundTrip(
      { inGameId: '9876543', stars: 5, inGameDifficulty: 'Hard' },
      '5★'
    )
  })

  it('writes the count even for a face that could never be a demon tier', async () => {
    // The count is strictly more informative — "Harder" is 6 or 7 stars.
    await expectRoundTrip(
      { inGameId: '9876543', stars: 7, inGameDifficulty: 'Harder' },
      '7★'
    )
  })

  it('marks a non-demon that has no star count to write', async () => {
    // Cache rows that only ever carried a label: the Hard / Harder / Insane
    // faces span two counts each, so the backfill left theirs null.
    await expectRoundTrip(
      { inGameId: '9876543', stars: null, inGameDifficulty: 'Hard' },
      'Hard (non-demon)'
    )
  })

  it('marks an official level whose count is off the non-demon scale', async () => {
    // Clutterfunk: labelled Insane, awarded 11 stars.
    await expectRoundTrip(
      { inGameId: '11', stars: 11, inGameDifficulty: 'Insane' },
      'Insane (non-demon)'
    )
  })

  it('marks an official level whose count contradicts its label', async () => {
    // Dry Out: 4 stars, but labelled Normal — writing "4★" would claim Hard.
    await expectRoundTrip(
      { inGameId: '4', stars: 4, inGameDifficulty: 'Normal' },
      'Normal (non-demon)'
    )
  })

  it('writes a demon tier as-is', async () => {
    expect(
      toSheetDifficulty({
        inGameId: '9876543',
        stars: 10,
        inGameDifficulty: 'Extreme Demon',
      })
    ).toBe('Extreme Demon')
  })

  it('writes a label this scale does not cover as-is', () => {
    expect(
      toSheetDifficulty({
        inGameId: '9876543',
        stars: 0,
        inGameDifficulty: 'Unrated',
      })
    ).toBe('Unrated')
  })

  it('writes nothing for a level with no known difficulty', () => {
    expect(
      toSheetDifficulty({
        inGameId: '9876543',
        stars: null,
        inGameDifficulty: null,
      })
    ).toBeNull()
  })
})
