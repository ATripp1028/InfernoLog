// Builders for the ranking board's own shapes. Feature-local, same reasoning
// as the other features' fixtures.
//
// Not a spec file, so the `src/**/tests/*.spec.ts` glob does not collect it.

import type {
  ClassicDemonListEntry,
  ClassicDemonListResponse,
  CommunityTiers,
  LevelListSummary,
  UnplacedDemonListEntry,
} from '@infernolog/core'

// Key-constrained but value-loose: the wire types use core's nominal enums,
// and specs read better writing the literal forms.
type Loose<T> = Partial<Record<keyof T, unknown>>

let seq = 0

/**
 * A level's community-list placements. Defaults to "on none of the lists", so
 * a spec names only the list it is about.
 */
export function tiers(overrides: Partial<CommunityTiers> = {}): CommunityTiers {
  return {
    gddlTier: null,
    aredlRank: null,
    aredlStatus: null,
    sheetTier: null,
    ...overrides,
  }
}

/** The level metadata a ranked row renders. */
export function level(overrides: Loose<LevelListSummary> = {}) {
  const inGameId = String(1000 + seq++)
  return {
    inGameId,
    name: `Level ${inGameId}`,
    creator: 'Creator',
    levelType: 'CLASSIC',
    inGameDifficulty: 'Extreme Demon',
    isDemon: true,
    isRated: true,
    featured: false,
    epicValue: 0,
    length: 'Long',
    songName: null,
    songAuthor: null,
    coins: null,
    coinsVerified: null,
    twoPlayer: null,
    gameVersion: null,
    ...overrides,
  } as LevelListSummary
}

/**
 * One placed row. `rank` is 1-based and hardest-first; `communityTiers` carries
 * the level's real list placements, whose GDDL tier the pre-scroll hint reads.
 */
export function placed(
  overrides: Loose<ClassicDemonListEntry> = {}
): ClassicDemonListEntry {
  const id = `progress-${seq++}`
  return {
    rank: 1,
    levelProgressId: id,
    listIndex: 1,
    level: level(),
    attempts: null,
    communityTiers: tiers(),
    ...overrides,
  } as ClassicDemonListEntry
}

/** One unplaced card — a completion with no ranking position yet. */
export function unplaced(
  overrides: Loose<UnplacedDemonListEntry> = {}
): UnplacedDemonListEntry {
  return {
    levelProgressId: `progress-${seq++}`,
    level: level(),
    attempts: null,
    communityTiers: tiers(),
    ...overrides,
  } as UnplacedDemonListEntry
}

/**
 * A ranked list built from ids, hardest first. Each row's rank matches its
 * position, which is what the unfiltered board renders.
 */
export function ranked(
  ids: string[],
  overrides: (
    id: string,
    i: number
  ) => Loose<ClassicDemonListEntry> = () => ({})
): ClassicDemonListEntry[] {
  return ids.map((id, i) =>
    placed({
      levelProgressId: id,
      rank: i + 1,
      ...overrides(id, i),
    })
  )
}

/** The whole ranking payload. */
export function demonListData(
  overrides: Partial<ClassicDemonListResponse> = {}
): ClassicDemonListResponse {
  return { placed: [], unplaced: [], ...overrides } as ClassicDemonListResponse
}
