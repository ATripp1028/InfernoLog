// The levels the suite logs against.
//
// Fixtures seeded by `pnpm db:seed:e2e` rather than fetched, so nothing here
// depends on RobTop's servers being reachable. Their in-game ids sit above every
// real GD level id, so one can never collide with a level someone actually
// logs, and they carry `dataSource = 'e2e_fixture'` in the cache.
//
// They replaced the official levels, which the suite used for the same reason
// until all but three of them — the non-demons — stopped being levels the cache
// admits at all.
//
// ⚠️ These rows must never exist in production; the seed refuses to run against
// it. Mirrored from apps/api/src/scripts/e2eFixtures.ts, which is what actually
// seeds them and verifies they exist before a run. The two apps are separate
// workspaces with no dependency between them, so the constant cannot be
// imported across — change one and change the other.

/** A fixture level, as the UI shows it. */
export interface FixtureLevel {
  inGameId: string
  name: string
  creator: string
}

/** The creator every fixture carries. One word: the /search spec puts it
 * straight into a query string. */
export const E2E_CREATOR = 'InfernoLogE2E'

// The completion flow's level, and the first of the three the demon list
// orders. Nothing else logs against it.
export const ASHFALL: FixtureLevel = {
  inGameId: '990000001',
  name: 'E2E Ashfall',
  creator: E2E_CREATOR,
}

// The second demon list entry, so an insert has something to sort against.
export const BLACKGLASS: FixtureLevel = {
  inGameId: '990000002',
  name: 'E2E Blackglass',
  creator: E2E_CREATOR,
}

// The third demon list entry, and the one a placement reorders against.
export const CINDERPATH: FixtureLevel = {
  inGameId: '990000003',
  name: 'E2E Cinderpath',
  creator: E2E_CREATOR,
}

// The custom-collection spec's level. A collection is not about difficulty,
// so this one carries no other meaning.
export const DRIFTWOOD: FixtureLevel = {
  inGameId: '990000004',
  name: 'E2E Driftwood',
  creator: E2E_CREATOR,
}

// Only the Want to Beat handoff logs against this one. That spec completes it,
// and a completed level is not interchangeable with the ones above: it sinks
// below actionable rows in the find step and reopens the wizard on the
// existing completion instead of a fresh one.
export const EMBERFALL: FixtureLevel = {
  inGameId: '990000005',
  name: 'E2E Emberfall',
  creator: E2E_CREATOR,
}

// The progress path's level, and nothing else's. The spec logs a run against
// it and then edits that run, so it has to stay unbeaten.
export const FLINTLOCK: FixtureLevel = {
  inGameId: '990000006',
  name: 'E2E Flintlock',
  creator: E2E_CREATOR,
}

// The drop path's level, and nothing else's — a dropped level is not
// interchangeable with the ones above either.
export const GRAVEMIND: FixtureLevel = {
  inGameId: '990000007',
  name: 'E2E Gravemind',
  creator: E2E_CREATOR,
}

// The level-page edit path's level, and nothing else's. It is completed and
// then deleted by the spec that owns it.
//
// It carries secret coins, because the edit modal renders its coin picker only
// for a level that has any — so a stage whose fixtures predate the coin fields
// fails here rather than silently skipping them. Re-run `pnpm db:seed:e2e` if
// it does.
export const HOLLOWPOINT: FixtureLevel = {
  inGameId: '990000008',
  name: 'E2E Hollowpoint',
  creator: E2E_CREATOR,
}

// The level page's entry-deletion path. Two runs are logged against it and both
// are deleted, which deletes the level entry itself.
export const IRONVEIN: FixtureLevel = {
  inGameId: '990000009',
  name: 'E2E Ironvein',
  creator: E2E_CREATOR,
}

// The list-preset spec's pair, and nothing else's. That spec logs a run
// against one and drops the other, so the status filter its saved view stores
// has a row to keep as well as a row to hide. A preset whose only visible
// effect is an absence cannot tell "the filter applied" from "the list failed
// to load", which is why it takes two levels rather than one.
export const JACKDAW: FixtureLevel = {
  inGameId: '990000010',
  name: 'E2E Jackdaw',
  creator: E2E_CREATOR,
}

export const KILNWAKE: FixtureLevel = {
  inGameId: '990000011',
  name: 'E2E Kilnwake',
  creator: E2E_CREATOR,
}

// The import spec's pair, and nothing else's. The spreadsheet carries a
// completion row for each: one for a level the spec has already completed
// through the UI (so the row conflicts with a stored completion and the
// /check pass has something to report), and one for a level nothing has
// touched (so the same sheet also exercises a plain insert).
export const LONGSHADOW: FixtureLevel = {
  inGameId: '990000012',
  name: 'E2E Longshadow',
  creator: E2E_CREATOR,
}

// Only ever reached by its in-game id, from the sheet — the import spec never
// searches for it, so the wizard's find step never sees this one.
export const MOURNINGSTAR: FixtureLevel = {
  inGameId: '990000013',
  name: 'E2E Mourningstar',
  creator: E2E_CREATOR,
}

// The ranking spec's pair, and nothing else's. Both are logged with a rating
// of their own, so they cannot be shared for the usual reason — a completed
// level reopens the wizard on the existing completion rather than a fresh one.
//
// Both are **Medium Demon**, and that is the load-bearing part: the spec filters
// the ranking to that tier and then reads exact positions out of the filtered
// view, which only holds while these two are the only fixtures with it. No
// other fixture may be given Medium Demon, and a new spec that completes one
// breaks this one.
export const NIGHTJAR: FixtureLevel = {
  inGameId: '990000014',
  name: 'E2E Nightjar',
  creator: E2E_CREATOR,
}

export const OXBOW: FixtureLevel = {
  inGameId: '990000015',
  name: 'E2E Oxbow',
  creator: E2E_CREATOR,
}
