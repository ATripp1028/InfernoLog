// Official Geometry Dash demons — the three RobTop main levels rated as demons.
//
// These are NOT served by RobTop's getGJLevels21, so they can never enter the
// cache via autofill — we seed them manually so they show up in name search and
// resolve as cache hits. Keyed by the synthetic sequential `inGameId` GD uses
// for its main levels, confirmed to return "-1" on the live server (no
// collision with real levels).
//
// The rest of the official levels (main soundtrack, Meltdown, World, SubZero)
// are non-demons, which the level cache doesn't admit (see
// services/levels/admission.ts), so they are not seeded.
//
// Names and song data come from GDBrowser's misc/music.json (authoritative).
// ⚠️ The demon TIERS are best-effort and NEED VERIFICATION. Correct them here,
// then re-run the seed.
//
// `officialSongId` is the raw key-12 index into OFFICIAL_SONGS (utils/robtop.ts);
// the seed derives songName/songAuthor from it.

/** A seeded official level's metadata. */
export interface OfficialLevel {
  inGameId: string
  name: string
  inGameDifficulty: string
  length: string
  // Index into OFFICIAL_SONGS.
  officialSongId: number
  // The game version the level released on (e.g. "1.6"). RobTop's API never
  // reports this for official levels, so we record it here.
  gameVersion: string
  // Secret-coin count. Every main level has 3.
  coins: number
}

/**
 * The official demons.
 *
 * RobTop's getGJLevels21 doesn't serve these, so they can never enter the cache
 * via autofill — the seed script writes them from here so they turn up in name
 * search and resolve as cache hits.
 */
export const OFFICIAL_LEVELS: OfficialLevel[] = [
  {
    inGameId: '14',
    name: 'Clubstep',
    inGameDifficulty: 'Easy Demon',
    length: 'Long',
    officialSongId: 13,
    gameVersion: '1.6',
    coins: 3,
  },
  {
    inGameId: '18',
    name: 'Theory of Everything 2',
    inGameDifficulty: 'Easy Demon',
    length: 'Long',
    officialSongId: 17,
    gameVersion: '1.9',
    coins: 3,
  },
  {
    inGameId: '20',
    name: 'Deadlocked',
    inGameDifficulty: 'Easy Demon',
    length: 'Long',
    officialSongId: 19,
    gameVersion: '2.0',
    coins: 3,
  },
]

/**
 * Lookup for serialization-time overrides (the list endpoint fills in the
 * version/coins official levels don't get from RobTop).
 */
export const OFFICIAL_LEVELS_BY_ID = new Map(
  OFFICIAL_LEVELS.map((l) => [l.inGameId, l])
)
