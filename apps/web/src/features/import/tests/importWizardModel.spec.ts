import { describe, expect, it } from 'vitest'
import {
  CONFLICT_SUB_STEP_ORDER,
  EMPTY_ROW_RESOLUTIONS,
  RANKING_MERGE_KEY,
  STEP_ORDER,
  classifyCollectionName,
  conflictsToGroups,
  firstConflictSubStep,
  getValidRatingRows,
  overwriteListOrders,
  overwriteRatingResolutions,
  overwriteRowResolutions,
  ratingConflictGroupId,
  ratingConflictsToGroups,
} from '../importWizardModel'
import {
  flag,
  listEntry,
  listMerge,
  parseResult,
  ratingConflict,
  ratingRow,
  rowConflict,
} from './fixtures'

describe('classifyCollectionName', () => {
  // Mirrors the backend's classifyCollection, so a sheet naming a built-in
  // any of its accepted ways lands on the same target the server picked.
  it.each([
    ['Want to Beat', 'Want to Beat'],
    ['want to beat', 'Want to Beat'],
    ['want_to_beat', 'Want to Beat'],
    ['want-to-beat', 'Want to Beat'],
    ['WANTTOBEAT', 'Want to Beat'],
    ['  Want   To   Beat  ', 'Want to Beat'],
  ])('resolves %s to the Want to Beat built-in', (raw, expected) => {
    expect(classifyCollectionName(raw)).toBe(expected)
  })

  it.each([
    'Favorites',
    'Favourites',
    'favorite',
    'favourite',
    'FAVOURITES',
    'favor_ites',
  ])('resolves %s to Favorites, either spelling', (raw) => {
    expect(classifyCollectionName(raw)).toBe('Favorites')
  })

  it.each([
    'Least Favorites',
    'least favourites',
    'least_favorite',
    'LeastFavourite',
  ])('resolves %s to Least Favorites', (raw) => {
    expect(classifyCollectionName(raw)).toBe('Least Favorites')
  })

  it('leaves a custom collection name alone', () => {
    expect(classifyCollectionName('Extreme Demons')).toBe('Extreme Demons')
  })

  // Only the built-in aliases are normalized; a custom name keeps its casing
  // and inner spacing, because that is the collection the user actually named.
  it('preserves the casing and spacing of a custom name', () => {
    expect(classifyCollectionName('  My   Cool List ')).toBe('My   Cool List')
  })

  it('trims a custom name', () => {
    expect(classifyCollectionName('  Extreme Demons  ')).toBe('Extreme Demons')
  })

  it('does not mistake a near-miss for a built-in', () => {
    expect(classifyCollectionName('Want to Beat Later')).toBe(
      'Want to Beat Later'
    )
  })
})

describe('conflictsToGroups', () => {
  it('titles a group by the level name and subtitles it with the id', () => {
    const groups = conflictsToGroups([
      rowConflict({ rowIndex: 3, levelId: '128', levelName: 'Bloodbath' }),
    ])

    expect(groups[0]).toMatchObject({
      groupId: '3',
      title: 'Bloodbath',
      subtitle: 'ID 128',
    })
  })

  // Name-only sheets and unresolved ids both produce nameless conflicts; the
  // group still has to be identifiable in the resolver.
  it('falls back to the id when the level has no name', () => {
    const groups = conflictsToGroups([
      rowConflict({ levelId: '128', levelName: null }),
    ])

    expect(groups[0]!.title).toBe('Level 128')
  })

  // rowIndex, not levelId: a sheet can carry two rows for the same level.
  it('keys a group by its row index', () => {
    const groups = conflictsToGroups([
      rowConflict({ rowIndex: 0, levelId: '128' }),
      rowConflict({ rowIndex: 7, levelId: '128' }),
    ])

    expect(groups.map((g) => g.groupId)).toEqual(['0', '7'])
  })

  it('carries every field diff through', () => {
    const groups = conflictsToGroups([
      rowConflict({
        fields: [
          { field: 'attempts', existingValue: 10, importedValue: 20 },
          { field: 'percentage', existingValue: 50, importedValue: 75 },
        ],
      }),
    ])

    expect(groups[0]!.fields).toEqual([
      { field: 'attempts', existingValue: 10, importedValue: 20 },
      { field: 'percentage', existingValue: 50, importedValue: 75 },
    ])
  })

  it('maps an empty conflict list to no groups', () => {
    expect(conflictsToGroups([])).toEqual([])
  })
})

describe('rating conflict groups', () => {
  // A rating "row" bundles every category for one level, so a conflict is per
  // (level, category) — keying by row index would collapse them together.
  it('keys a group by level and category', () => {
    expect(
      ratingConflictGroupId(
        ratingConflict({ levelId: '128', categoryName: 'Gameplay' })
      )
    ).toBe('128::Gameplay')
  })

  it('keeps two categories on the same level distinct', () => {
    const groups = ratingConflictsToGroups([
      ratingConflict({ categoryName: 'Gameplay' }),
      ratingConflict({ categoryName: 'Design' }),
    ])

    expect(new Set(groups.map((g) => g.groupId)).size).toBe(2)
  })

  it('subtitles a group with the category and carries one score field', () => {
    const groups = ratingConflictsToGroups([
      ratingConflict({
        levelName: 'Bloodbath',
        categoryName: 'Design',
        existingScore: 60,
        importedScore: 80,
      }),
    ])

    expect(groups[0]).toMatchObject({
      title: 'Bloodbath',
      subtitle: 'Design',
      fields: [{ field: 'score', existingValue: 60, importedValue: 80 }],
    })
  })

  it('falls back to the id when the level has no name', () => {
    const groups = ratingConflictsToGroups([
      ratingConflict({ levelId: '128', levelName: null }),
    ])

    expect(groups[0]!.title).toBe('Level 128')
  })
})

// Blanket override ("imported always wins") synthesizes the exact resolutions
// a user would have produced by hand, so the backend sees no difference.
describe('blanket-override resolutions', () => {
  it('resolves every row conflict to overwrite, keyed by row index', () => {
    const map = overwriteRowResolutions([
      rowConflict({ rowIndex: 0 }),
      rowConflict({ rowIndex: 5 }),
    ])

    expect([...map.keys()]).toEqual(['0', '5'])
    expect(map.get('0')).toEqual({ resolution: 'overwrite', values: {} })
  })

  // Empty `values` is load-bearing: it means "no per-field override", so the
  // row's already-parsed imported data stands.
  it('overrides no individual fields', () => {
    const map = overwriteRowResolutions([rowConflict()])

    expect(map.get('0')!.values).toEqual({})
  })

  it('resolves every rating conflict to overwrite, keyed by level and category', () => {
    const map = overwriteRatingResolutions([
      ratingConflict({ levelId: '128', categoryName: 'Gameplay' }),
      ratingConflict({ levelId: '200', categoryName: 'Design' }),
    ])

    expect([...map.keys()]).toEqual(['128::Gameplay', '200::Design'])
    expect(map.get('128::Gameplay')).toEqual({
      resolution: 'overwrite',
      values: {},
    })
  })

  it.each([
    ['row', overwriteRowResolutions],
    ['rating', overwriteRatingResolutions],
  ])('produces nothing for no %s conflicts', (_label, build) => {
    expect(build([]).size).toBe(0)
  })

  describe('list orders', () => {
    it('takes the spreadsheet order for each collection', () => {
      const map = overwriteListOrders(
        [
          listMerge({
            list: 'Favorites',
            importedOrder: [listEntry('1'), listEntry('2')],
          }),
        ],
        null
      )

      expect(map.get('Favorites')).toEqual(['1', '2'])
    })

    // Ranking has no collection name, so it lands under a sentinel key that
    // no user-authored collection name can collide with.
    it('files the ranking merge under the sentinel key', () => {
      const map = overwriteListOrders(
        [],
        listMerge({
          list: null,
          importedOrder: [listEntry('9'), listEntry('8')],
        })
      )

      expect(map.get(RANKING_MERGE_KEY)).toEqual(['9', '8'])
      expect(RANKING_MERGE_KEY).toBe('__ranking__')
    })

    it('handles collections and ranking together', () => {
      const map = overwriteListOrders(
        [listMerge({ list: 'Favorites' }), listMerge({ list: 'Custom' })],
        listMerge({ list: null })
      )

      expect([...map.keys()]).toEqual([
        'Favorites',
        'Custom',
        RANKING_MERGE_KEY,
      ])
    })

    it('produces nothing when no list needed merging', () => {
      expect(overwriteListOrders([], null).size).toBe(0)
    })
  })
})

describe('getValidRatingRows', () => {
  it('keeps a row with an id and at least one score', () => {
    const result = parseResult({
      ratings: [ratingRow({ levelId: '128', scores: { Gameplay: 80 } })],
    })

    expect(getValidRatingRows(result)).toHaveLength(1)
  })

  // Name-only sheets are supported — the server resolves the level by name.
  it('keeps a name-only row', () => {
    const result = parseResult({
      ratings: [ratingRow({ levelId: null, levelName: 'Bloodbath' })],
    })

    expect(getValidRatingRows(result)).toHaveLength(1)
  })

  it('drops a row that identifies no level at all', () => {
    const result = parseResult({
      ratings: [ratingRow({ levelId: null, levelName: null })],
    })

    expect(getValidRatingRows(result)).toEqual([])
  })

  it('drops a row with no scores to import', () => {
    const result = parseResult({ ratings: [ratingRow({ scores: {} })] })

    expect(getValidRatingRows(result)).toEqual([])
  })

  it('drops a row carrying a parse error', () => {
    const result = parseResult({
      ratings: [ratingRow({ flags: [flag({ severity: 'error' })] })],
    })

    expect(getValidRatingRows(result)).toEqual([])
  })

  // A warning drops only the flagged value; the rest of the row still imports.
  it('keeps a row whose only flag is a warning', () => {
    const result = parseResult({
      ratings: [ratingRow({ flags: [flag({ severity: 'warning' })] })],
    })

    expect(getValidRatingRows(result)).toHaveLength(1)
  })

  it.each([
    ['a null parse result', null],
    ['a workbook with no ratings tab', parseResult()],
  ])('returns nothing for %s', (_label, result) => {
    expect(getValidRatingRows(result)).toEqual([])
  })
})

describe('firstConflictSubStep', () => {
  const none: never[] = []

  it.each([
    ['completions', [rowConflict()], none, none, none],
    ['progress', none, [rowConflict()], none, none],
    ['dropped', none, none, [rowConflict()], none],
    ['ratings', none, none, none, [ratingConflict()]],
  ])(
    'lands on %s when only that list has conflicts',
    (expected, completion, progress, dropped, ratings) => {
      expect(
        firstConflictSubStep(
          completion as never,
          progress as never,
          dropped as never,
          ratings as never
        )
      ).toBe(expected)
    }
  )

  // Sub-steps are visited in a fixed order and empty ones are skipped, so the
  // first non-empty list decides where the resolver opens.
  it('prefers the earliest non-empty sub-step', () => {
    expect(firstConflictSubStep([rowConflict()], [rowConflict()], [], [])).toBe(
      'completions'
    )
    expect(firstConflictSubStep([], [rowConflict()], [rowConflict()], [])).toBe(
      'progress'
    )
  })

  // Null is what tells the wizard to skip resolve-conflicts entirely.
  it('reports nothing to resolve when every list is empty', () => {
    expect(firstConflictSubStep([], [], [], [])).toBeNull()
  })

  it('only ever returns a declared sub-step', () => {
    const step = firstConflictSubStep([], [], [], [ratingConflict()])

    expect(CONFLICT_SUB_STEP_ORDER).toContain(step)
  })
})

describe('STEP_ORDER', () => {
  // checking-conflicts is the in-flight round trip that decides whether
  // resolve-conflicts is needed, so it shares that indicator slot rather than
  // flashing a later step as current and then stepping back.
  it('gives checking-conflicts and resolve-conflicts the same slot', () => {
    expect(STEP_ORDER['checking-conflicts']).toBe(
      STEP_ORDER['resolve-conflicts']
    )
  })

  // resolve-lists is reachable from either checking-conflicts or
  // resolve-conflicts, and must be a forward move from both.
  it('places resolve-lists after both of them', () => {
    expect(STEP_ORDER['resolve-lists']).toBeGreaterThan(
      STEP_ORDER['checking-conflicts']
    )
    expect(STEP_ORDER['resolve-lists']).toBeGreaterThan(
      STEP_ORDER['resolve-conflicts']
    )
  })

  it('advances monotonically through the happy path', () => {
    const path = [
      'upload',
      'review',
      'checking-conflicts',
      'resolve-lists',
      'committing',
      'success',
      'done',
    ] as const

    const orders = path.map((s) => STEP_ORDER[s])
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
  })
})

describe('EMPTY_ROW_RESOLUTIONS', () => {
  it('has an entry for every tab that can carry resolutions', () => {
    expect(Object.keys(EMPTY_ROW_RESOLUTIONS).sort()).toEqual([
      'completion',
      'dropped',
      'progress',
      'rating',
    ])
  })

  it('starts empty', () => {
    for (const map of Object.values(EMPTY_ROW_RESOLUTIONS)) {
      expect(map.size).toBe(0)
    }
  })
})
