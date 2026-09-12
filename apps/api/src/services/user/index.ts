import { randomBytes } from 'crypto'
import prisma from '../../utils/prisma'
import { logger } from '../../utils/logger'

// The rating category seeded for every new user. One category at the full
// weight, so a level's weighted average is just the score the user typed —
// the simplest rating system the weighted one can express, and the starting
// point for anyone who wants to split it into several.
const DEFAULT_RATING_CATEGORIES = [
  { name: 'Overall', weight: 1, sortOrder: 0 },
] as const

// Want to Beat is a backlog rather than a ranking, so it starts unordered.
const DEFAULT_COLLECTIONS = [
  { name: 'Favorites', type: 'FAVORITES', ordering: 'ORDERED' },
  { name: 'Least Favorites', type: 'LEAST_FAVORITES', ordering: 'ORDERED' },
  { name: 'Want to Beat', type: 'WANT_TO_BEAT', ordering: 'UNORDERED' },
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
 * The rating categories seeded for every new user: a single "Overall" at
 * weight 1.00. Also re-seeded by the E2E reset script.
 */
export { DEFAULT_RATING_CATEGORIES }

/**
 * The built-in collections seeded for every new user (Favorites, Least
 * Favorites, Want to Beat). Also re-seeded by the E2E reset script, since a
 * user missing Want to Beat has no list for the completion paths to write to.
 */
export { DEFAULT_COLLECTIONS }
