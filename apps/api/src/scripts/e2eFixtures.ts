// Shared constants for the two E2E scripts (provisionE2eUser / resetE2eUser).
// The Playwright suite mirrors the level IDs in apps/web/e2e/fixtures/levels.ts
// — see the note there for why they are not imported across the app boundary.
//
// Nothing here is imported by the API itself; these modules only ever run from
// the command line.

/**
 * The stage the E2E suite is allowed to touch is always an explicit input, and
 * production is never a legal value. Both scripts call {@link assertNotProduction}
 * before opening a connection.
 */
export function assertNotProduction(stage: string | undefined): string {
  if (!stage) {
    throw new Error(
      'E2E_STAGE is required and has no default. Set it to the stage you mean, e.g. E2E_STAGE=staging.'
    )
  }
  if (stage === 'production') {
    throw new Error(
      'Refusing to run: the E2E suite must never point at production.'
    )
  }
  return stage
}

/**
 * The E2E user's email, doubling as its Cognito sign-in alias. Required rather
 * than defaulted so a mistyped environment can never resolve to a real user.
 */
export function requireE2eEmail(): string {
  const email = process.env.E2E_USER_EMAIL
  if (!email) {
    throw new Error('E2E_USER_EMAIL is required and has no default.')
  }
  // A blast-radius guard, not validation: whatever else is misconfigured, the
  // scripts can only ever delete rows belonging to an address marked as a test
  // account. Ordinary users cannot hold an address in this namespace because
  // sign-up derives the email from Google.
  if (!email.startsWith('e2e+')) {
    throw new Error(
      `Refusing to operate on ${email}: the E2E user's email must start with "e2e+".`
    )
  }
  return email
}

/**
 * The connection target as `user@host/database`, for logging.
 *
 * Printed before the first query so a connection failure says which database
 * was tried. Postgres reports a bad password as "password authentication
 * failed for user X" and nothing else, which is indistinguishable between "the
 * password is wrong" and "this is the wrong database entirely" — and the
 * second is by far the more common mistake here.
 *
 * The password is never included, and an unparseable URL is reported as such
 * rather than echoed, so this can never print a credential.
 */
export function describeDatabaseUrl(url: string | undefined): string {
  if (!url) return '(DATABASE_URL is not set)'
  try {
    const parsed = new URL(url)
    return `${parsed.username}@${parsed.host}${parsed.pathname}`
  } catch {
    return '(DATABASE_URL is not a parseable URL)'
  }
}

/**
 * Levels the suite logs against. Official levels (see data/officialLevels.ts)
 * on purpose: their IDs are fixed and synthetic, they are seeded by
 * `pnpm db:seed:official` rather than fetched, so nothing in the suite depends
 * on RobTop's servers being reachable.
 */
export const E2E_LEVELS = {
  /** Demon. The level the completion + ranking flows log against. */
  clubstep: { inGameId: '14', name: 'Clubstep' },
  /** Demon. A second ranking entry, so inserts have something to sort against. */
  theoryOfEverything2: { inGameId: '18', name: 'Theory of Everything 2' },
  /** Demon. Reserved for the Want to Beat / collections flow. */
  deadlocked: { inGameId: '20', name: 'Deadlocked' },
  /** Non-demon, for a custom collection that is not about difficulty. */
  stereoMadness: { inGameId: '1', name: 'Stereo Madness' },
} as const

/** Every fixture level ID, in the order they are declared above. */
export const E2E_LEVEL_IDS = Object.values(E2E_LEVELS).map((l) => l.inGameId)
