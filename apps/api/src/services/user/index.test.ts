/**
 * Unit tests for user creation at signup.
 *
 * This runs once per account, on a path where a retry is plausible (a
 * double-submit, or a Google account that already has an InfernoLog account
 * going through Sign Up) — so the idempotency guard is the thing that matters,
 * along with the row being seeded with the defaults the rest of the app assumes
 * exist. Prisma is mocked.
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

const { createUserForSignup, DEFAULT_RATING_CATEGORIES } = await import('./index')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const EMAIL = 'player@example.com'
const SUB = 'cognito-sub-abc'

/** The `data` of the single user.create call. */
function createData(): Record<string, unknown> {
  return (prisma.user.create.mock.lastCall?.[0] as { data: Record<string, unknown> })
    .data
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.user.findUnique.mockReset().mockResolvedValue(null)
  prisma.user.create.mockReset().mockResolvedValue({ id: 'user-1' } as never)
})

// ─── idempotency ─────────────────────────────────────────────────────────────

describe('createUserForSignup — idempotency', () => {
  it('returns the existing row without creating a second one', async () => {
    // A double-submit must not produce two accounts for one identity.
    const existing = { id: 'user-1', onboardingCompleted: true }
    prisma.user.findUnique.mockResolvedValue(existing as never)

    await expect(createUserForSignup(EMAIL, SUB)).resolves.toBe(existing)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('keys the existence check on cognitoSub, not email', async () => {
    // cognitoSub is unique and known before the row exists; email is not a
    // safe key here (a user can change it, and it isn't the identity).
    await createUserForSignup(EMAIL, SUB)

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { cognitoSub: SUB },
    })
  })
})

// ─── the created row ─────────────────────────────────────────────────────────

describe('createUserForSignup — the new row', () => {
  it('stores the email and cognitoSub, and starts pre-onboarding', async () => {
    await createUserForSignup(EMAIL, SUB)

    expect(createData()).toMatchObject({
      email: EMAIL,
      cognitoSub: SUB,
      onboardingCompleted: false,
    })
  })

  it('derives a username from the email local part with a random suffix', async () => {
    await createUserForSignup(EMAIL, SUB)

    const username = createData().username as string
    expect(username).toMatch(/^player_[0-9a-f]{8}$/)
  })

  it('gives two users with the same email local part different usernames', async () => {
    // The suffix is what stops the unique constraint rejecting the second
    // signup from, say, two different providers' alex@… addresses.
    await createUserForSignup(EMAIL, SUB)
    const first = createData().username
    await createUserForSignup(EMAIL, 'another-sub')
    const second = createData().username

    expect(second).not.toBe(first)
  })

  it('seeds the three default rating categories', async () => {
    await createUserForSignup(EMAIL, SUB)

    const { ratingCategories } = createData() as {
      ratingCategories: { create: { name: string; weight: number }[] }
    }
    expect(ratingCategories.create.map((c) => c.name)).toEqual([
      'Gameplay',
      'Decoration',
      'Song',
    ])
  })

  it('seeds category weights that sum to exactly 1.00', async () => {
    // The rating-config route rejects any config whose weights miss 1.00, so a
    // new user would be unable to save until they fixed it by hand.
    await createUserForSignup(EMAIL, SUB)

    const { ratingCategories } = createData() as {
      ratingCategories: { create: { weight: number }[] }
    }
    const cents = ratingCategories.create.reduce(
      (acc, c) => acc + Math.round(c.weight * 100),
      0
    )
    expect(cents).toBe(100)
  })

  it('seeds the three built-in collections', async () => {
    await createUserForSignup(EMAIL, SUB)

    const { collections } = createData() as {
      collections: { create: { name: string; type: string }[] }
    }
    expect(collections.create).toEqual([
      { name: 'Favorites', type: 'FAVORITES' },
      { name: 'Least Favorites', type: 'LEAST_FAVORITES' },
      { name: 'Want to Beat', type: 'WANT_TO_BEAT' },
    ])
  })

  it('copies the defaults rather than passing the shared constants', async () => {
    // Prisma mutating the payload would otherwise corrupt every later signup.
    await createUserForSignup(EMAIL, SUB)

    const { ratingCategories } = createData() as {
      ratingCategories: { create: unknown[] }
    }
    expect(ratingCategories.create[0]).not.toBe(DEFAULT_RATING_CATEGORIES[0])
    expect(ratingCategories.create[0]).toEqual({
      ...DEFAULT_RATING_CATEGORIES[0],
    })
  })

  it('returns the created row', async () => {
    const created = { id: 'user-1', onboardingCompleted: false }
    prisma.user.create.mockResolvedValue(created as never)

    await expect(createUserForSignup(EMAIL, SUB)).resolves.toBe(created)
  })
})
