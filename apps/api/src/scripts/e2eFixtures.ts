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
  /** Demon. The third ranking entry, and the one placement reorders against. */
  deadlocked: { inGameId: '20', name: 'Deadlocked' },
  /** Non-demon, for a custom collection that is not about difficulty. */
  stereoMadness: { inGameId: '1', name: 'Stereo Madness' },
  /**
   * The Want to Beat handoff's level, and nothing else's. That spec logs a
   * completion for it, so it deliberately does not share one with the specs
   * above: an already-completed level sinks below actionable ones in the find
   * step (lib/levelSearchResults.ts) and reopens the wizard on the existing
   * completion rather than a fresh one.
   */
  fingerdash: { inGameId: '21', name: 'Fingerdash' },
  /**
   * The progress path's level, and nothing else's. That spec logs a run
   * against it and then edits the run, so it has to stay unbeaten for the
   * same reason fingerdash is not shared.
   */
  electrodynamix: { inGameId: '15', name: 'Electrodynamix' },
  /** The drop path's level, and nothing else's. */
  hexagonForce: { inGameId: '16', name: 'Hexagon Force' },
  /**
   * The level page's edit path. Completed and then deleted by the spec that
   * owns it, so it is shared with nothing.
   */
  blastProcessing: { inGameId: '17', name: 'Blast Processing' },
  /**
   * The level page's entry-deletion path. Two runs are logged against it and
   * both are deleted, which removes the level entry itself.
   */
  geometricalDominator: { inGameId: '19', name: 'Geometrical Dominator' },
  /**
   * The list-preset spec's pair, and nothing else's. One ends up unbeaten and
   * one dropped, so the saved view's status filter has a row to keep as well
   * as a row to hide — a preset whose only visible effect is an absence
   * cannot tell "the filter applied" from "the list failed to load".
   */
  vikingArena: { inGameId: '24', name: 'Viking Arena' },
  powerTrip: { inGameId: '38', name: 'Power Trip' },
  /**
   * The spreadsheet import spec's pair, and nothing else's. One is completed
   * through the UI before the import runs, so the sheet's row for it
   * conflicts with a stored completion; the other is only ever named by the
   * sheet, so the same import also covers a plain insert.
   */
  airborneRobots: { inGameId: '25', name: 'Airborne Robots' },
  payload: { inGameId: '26', name: 'Payload' },
} as const

/** Every fixture level ID, in the order they are declared above. */
export const E2E_LEVEL_IDS = Object.values(E2E_LEVELS).map((l) => l.inGameId)
