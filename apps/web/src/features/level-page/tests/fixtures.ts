// Builders for the level page's own shapes. Feature-local, same reasoning as
// features/import/tests/fixtures.ts — nothing outside these specs needs them.
//
// Not a spec file, so the `src/**/tests/*.spec.ts` glob does not collect it.

import type {
  LevelMeta,
  LevelPageData,
  ProgressUpdate,
  RunsGraphEntry,
} from '@/lib/api/levelPage'

/** The level metadata the page renders. */
export function levelMeta(overrides: Partial<LevelMeta> = {}): LevelMeta {
  return {
    inGameId: '128',
    name: 'Bloodbath',
    creator: 'Riot',
    levelType: 'CLASSIC',
    inGameDifficulty: 'EXTREME_DEMON',
    isDemon: true,
    isRated: true,
    featured: false,
    epicValue: 0,
    length: 'LONG',
    songName: null,
    songAuthor: null,
    coins: null,
    coinsVerified: null,
    twoPlayer: null,
    officialSongId: null,
    ...overrides,
  }
}

let updateSeq = 0

/**
 * One logged event. Defaults to a plain progress session — pass
 * `kind: 'COMPLETION'` or `'DROP'` for the others.
 */
export function progressUpdate(
  overrides: Partial<ProgressUpdate> = {}
): ProgressUpdate {
  return {
    progressUpdateId: `update-${updateSeq++}`,
    kind: 'PROGRESS',
    percentage: 42,
    runFrom: null,
    runTo: null,
    attempts: 100,
    date: '2026-03-14',
    dateTimezone: null,
    dateUncertain: false,
    onStream: false,
    fps: null,
    percentageVersion: null,
    enjoyment: null,
    notes: null,
    videoUrl: null,
    highlightUrl: null,
    loggedAt: '2026-03-14T10:00:00.000Z',
    twoPlayerSolo: null,
    twoPlayerPartner: null,
    device: null,
    ...overrides,
  }
}

/** One bar on the runs graph. */
export function runsGraphEntry(
  overrides: Partial<RunsGraphEntry> = {}
): RunsGraphEntry {
  return {
    progressUpdateId: 'update-1',
    kind: 'from_zero',
    from: 0,
    to: 42,
    date: '2026-03-14',
    droppedAfter: false,
    ...overrides,
  }
}

/**
 * The whole level page payload. `levelProgressId` non-null is what marks the
 * viewer as the owner.
 */
export function levelPageData(
  overrides: Partial<LevelPageData> = {}
): LevelPageData {
  return {
    levelProgressId: 'progress-1',
    status: 'IN_PROGRESS',
    visibility: 'PUBLIC',
    levelNotes: null,
    worstFail: null,
    worstFailDate: null,
    worstFailDateTimezone: null,
    userGddlTier: null,
    difficultyOpinion: null,
    simpleRating: null,
    ratingScores: [],
    coinsCollected: null,
    completionTime: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    listIndex: null,
    rankPosition: null,
    completionVideoUrl: null,
    completionHighlightUrl: null,
    level: levelMeta(),
    progressUpdates: [],
    runsGraph: [],
    ...overrides,
  }
}
