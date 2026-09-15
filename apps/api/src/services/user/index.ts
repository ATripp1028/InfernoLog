import { randomBytes } from 'crypto'
import { Prisma, type AuthProvider } from '@prisma/client'
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
 * The address is already another account's email. The signing-up identity is
 * a different one (a matching identity returns its account instead), so this
 * is a second account being attempted on one address. Carries no address.
 */
export class SignupEmailTakenError extends Error {
  constructor() {
    super('Another account already uses this email')
    this.name = 'SignupEmailTakenError'
  }
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false
  }
  // The target's shape differs by driver: a field list, or the index name.
  return String(error.meta?.target ?? '').includes('email')
}

/**
 * Creates the InfernoLog `User` row for a confirmed (age-gated) sign-up.
 * Idempotent: a double-submit (e.g. a duplicate call while the first is still
 * in flight) returns the already-created row instead of erroring. The check is
 * keyed on the identity's Cognito sub, which is unique and known before the row
 * exists, and resolves through `AuthIdentity` like every other lookup.
 *
 * The row and its first `AuthIdentity` are created in one write, so no account
 * ever exists without the identity that signed it up.
 *
 * @param email - The address the provider asserted. Becomes the account's
 *   email and is also recorded on the identity, lowercased: every stored email
 *   is lowercase, and the database's CHECK constraints refuse anything else.
 * @param cognitoSub - The Cognito sub of the identity signing up.
 * @param provider - Which sign-in method that identity is, read from the
 *   verified token by the caller (`signupProviderFromClaims`).
 * @throws {SignupEmailTakenError} When a different account already has the
 *   email. Accounts are never merged or attached by email.
 */
export async function createUserForSignup(
  email: string,
  cognitoSub: string,
  provider: AuthProvider
) {
  const existing = await prisma.authIdentity.findUnique({
    where: { cognitoSub },
    select: { user: true },
  })
  if (existing) return existing.user

  const address = email.trim().toLowerCase()
  const user = await prisma.user
    .create({
      data: {
        email: address,
        username: address.split('@')[0] + '_' + randomBytes(4).toString('hex'),
        authIdentities: { create: { provider, cognitoSub, email: address } },
        onboardingCompleted: false,
        ratingCategories: {
          create: DEFAULT_RATING_CATEGORIES.map((c) => ({ ...c })),
        },
        collections: { create: DEFAULT_COLLECTIONS.map((c) => ({ ...c })) },
      },
    })
    .catch((error: unknown) => {
      // Checked by the constraint rather than a lookup first, so two signups
      // racing for one address cannot both pass.
      if (isEmailUniqueViolation(error)) throw new SignupEmailTakenError()
      throw error
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
