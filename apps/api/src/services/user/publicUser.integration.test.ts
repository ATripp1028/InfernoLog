/**
 * Integration test for the public-user filter: an account that has not
 * finished onboarding is never returned by a public read, however the caller's
 * own conditions are written.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, seedUser, truncateAll } from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})

const { publicUsers, publicUserWhere } = await import('./publicUser')

const prisma = getTestPrisma()

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('publicUsers', () => {
  it('returns onboarded accounts and hides unfinished ones', async () => {
    const done = await seedUser(prisma, { username: 'finished' })
    await prisma.user.update({
      where: { id: done.id },
      data: { onboardingCompleted: true },
    })
    await seedUser(prisma, { username: 'player_1a2b3c4d' })

    const found = await prisma.user.findMany({ where: publicUsers() })
    expect(found.map((u) => u.username)).toEqual(['finished'])
  })

  it('cannot be widened by the caller’s own conditions', async () => {
    await seedUser(prisma, { username: 'player_1a2b3c4d' })

    const found = await prisma.user.findMany({
      where: publicUsers({
        username: 'player_1a2b3c4d',
        onboardingCompleted: false,
      }),
    })
    expect(found).toEqual([])
  })

  it('exposes the bare filter for merging', () => {
    expect(publicUserWhere).toEqual({ onboardingCompleted: true })
  })
})
