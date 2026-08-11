// Builders for the import wizard's own shapes — parsed sheet rows, /check
// conflicts, list merges, and the flow-context stub. Feature-local rather
// than in utils/testUtils because nothing outside the import specs has a use
// for them; the generic react-query stubs and level fixtures still come from
// there.
//
// Shared by every `tests/` directory under features/import — the feature root
// is the one place all three can reach. Not a spec file, so the
// `src/**/tests/*.spec.ts` glob does not collect it.

import { vi } from 'vitest'
import type {
  ImportListEntry,
  ImportListMerge,
  ImportRatingConflict,
  ImportRowConflict,
} from '@/lib/api/import'
import type {
  ParseFlag,
  ParseResult,
  ParsedCompletionRow,
  ParsedDroppedRow,
  ParsedListRow,
  ParsedProgressRow,
  ParsedRankingRow,
  ParsedRatingRow,
} from '../parseSpreadsheet'
import type { AllFlags } from '../importWizardModel'

/**
 * A parse flag. `severity: 'error'` is what excludes a row from every payload.
 */
export function flag(overrides: Partial<ParseFlag> = {}): ParseFlag {
  return {
    rowIndex: 0,
    rowLabel: 'row 2',
    field: 'levelId',
    message: 'Something is wrong',
    severity: 'error',
    ...overrides,
  }
}

/** A parsed Completions row. */
export function completionRow(
  overrides: Partial<ParsedCompletionRow> = {}
): ParsedCompletionRow {
  return {
    rowIndex: 0,
    data: { levelId: '128', levelName: 'Level 128' },
    flags: [],
    ...overrides,
  }
}

/** A parsed Progress row. */
export function progressRow(
  overrides: Partial<ParsedProgressRow> = {}
): ParsedProgressRow {
  return {
    rowIndex: 0,
    data: { levelId: '128', percentage: 42 },
    flags: [],
    ...overrides,
  }
}

/** A parsed Dropped row. */
export function droppedRow(
  overrides: Partial<ParsedDroppedRow> = {}
): ParsedDroppedRow {
  return {
    rowIndex: 0,
    data: { levelId: '128', bestProgress: 42 },
    flags: [],
    ...overrides,
  }
}

/** A parsed Ranking row. */
export function rankingRow(
  overrides: Partial<ParsedRankingRow> = {}
): ParsedRankingRow {
  return {
    rowIndex: 0,
    levelId: '128',
    levelName: 'Level 128',
    rank: null,
    flags: [],
    ...overrides,
  }
}

/** A parsed Lists row. */
export function listRow(overrides: Partial<ParsedListRow> = {}): ParsedListRow {
  return {
    rowIndex: 0,
    list: 'Favorites',
    levelId: '128',
    levelName: 'Level 128',
    creator: null,
    inGameDifficulty: null,
    position: 0,
    flags: [],
    ...overrides,
  }
}

/** A parsed Ratings row. Scores are keyed by category name, 0–100 internal. */
export function ratingRow(
  overrides: Partial<ParsedRatingRow> = {}
): ParsedRatingRow {
  return {
    rowIndex: 0,
    levelId: '128',
    levelName: 'Level 128',
    creator: null,
    inGameDifficulty: null,
    scores: { Gameplay: 80 },
    flags: [],
    ...overrides,
  }
}

/** A whole parsed workbook. Every tab defaults to empty. */
export function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    completions: [],
    progress: [],
    dropped: [],
    ranking: [],
    lists: [],
    ratings: [],
    ratingCategories: [],
    duplicateLevelIds: [],
    ...overrides,
  }
}

/** A Completions/Progress/Dropped field conflict from /check. */
export function rowConflict(
  overrides: Partial<ImportRowConflict> = {}
): ImportRowConflict {
  return {
    rowIndex: 0,
    levelId: '128',
    levelName: 'Level 128',
    matchedId: null,
    fields: [{ field: 'attempts', existingValue: 10, importedValue: 20 }],
    ...overrides,
  }
}

/** A per-category rating conflict from /check. */
export function ratingConflict(
  overrides: Partial<ImportRatingConflict> = {}
): ImportRatingConflict {
  return {
    levelId: '128',
    levelName: 'Level 128',
    categoryName: 'Gameplay',
    existingScore: 60,
    importedScore: 80,
    ...overrides,
  }
}

/** An ordered-list entry inside a merge. */
export function listEntry(levelId: string): ImportListEntry {
  return { levelId, levelName: `Level ${levelId}` }
}

/** An ordered-list merge for Ranking (`list: null`) or a collection. */
export function listMerge(
  overrides: Partial<ImportListMerge> = {}
): ImportListMerge {
  return {
    list: 'Favorites',
    mergedSeed: [],
    importedRemainder: [],
    existingRemainder: [],
    hasConflict: true,
    importedOrder: [listEntry('1'), listEntry('2')],
    existingOrder: [listEntry('2'), listEntry('1')],
    ...overrides,
  }
}

/**
 * Every tab's flag list, empty. What a clean parse produces.
 */
export const EMPTY_FLAGS: AllFlags = {
  completions: [],
  progress: [],
  dropped: [],
  ranking: [],
  lists: [],
  ratings: [],
  duplicates: [],
}

/**
 * A stand-in for the import flow context, which is the only thing the step
 * hooks read. Every callback is a spy; override whichever fields the test
 * under way depends on.
 *
 * Returned as a mutable object so a test can adjust a field before rendering
 * (`flow.skipConflictCheck = true`) without re-stubbing the whole module.
 */
export function importFlowStub(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    dateFormat: 'MDY',
    setDateFormat: vi.fn(),
    handleParsed: vi.fn(),
    parseResult: parseResult(),
    allFlags: EMPTY_FLAGS,
    handleSkipFlagged: vi.fn(),
    setStep: vi.fn(),
    skipConflictCheck: false,
    blanketOverride: false,
    setBlanketOverride: vi.fn(),
    ...overrides,
  }
}
