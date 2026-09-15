/**
 * The lowercase_emails migration's CHECK constraints: Postgres itself refuses a
 * mixed-case email on `users` and `auth_identities`, so code that skips
 * normalization fails loudly instead of creating an address that differs from
 * an existing one only in case.
 *
 * The migration's guard against merging two accounts can't be exercised here:
 * once the constraints exist, the mixed-case rows it guards against can't be
 * inserted to test it.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getTestPrisma, seedUser, truncateAll } from './utils'

const prisma = getTestPrisma()

beforeEach(async () => {
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('lowercase email constraints', () => {
  it('refuses a mixed-case email on users', async () => {
    await expect(
      seedUser(prisma, { email: 'Player@example.com' })
    ).rejects.toThrow(/users_email_lowercase/)
  })

  it('refuses a mixed-case email on auth_identities, and allows none', async () => {
    const user = await seedUser(prisma, { email: 'player@example.com' })
    await expect(
      prisma.authIdentity.create({
        data: {
          userId: user.id,
          provider: 'GOOGLE',
          cognitoSub: 'sub-1',
          email: 'Player@example.com',
        },
      })
    ).rejects.toThrow(/auth_identities_email_lowercase/)

    await expect(
      prisma.authIdentity.create({
        data: { userId: user.id, provider: 'GOOGLE', cognitoSub: 'sub-2' },
      })
    ).resolves.toMatchObject({ email: null })
  })
})
