import { randomBytes } from 'crypto'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'

// Default weighted-mode rating categories seeded for every new user (and
// backfilled the first time an existing SIMPLE-mode user switches to
// WEIGHTED — see PATCH /me). Weights sum to exactly 1.00.
const DEFAULT_RATING_CATEGORIES = [
  { name: 'Gameplay', weight: 0.34, sortOrder: 0 },
  { name: 'Decoration', weight: 0.33, sortOrder: 1 },
  { name: 'Song', weight: 0.33, sortOrder: 2 },
] as const

const DEFAULT_COLLECTIONS = [
  { name: 'Favorites', type: 'FAVORITES' },
  { name: 'Least Favorites', type: 'LEAST_FAVORITES' },
  { name: 'Want to Beat', type: 'WANT_TO_BEAT' },
] as const

/**
 * Creates the InfernoLog `User` row for a confirmed (age-gated) sign-up.
 * Idempotent: a double-submit (e.g. a duplicate call while the first is still
 * in flight) returns the already-created row instead of erroring, keyed by
 * cognitoSub since that's unique and known before the row exists.
 */
export async function createUserForSignup(email: string, cognitoSub: string) {
  const existing = await prisma.user.findUnique({ where: { cognitoSub } })
  if (existing) return existing

  const user = await prisma.user.create({
    data: {
      email,
      username: email.split('@')[0] + '_' + randomBytes(4).toString('hex'),
      cognitoSub,
      onboardingCompleted: false,
      ratingCategories: {
        create: DEFAULT_RATING_CATEGORIES.map((c) => ({ ...c })),
      },
      collections: { create: DEFAULT_COLLECTIONS.map((c) => ({ ...c })) },
    },
  })

  logger.info({ userId: user.id }, 'Created user for signup')
  return user
}

/**
 * Default weighted-mode rating categories (Gameplay / Decoration / Song,
 * weights summing to exactly 1.00). Seeded for every new user, and backfilled
 * the first time an existing SIMPLE-mode user switches to WEIGHTED — see
 * PATCH /v1/me.
 */
export { DEFAULT_RATING_CATEGORIES }
