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
 * Whether an address is on a domain reserved for documentation and testing,
 * which can never receive mail and so can never be verified by a real signup.
 */
export function isReservedTestDomain(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1)
  return (
    ['example.com', 'example.net', 'example.org'].includes(domain) ||
    /\.(test|example|invalid)$/.test(domain)
  )
}

/**
 * The E2E user's email, doubling as its Cognito sign-in alias. Required rather
 * than defaulted so a mistyped environment can never resolve to a real user.
 */
export function requireE2eEmail(): string {
  // Lowercased like every stored email (the lowercase_emails migration), so a
  // mixed-case env value still finds the row.
  const email = process.env.E2E_USER_EMAIL?.trim().toLowerCase()
  if (!email) {
    throw new Error('E2E_USER_EMAIL is required and has no default.')
  }
  // A blast-radius guard, not validation: whatever else is misconfigured, the
  // scripts can only ever delete rows belonging to an address that no real
  // user can hold. The `e2e+` prefix alone stopped being enough once anyone
  // could sign up with an email and password — `e2e+me@gmail.com` is a real,
  // registrable address. So the domain must also be one reserved for testing
  // (RFC 2606 / RFC 6761): nothing receives mail there, so nobody can verify it
  // at signup, and Google accounts cannot have one either.
  if (!email.startsWith('e2e+') || !isReservedTestDomain(email)) {
    throw new Error(
      `Refusing to operate on ${email}: the E2E user's email must start with "e2e+" and use a reserved test domain (example.com, example.net, example.org, or a .test / .example / .invalid domain).`
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

/** A fixture level as the seed writes it into the `levels` cache. */
export interface E2eFixtureLevel {
  inGameId: string
  name: string
  /** A demon tier: the cache admits no rated non-demon. */
  inGameDifficulty: string
  /** Secret coins, so the edit modal renders its coin picker. */
  coins: number
}

/**
 * The creator every seeded fixture carries. Distinctive on purpose: a creator
 * search for it is how the /search spec gets a result set it owns, and it makes
 * a fixture obvious wherever one turns up. One word, because the /search spec
 * puts it straight into a query string.
 */
export const E2E_CREATOR = 'InfernoLogE2E'

/**
 * The id every fixture level sits above.
 *
 * Real GD level ids are nowhere near this, so a fixture can never collide with
 * a level someone actually logs, and an id in this range is self-evidently not
 * a real level. Paired with `dataSource = 'e2e_fixture'`, which is what the
 * level sync and the community rotation key their exclusions on.
 */
export const E2E_LEVEL_ID_FLOOR = 990_000_000

/**
 * Levels the suite logs against.
 *
 * Seeded by `pnpm db:seed:e2e` rather than fetched, so nothing in the suite
 * depends on RobTop's servers being reachable — the same reason the suite used
 * to log against official levels. It no longer can: all but three official
 * levels are non-demons, which the cache no longer admits.
 *
 * ⚠️ These rows must never exist in production. The seed refuses to run against
 * it; see scripts/seedE2eLevels.ts.
 */
export const E2E_LEVELS = {
  /**
   * The completion + demon list flows' three levels. The first is what the
   * completion flow logs against; the other two give inserts something to sort
   * against, and the third is the one placement reorders against.
   */
  completion: {
    inGameId: '990000001',
    name: 'E2E Ashfall',
    inGameDifficulty: 'Extreme Demon',
    coins: 3,
  },
  listSecond: {
    inGameId: '990000002',
    name: 'E2E Blackglass',
    inGameDifficulty: 'Insane Demon',
    coins: 3,
  },
  listThird: {
    inGameId: '990000003',
    name: 'E2E Cinderpath',
    inGameDifficulty: 'Hard Demon',
    coins: 3,
  },
  /** For a custom collection that is not about difficulty. */
  collection: {
    inGameId: '990000004',
    name: 'E2E Driftwood',
    inGameDifficulty: 'Easy Demon',
    coins: 3,
  },
  /**
   * The Want to Beat handoff's level, and nothing else's. That spec logs a
   * completion for it, so it deliberately does not share one with the levels
   * above: an already-completed level sinks below actionable ones in the find
   * step (lib/levelSearchResults.ts) and reopens the wizard on the existing
   * completion rather than a fresh one.
   */
  wantToBeat: {
    inGameId: '990000005',
    name: 'E2E Emberfall',
    inGameDifficulty: 'Insane Demon',
    coins: 3,
  },
  /**
   * The progress path's level, and nothing else's. That spec logs a run
   * against it and then edits the run, so it has to stay unbeaten for the
   * same reason the handoff level is not shared.
   */
  progress: {
    inGameId: '990000006',
    name: 'E2E Flintlock',
    inGameDifficulty: 'Hard Demon',
    coins: 3,
  },
  /** The drop path's level, and nothing else's. */
  drop: {
    inGameId: '990000007',
    name: 'E2E Gravemind',
    inGameDifficulty: 'Extreme Demon',
    coins: 3,
  },
  /**
   * The level page's edit path. Completed and then deleted by the spec that
   * owns it, so it is shared with nothing. It carries coins because the edit
   * modal renders its coin picker only for a level that has any.
   */
  pageEdit: {
    inGameId: '990000008',
    name: 'E2E Hollowpoint',
    inGameDifficulty: 'Insane Demon',
    coins: 3,
  },
  /**
   * The level page's entry-deletion path. Two runs are logged against it and
   * both are deleted, which removes the level entry itself.
   */
  pageDelete: {
    inGameId: '990000009',
    name: 'E2E Ironvein',
    inGameDifficulty: 'Hard Demon',
    coins: 3,
  },
  /**
   * The list-preset spec's pair, and nothing else's. One ends up unbeaten and
   * one dropped, so the saved view's status filter has a row to keep as well
   * as a row to hide — a preset whose only visible effect is an absence
   * cannot tell "the filter applied" from "the list failed to load".
   */
  presetA: {
    inGameId: '990000010',
    name: 'E2E Jackdaw',
    inGameDifficulty: 'Easy Demon',
    coins: 3,
  },
  presetB: {
    inGameId: '990000011',
    name: 'E2E Kilnwake',
    inGameDifficulty: 'Easy Demon',
    coins: 3,
  },
  /**
   * The spreadsheet import spec's pair, and nothing else's. One is completed
   * through the UI before the import runs, so the sheet's row for it
   * conflicts with a stored completion; the other is only ever named by the
   * sheet, so the same import also covers a plain insert.
   */
  importA: {
    inGameId: '990000012',
    name: 'E2E Longshadow',
    inGameDifficulty: 'Insane Demon',
    coins: 3,
  },
  importB: {
    inGameId: '990000013',
    name: 'E2E Mourningstar',
    inGameDifficulty: 'Hard Demon',
    coins: 3,
  },
  /**
   * The ranking spec's pair, and nothing else's. Each is logged with a rating
   * of its own, so neither can be shared: a completed level reopens the
   * wizard on the existing completion rather than a fresh one.
   *
   * Both are MEDIUM DEMON, and the only fixtures that are. The spec filters
   * the ranking down to that tier to read exact positions out of a population
   * it fully controls, so giving any other fixture that tier breaks it. See
   * the note beside them in apps/web/e2e/fixtures/levels.ts.
   */
  rankingA: {
    inGameId: '990000014',
    name: 'E2E Nightjar',
    inGameDifficulty: 'Medium Demon',
    coins: 3,
  },
  rankingB: {
    inGameId: '990000015',
    name: 'E2E Oxbow',
    inGameDifficulty: 'Medium Demon',
    coins: 3,
  },
} as const satisfies Record<string, E2eFixtureLevel>

/**
 * Filler fixtures, which no spec names.
 *
 * They exist so a creator search for {@link E2E_CREATOR} overflows one page of
 * results (browse.ts's PAGE_SIZE is 30) on any stage, whatever else is cached
 * there. That overflow is the whole subject of the /search spec's cursor
 * assertions, and it used to come free from the 38 seeded official levels.
 */
export const E2E_FILLER_LEVELS: E2eFixtureLevel[] = Array.from(
  { length: 20 },
  (_, i) => ({
    inGameId: String(990_000_100 + i),
    name: `E2E Filler ${String(i + 1).padStart(2, '0')}`,
    inGameDifficulty: 'Extreme Demon',
    coins: 0,
  })
)

/** Every fixture level the seed writes: the named ones plus the fillers. */
export const E2E_SEED_LEVELS: E2eFixtureLevel[] = [
  ...Object.values(E2E_LEVELS),
  ...E2E_FILLER_LEVELS,
]

/** Every fixture level ID, in the order they are declared above. */
export const E2E_LEVEL_IDS = Object.values(E2E_LEVELS).map((l) => l.inGameId)
