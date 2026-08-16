// The levels the suite logs against.
//
// Official Geometry Dash levels on purpose: their in-game IDs are fixed and
// synthetic, and they enter the shared `levels` cache through
// `pnpm db:seed:official` rather than a fetch — so nothing here depends on
// RobTop's servers being reachable.
//
// Mirrored from apps/api/src/scripts/e2eFixtures.ts, which is what actually
// verifies these rows exist before a run. The two apps are separate
// workspaces with no dependency between them, so the constant cannot be
// imported across — change one and change the other.

/** A fixture level, as the UI shows it. */
export interface FixtureLevel {
  inGameId: string
  name: string
  creator: string
}

export const CLUBSTEP: FixtureLevel = {
  inGameId: '14',
  name: 'Clubstep',
  creator: 'RobTop',
}

export const THEORY_OF_EVERYTHING_2: FixtureLevel = {
  inGameId: '18',
  name: 'Theory of Everything 2',
  creator: 'RobTop',
}

export const DEADLOCKED: FixtureLevel = {
  inGameId: '20',
  name: 'Deadlocked',
  creator: 'RobTop',
}

export const STEREO_MADNESS: FixtureLevel = {
  inGameId: '1',
  name: 'Stereo Madness',
  creator: 'RobTop',
}

// Only the Want to Beat handoff logs against this one. That spec completes it,
// and a completed level is not interchangeable with the ones above: it sinks
// below actionable rows in the find step and reopens the wizard on the
// existing completion instead of a fresh one.
export const FINGERDASH: FixtureLevel = {
  inGameId: '21',
  name: 'Fingerdash',
  creator: 'RobTop',
}

// The progress path's level, and nothing else's. The spec logs a run against
// it and then edits that run, so it has to stay unbeaten: a level that already
// carries a completion reopens the wizard on the existing entry rather than a
// fresh one.
export const ELECTRODYNAMIX: FixtureLevel = {
  inGameId: '15',
  name: 'Electrodynamix',
  creator: 'RobTop',
}

// The drop path's level, and nothing else's — a dropped level is not
// interchangeable with the ones above either.
export const HEXAGON_FORCE: FixtureLevel = {
  inGameId: '16',
  name: 'Hexagon Force',
  creator: 'RobTop',
}
