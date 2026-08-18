/**
 * Integration tests for the per-user RobTop budget.
 *
 * Exercised against a real Postgres because the whole mechanism IS one SQL
 * statement: the refill, the "is there a token" test and the decrement happen
 * inside a single `INSERT ... ON CONFLICT DO UPDATE ... WHERE`, and that
 * atomicity is the property worth testing. A mocked client could only confirm
 * we sent a string.
 *
 * Time is manipulated by writing `lastRefillAt` into the past rather than by
 * faking the clock, since the refill arithmetic runs in the database against
 * `now()`, not in JavaScript.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, truncateAll, seedUser } from '../test/utils'

vi.mock('./prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})

const { chargeRobtopBudget, RobtopBudgetExhaustedError, BUDGET_CAPACITY } =
  await import('./robtopUserBudget')

const prisma = getTestPrisma()

let userId: string
let otherUserId: string

/** Spends the whole bucket, leaving it dry. */
async function drain(id: string) {
  await prisma.$executeRaw`
    INSERT INTO "robtop_user_budget" ("userId", tokens, "lastRefillAt")
    VALUES (${id}, 0, now())
    ON CONFLICT ("userId") DO UPDATE SET tokens = 0, "lastRefillAt" = now()
  `
}

/** Backdates the last refill so the bucket has had time to recover. */
async function ageBy(id: string, seconds: number) {
  await prisma.$executeRaw`
    UPDATE "robtop_user_budget"
    SET "lastRefillAt" = now() - ${`${seconds} seconds`}::interval
    WHERE "userId" = ${id}
  `
}

function tokensOf(id: string) {
  return prisma.robtopUserBudget
    .findUnique({ where: { userId: id }, select: { tokens: true } })
    .then((r) => r?.tokens ?? null)
}

beforeEach(async () => {
  await truncateAll(prisma)
  userId = (await seedUser(prisma, { username: 'budget_user' })).id
  otherUserId = (await seedUser(prisma, { username: 'other_user' })).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('chargeRobtopBudget', () => {
  it('creates the row lazily on first charge, so no backfill was needed', async () => {
    expect(await tokensOf(userId)).toBeNull()

    await chargeRobtopBudget(userId)

    expect(await tokensOf(userId)).toBeCloseTo(BUDGET_CAPACITY - 1, 3)
  })

  it('spends one token per charge', async () => {
    await chargeRobtopBudget(userId)
    await chargeRobtopBudget(userId)
    await chargeRobtopBudget(userId)

    // Approximate on purpose: the bucket refills continuously, so the few
    // milliseconds spent issuing these three charges hand back a sliver of a
    // token. Asserting an exact balance would make this flaky for a behaviour
    // that is correct.
    expect(await tokensOf(userId)).toBeCloseTo(BUDGET_CAPACITY - 3, 1)
  })

  it('throws once the budget is spent', async () => {
    await drain(userId)

    await expect(chargeRobtopBudget(userId)).rejects.toBeInstanceOf(
      RobtopBudgetExhaustedError
    )
  })

  it('reports a positive wait when it refuses', async () => {
    await drain(userId)

    await expect(chargeRobtopBudget(userId)).rejects.toMatchObject({
      retryAfterSeconds: expect.any(Number),
    })
    const err = await chargeRobtopBudget(userId).catch((e) => e)
    expect(err.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('does not go further negative while refusing', async () => {
    await drain(userId)

    await chargeRobtopBudget(userId).catch(() => {})
    await chargeRobtopBudget(userId).catch(() => {})

    // A refused charge must be a no-op — otherwise repeated spam would drive
    // the balance down without bound and extend the lockout indefinitely.
    expect(await tokensOf(userId)).toBe(0)
  })

  it('refills over time and lets the user back in', async () => {
    await drain(userId)
    await ageBy(userId, 60)

    await expect(chargeRobtopBudget(userId)).resolves.toBeUndefined()
  })

  it('never refills past the capacity, however long the idle', async () => {
    await drain(userId)
    await ageBy(userId, 60 * 60 * 24 * 30)

    await chargeRobtopBudget(userId)

    expect(await tokensOf(userId)).toBeCloseTo(BUDGET_CAPACITY - 1, 3)
  })

  it('is per user — one account draining does not affect another', async () => {
    await drain(userId)

    await expect(chargeRobtopBudget(userId)).rejects.toBeInstanceOf(
      RobtopBudgetExhaustedError
    )
    await expect(chargeRobtopBudget(otherUserId)).resolves.toBeUndefined()
  })

  it('does not oversell under concurrent charges', async () => {
    // The point of doing refill-test-decrement in ONE statement: Lambda
    // invocations share no memory, so simultaneous requests from one user have
    // to serialize through the row lock. With a read-then-write pair they would
    // all read the same balance and every one would be granted.
    await drain(userId)
    await ageBy(userId, 36) // ~2 tokens back at 200/hour

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        chargeRobtopBudget(userId).then(
          () => 'granted' as const,
          () => 'refused' as const
        )
      )
    )

    const granted = results.filter((r) => r === 'granted').length
    expect(granted).toBeGreaterThan(0)
    expect(granted).toBeLessThanOrEqual(3)
    expect(await tokensOf(userId)).toBeGreaterThanOrEqual(0)
  })

  it('is cleaned up with the user', async () => {
    await chargeRobtopBudget(userId)

    await prisma.user.delete({ where: { id: userId } })

    expect(await tokensOf(userId)).toBeNull()
  })
})
