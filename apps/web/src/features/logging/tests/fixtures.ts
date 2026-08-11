// Builders for the logging flow's own shapes. Feature-local, same reasoning
// as the import / level-page / list fixtures.
//
// Not a spec file, so the `src/**/tests/*.spec.ts` glob does not collect it.

import type { ExistingCompletion, Level } from '@/lib/api/logging'
import type { MeData } from '@/lib/api/me'
import { emptyDraft, type FlowDraft } from '../types'

// Key-constrained but value-loose, same reasoning as the list fixtures: the
// wire types use core's nominal enums, and specs read better writing the
// literal forms.
type Loose<T> = Partial<Record<keyof T, unknown>>

/**
 * A resolved level. `coins`/`twoPlayer` gate whole sections of the payload.
 */
export function level(overrides: Loose<Level> = {}): Level {
  return {
    inGameId: '128',
    name: 'Bloodbath',
    creator: 'Riot',
    levelType: 'CLASSIC',
    inGameDifficulty: 'Extreme Demon',
    isDemon: true,
    isRated: true,
    coins: null,
    coinsVerified: null,
    twoPlayer: null,
    ...overrides,
  } as unknown as Level
}

/**
 * A flow draft. Starts from {@link emptyDraft} so a spec only states the
 * fields it cares about — but `date` is pinned rather than left as "today",
 * since a floating date would make payload assertions unstable.
 */
export function draft(overrides: Loose<FlowDraft> = {}): FlowDraft {
  return {
    ...emptyDraft(),
    date: '2026-03-14',
    timezone: 'UTC',
    worstFailTimezone: 'UTC',
    ...overrides,
  } as FlowDraft
}

/** The viewer's logging defaults, which fill in anything the draft left blank. */
export function me(overrides: Loose<MeData> = {}): MeData {
  return {
    id: 'user-1',
    ratingMode: 'SIMPLE',
    ratingCategories: [],
    defaultFps: null,
    defaultPercentageVersion: null,
    defaultDevice: null,
    ...overrides,
  } as unknown as MeData
}

/** A prior completion, as the resolve returns it for an edit-in-place. */
export function existingCompletion(
  overrides: Loose<ExistingCompletion> = {}
): ExistingCompletion {
  return {
    progressUpdateId: 'update-1',
    date: null,
    dateTimezone: null,
    dateUncertain: false,
    attempts: null,
    difficultyOpinion: null,
    enjoyment: null,
    worstFail: null,
    worstFailDate: null,
    worstFailDateTimezone: null,
    fps: null,
    percentageVersion: null,
    onStream: false,
    videoUrl: null,
    highlightUrl: null,
    notes: null,
    visibility: 'PUBLIC',
    device: null,
    simpleRating: null,
    ratingScores: [],
    coinsCollected: null,
    completionTime: null,
    userGddlTier: null,
    twoPlayerSolo: null,
    twoPlayerPartner: null,
    ...overrides,
  } as unknown as ExistingCompletion
}
