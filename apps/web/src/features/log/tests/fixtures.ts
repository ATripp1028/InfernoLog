// Builders for the Log page's own shapes. Feature-local, same reasoning as
// the import and level-page fixtures — nothing outside these specs needs them.
//
// Not a spec file, so the `src/**/tests/*.spec.ts` glob does not collect it.

import type { FilterState, LogItem } from '../types'
import { defaultFilterState } from '../types'

// Overrides are key-constrained but value-loose throughout. The wire types use
// packages/core's nominal enums and `z.coerce.date()` fields, so a spec writing
// `status: 'COMPLETED'` or `date: '2026-01-01'` — the literal forms that read
// clearly in a test — would not typecheck against them. Keys stay checked, so a
// typo'd field is still caught.
type Loose<T> = Partial<Record<keyof T, unknown>>

let seq = 0

/** The level metadata embedded in a list row. */
export function level(
  overrides: Loose<LogItem['level']> = {}
): LogItem['level'] {
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
  } as LogItem['level']
}

/** The representative progress update folded into a list row. */
export function entry(
  overrides: Loose<NonNullable<LogItem['entry']>> = {}
): NonNullable<LogItem['entry']> {
  return {
    progressUpdateId: `update-${seq++}`,
    kind: 'PROGRESS',
    date: null,
    dateTimezone: null,
    dateUncertain: false,
    attempts: null,
    percentage: null,
    runFrom: null,
    runTo: null,
    enjoyment: null,
    onStream: false,
    fps: null,
    percentageVersion: null,
    videoUrl: null,
    ...overrides,
  } as NonNullable<LogItem['entry']>
}

/**
 * One list row. `entry` defaults to a bare progress update — pass `entry: null`
 * for the rare status row with no logged updates at all.
 */
export function item(overrides: Loose<LogItem> = {}): LogItem {
  return {
    levelProgressId: `progress-${seq++}`,
    status: 'IN_PROGRESS',
    visibility: 'PUBLIC',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    worstFail: null,
    needsPlacement: false,
    userGddlTier: null,
    difficultyOpinion: null,
    overallRating: null,
    ratingScores: [],
    level: level(),
    entry: entry(),
    ...overrides,
  } as LogItem
}

/** A FilterState with every filter off, plus whatever the test constrains. */
export function filters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...defaultFilterState(), ...overrides }
}
