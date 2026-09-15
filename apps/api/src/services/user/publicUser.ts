import type { Prisma } from '@prisma/client'

/**
 * The filter every public read of other users must include.
 *
 * An account is invisible to everyone but its owner until onboarding is
 * complete. Before that it still carries the placeholder username built from
 * its email's local part (see `createUserForSignup`), so surfacing it would
 * surface part of the address.
 *
 * No public user reads exist yet (profiles, leaderboards, and other users'
 * collections are planned under `routes/users/`). Every one of them must merge
 * this into its `where` — `{ ...publicUserWhere, username }` — rather than
 * restating the condition, so a later change to what counts as public reaches
 * all of them at once.
 */
export const publicUserWhere = {
  onboardingCompleted: true,
} as const satisfies Prisma.UserWhereInput

/**
 * {@link publicUserWhere} merged with a caller's own conditions.
 *
 * The public filter is applied last, so a caller's `where` can narrow the
 * result but never widen it back to include unfinished accounts.
 *
 * @param where - The read's own conditions, e.g. `{ username }`.
 */
export function publicUsers(
  where: Prisma.UserWhereInput = {}
): Prisma.UserWhereInput {
  return { ...where, ...publicUserWhere }
}
