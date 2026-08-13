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
}

export const CLUBSTEP: FixtureLevel = { inGameId: '14', name: 'Clubstep' }

export const THEORY_OF_EVERYTHING_2: FixtureLevel = {
  inGameId: '18',
  name: 'Theory of Everything 2',
}

export const DEADLOCKED: FixtureLevel = { inGameId: '20', name: 'Deadlocked' }

export const STEREO_MADNESS: FixtureLevel = {
  inGameId: '1',
  name: 'Stereo Madness',
}
