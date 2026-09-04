import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseSpreadsheet, type DateFormat } from '../parseSpreadsheet'

/**
 * Builds a real .xlsx buffer from arrays-of-arrays, one entry per tab, so the
 * spec exercises the actual SheetJS path the upload step uses rather than a
 * stand-in for it.
 */
function workbook(tabs: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(tabs)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const parse = (tabs: Record<string, unknown[][]>, format: DateFormat = 'MDY') =>
  parseSpreadsheet(workbook(tabs), format)

/** A Completions tab with the given rows under a fixed header. */
const completions = (
  headers: string[],
  ...rows: unknown[][]
): Record<string, unknown[][]> => ({ Completions: [headers, ...rows] })

/** The first completion row parsed from a one-row Completions tab. */
const oneCompletion = (
  headers: string[],
  row: unknown[],
  format: DateFormat = 'MDY'
) => parse(completions(headers, row), format).completions[0]!

/** Messages of the flags raised on `field`. */
const flagsFor = (
  row: { flags: { field: string; message: string; severity: string }[] },
  field: string
) => row.flags.filter((f) => f.field === field)

describe('workbook structure', () => {
  it('returns every tab empty for a workbook with no known sheets', () => {
    const result = parse({ Nonsense: [['a'], [1]] })

    expect(result).toEqual({
      completions: [],
      progress: [],
      dropped: [],
      ranking: [],
      ratingRanking: [],
      lists: [],
      ratings: [],
      ratingCategories: [],
      duplicateLevelIds: [],
      legacyTabs: [],
    })
  })

  // Users rename tabs when they round-trip a sheet through Google Sheets or
  // export from another tracker, so tab lookup cannot be case-sensitive.
  it.each(['Completions', 'completions', 'COMPLETIONS', 'CoMpLeTiOnS'])(
    'finds the completions tab named %s',
    (name) => {
      const result = parse({ [name]: [['level_id'], ['128']] })

      expect(result.completions).toHaveLength(1)
    }
  )

  // A tab under a retired name is not imported. Without the report it would
  // vanish in silence, because an absent tab legitimately means "leave this
  // data alone" — so the user would see a clean import that quietly dropped
  // their whole demon list.
  it('reports a Ranking tab as the retired name for Demon List', () => {
    const result = parse({ Ranking: [['level_id'], ['4']] })

    expect(result.ranking).toHaveLength(0)
    expect(result.legacyTabs).toEqual([
      { found: 'Ranking', expected: 'Demon List' },
    ])
  })

  it('does not report a legacy tab when the current one is present', () => {
    const result = parse({
      'Demon List': [['level_id'], ['4']],
      Ranking: [['level_id'], ['9']],
    })

    expect(result.ranking).toHaveLength(1)
    expect(result.legacyTabs).toEqual([])
  })

  // The Demon List and Ranking tabs are two orderings of the same completions.
  // Reading one into the other would quietly overwrite a user's difficulty
  // order with their quality one, or the reverse.
  it('keeps the two ordering tabs apart', () => {
    const result = parse({
      'Demon List': [['level_id'], ['111']],
      Ranking: [['level_id'], ['222']],
    })

    expect(result.ranking.map((r) => r.levelId)).toEqual(['111'])
    expect(result.ratingRanking.map((r) => r.levelId)).toEqual(['222'])
  })

  it('orders the Ranking tab by rank when every row carries one', () => {
    const result = parse({
      Ranking: [
        ['rank', 'level_id'],
        [2, '222'],
        [1, '111'],
      ],
    })

    expect(result.ratingRanking.map((r) => r.levelId)).toEqual(['111', '222'])
  })

  // A "Ranking" tab used to BE the demon list, before that tab was renamed, so
  // a workbook with one and no Demon List tab is genuinely ambiguous. It is
  // read as the rating order — the name's current meaning — and the ambiguity
  // is reported so a pre-rename export can be spotted.
  it('reports the ambiguity when only a Ranking tab is present', () => {
    const result = parse({ Ranking: [['level_id'], ['222']] })

    expect(result.ratingRanking).toHaveLength(1)
    expect(result.legacyTabs).toEqual([
      { found: 'Ranking', expected: 'Demon List' },
    ])
  })

  it('reports no ambiguity when both tabs are present', () => {
    const result = parse({
      'Demon List': [['level_id'], ['111']],
      Ranking: [['level_id'], ['222']],
    })

    expect(result.legacyTabs).toEqual([])
  })

  it('reads every tab it knows about', () => {
    const result = parse({
      Completions: [['level_id'], ['1']],
      Progress: [['level_id'], ['2']],
      Dropped: [['level_id'], ['3']],
      'Demon List': [['level_id'], ['4']],
      Lists: [
        ['list', 'level_id'],
        ['Favorites', '5'],
      ],
      Ratings: [
        ['level_id', 'Gameplay'],
        ['6', 9],
      ],
    })

    expect(result.completions).toHaveLength(1)
    expect(result.progress).toHaveLength(1)
    expect(result.dropped).toHaveLength(1)
    expect(result.ranking).toHaveLength(1)
    expect(result.lists).toHaveLength(1)
    expect(result.ratings).toHaveLength(1)
  })

  it('ignores a tab it does not recognize', () => {
    const result = parse({
      Completions: [['level_id'], ['1']],
      Notes: [['whatever'], ['ignored']],
    })

    expect(result.completions).toHaveLength(1)
  })

  it('handles a header-only tab', () => {
    expect(parse(completions(['level_id'])).completions).toEqual([])
  })

  it('numbers rows from zero within their own tab', () => {
    const result = parse(completions(['level_id'], ['1'], ['2'], ['3']))

    expect(result.completions.map((r) => r.rowIndex)).toEqual([0, 1, 2])
  })
})

describe('column name normalisation', () => {
  // Headers are user-authored: spacing, casing, and separators all vary.
  it.each([
    'level_id',
    'Level ID',
    'LEVEL-ID',
    'level id',
    'Level_Id',
    'level   id',
  ])('reads the level id from a column named %s', (header) => {
    expect(oneCompletion([header], ['128']).data.levelId).toBe('128')
  })

  it('reads a multi-word column whatever its separator', () => {
    expect(oneCompletion(['Date Uncertain'], ['yes']).data.dateUncertain).toBe(
      true
    )
  })

  // Regression: normalizeKey used to collapse whitespace to '_' before
  // trimming, so a padded header became '_level_id_' and never matched
  // 'level_id'. Excel does not render a trailing space, so the column read as
  // absent and the row failed with "Missing level_id and level_name" — with
  // nothing on screen to explain why.
  it.each([
    ' level_id',
    'level_id ',
    '  level   id  ',
    '\tlevel_id\n',
    '_level_id_',
    '-level-id-',
  ])('matches the padded header %p', (header) => {
    expect(oneCompletion([header], ['128']).data.levelId).toBe('128')
  })

  it('raises no flag for a row whose header was padded', () => {
    expect(oneCompletion([' level_id '], ['128']).flags).toEqual([])
  })
})

describe('level identity', () => {
  it('accepts a numeric level id', () => {
    const row = oneCompletion(['level_id'], ['128'])

    expect(row.data.levelId).toBe('128')
    expect(row.flags).toEqual([])
  })

  // A non-numeric id is bad data, but a name still lets the server resolve
  // the level — so the row survives with a warning rather than being skipped.
  it('warns but keeps a non-numeric id when a name is present', () => {
    const row = oneCompletion(['level_id', 'level_name'], ['abc', 'Bloodbath'])

    expect(flagsFor(row, 'level_id')[0]!.severity).toBe('warning')
    expect(row.data.levelId).toBeNull()
    expect(row.data.levelName).toBe('Bloodbath')
  })

  it('errors on a non-numeric id with no name to fall back to', () => {
    const row = oneCompletion(['level_id'], ['abc'])

    expect(flagsFor(row, 'level_id')[0]!.severity).toBe('error')
  })

  it('warns that a name-only row will be resolved during import', () => {
    const row = oneCompletion(['level_name'], ['Bloodbath'])

    expect(flagsFor(row, 'level_id')[0]!.severity).toBe('warning')
  })

  it('errors on a row identifying no level at all', () => {
    const row = oneCompletion(['level_id', 'level_name'], ['', ''])

    expect(flagsFor(row, 'level_id')[0]!.severity).toBe('error')
  })
})

describe('row labels', () => {
  // Flags are shown to the user, so each names its row by the most
  // recognizable thing available.
  it('prefers the level name', () => {
    const row = oneCompletion(
      ['level_id', 'level_name', 'attempts'],
      ['abc', 'Bloodbath', 'lots']
    )

    expect(row.flags[0]!.rowLabel).toBe('Bloodbath')
  })

  it('falls back to the level id', () => {
    const row = oneCompletion(['level_id', 'attempts'], ['128', 'lots'])

    expect(row.flags[0]!.rowLabel).toBe('level 128')
  })

  // 1-based, counting the header as row 1 — what the user sees in Excel.
  it('falls back to the spreadsheet row number', () => {
    const result = parse(completions(['level_id'], [''], ['']))

    expect(result.completions[0]!.flags[0]!.rowLabel).toBe('row 2')
    expect(result.completions[1]!.flags[0]!.rowLabel).toBe('row 3')
  })
})

describe('dates', () => {
  const dateOf = (value: string, format: DateFormat) =>
    oneCompletion(['level_id', 'date'], ['128', value], format).data.date

  it.each([
    ['MDY', '03/14/2026'],
    ['DMY', '14/03/2026'],
    ['ISO', '2026-03-14'],
    ['YMD', '2026/03/14'],
  ] as const)('reads %s order', (format, value) => {
    expect(dateOf(value, format)).toBe('2026-03-14')
  })

  // The same digits mean different days depending on the stated format — this
  // is exactly why the user has to declare it on upload.
  it('reads an ambiguous date according to the stated format', () => {
    expect(dateOf('01/02/2026', 'MDY')).toBe('2026-01-02')
    expect(dateOf('01/02/2026', 'DMY')).toBe('2026-02-01')
  })

  it('accepts dashes and slashes interchangeably', () => {
    expect(dateOf('03-14-2026', 'MDY')).toBe('2026-03-14')
    expect(dateOf('2026/03/14', 'ISO')).toBe('2026-03-14')
  })

  it('pads single-digit months and days', () => {
    expect(dateOf('3/4/2026', 'MDY')).toBe('2026-03-04')
  })

  // GD released in 2013, so a two-digit year can only mean the 2000s.
  it('reads a two-digit year as the 2000s', () => {
    expect(dateOf('03/14/19', 'MDY')).toBe('2019-03-14')
  })

  it.each([
    ['a phrase date', 'early 2019'],
    ['a named month', 'April 5th 2019'],
    ['too few parts', '03/2026'],
    ['an impossible month', '13/14/2026'],
    ['an impossible day', '03/32/2026'],
  ])('drops %s with a warning, keeping the row', (_label, value) => {
    const row = oneCompletion(['level_id', 'date'], ['128', value])

    expect(flagsFor(row, 'date')[0]!.severity).toBe('warning')
    expect(row.data.date).toBeNull()
    // The rest of the row still imports.
    expect(row.data.levelId).toBe('128')
  })

  it.each([
    ['an empty cell', ''],
    ['a missing column', undefined],
  ])('raises nothing for %s', (_label, value) => {
    const row = oneCompletion(['level_id', 'date'], ['128', value])

    expect(flagsFor(row, 'date')).toEqual([])
  })

  // SheetJS hands back a JS Date for date-formatted cells. Reading it in UTC
  // would shift the day backwards for anyone west of Greenwich.
  it('reads a real date cell without shifting the day', () => {
    const result = parse({
      Completions: [
        ['level_id', 'date'],
        ['128', new Date(2026, 2, 14)],
      ],
    })

    expect(result.completions[0]!.data.date).toBe('2026-03-14')
  })
})

describe('numeric fields', () => {
  it('reads a plain number', () => {
    expect(
      oneCompletion(['level_id', 'attempts'], ['128', 4200]).data.attempts
    ).toBe(4200)
  })

  // "~10000" and friends are common in hand-kept sheets; the value is dropped
  // but the row still imports.
  it('drops a non-numeric attempts value with a warning', () => {
    const row = oneCompletion(['level_id', 'attempts'], ['128', '~10000'])

    expect(flagsFor(row, 'attempts')[0]!.severity).toBe('warning')
    expect(row.data.attempts).toBeNull()
  })

  it.each(['67%', '88 %', '67'])('reads the percentage %s', (value) => {
    const row = oneCompletion(['level_id', 'percentage'], ['128', value])

    expect(row.data.percentage).toBeGreaterThan(0)
    expect(flagsFor(row, 'percentage')).toEqual([])
  })

  it.each([
    ['percentage', 101],
    ['percentage', -1],
    ['run_from', 101],
    ['run_to', -5],
  ])('flags %s of %s as outside 0-100', (field, value) => {
    const row = oneCompletion(['level_id', field], ['128', value])

    expect(flagsFor(row, field)[0]!.message).toContain('outside 0-100')
  })

  it.each([
    ['enjoyment', 11],
    ['simple_rating', -1],
  ])('flags %s of %s as outside 0-10', (field, value) => {
    const row = oneCompletion(['level_id', field], ['128', value])

    expect(flagsFor(row, field)[0]!.message).toContain('outside 0-10')
  })

  it.each([0, 100])('accepts %s at the percentage boundary', (value) => {
    const row = oneCompletion(['level_id', 'percentage'], ['128', value])

    expect(flagsFor(row, 'percentage')).toEqual([])
  })
})

describe('difficulty opinion', () => {
  it('merges a not_demon_worthy opinion with its star count', () => {
    const row = oneCompletion(
      ['level_id', 'difficulty_opinion', 'difficulty_opinion_stars'],
      ['128', 'not_demon_worthy', 7]
    )

    expect(row.data.difficultyOpinion).toBe('SEVEN_STAR')
    expect(flagsFor(row, 'difficulty_opinion_stars')).toEqual([])
  })

  // The default is a guess at the user's own opinion, so it must be visible —
  // without the warning the row silently becomes "1★ Auto".
  it('warns when not_demon_worthy has no star count', () => {
    const row = oneCompletion(
      ['level_id', 'difficulty_opinion', 'difficulty_opinion_stars'],
      ['128', 'not_demon_worthy', '']
    )

    const flag = flagsFor(row, 'difficulty_opinion_stars')[0]!
    expect(flag.severity).toBe('warning')
    expect(flag.message).toContain('1★ Auto')
    expect(row.data.difficultyOpinion).toBe('AUTO')
  })

  it('warns when the column is absent entirely', () => {
    const row = oneCompletion(
      ['level_id', 'difficulty_opinion'],
      ['128', 'not_demon_worthy']
    )

    expect(flagsFor(row, 'difficulty_opinion_stars')[0]!.message).toContain(
      '1★ Auto'
    )
  })

  // An unusable value lands on the same default, and "value dropped" alone
  // never says what replaced it.
  it.each([['abc'], [42]])(
    'warns about the default when the star count %s is unusable',
    (value) => {
      const row = oneCompletion(
        ['level_id', 'difficulty_opinion', 'difficulty_opinion_stars'],
        ['128', 'not_demon_worthy', value]
      )

      const messages = flagsFor(row, 'difficulty_opinion_stars').map(
        (f) => f.message
      )
      expect(messages.some((m) => m.includes('1★ Auto'))).toBe(true)
      expect(row.data.difficultyOpinion).toBe('AUTO')
    }
  )

  // A demon-tier opinion carries no star count, so a blank column is normal
  // there and must stay silent.
  it('stays silent for a demon-tier opinion with no star count', () => {
    const row = oneCompletion(
      ['level_id', 'difficulty_opinion'],
      ['128', 'extreme']
    )

    expect(row.data.difficultyOpinion).toBe('EXTREME')
    expect(flagsFor(row, 'difficulty_opinion_stars')).toEqual([])
  })

  it('stays silent when there is no opinion at all', () => {
    const row = oneCompletion(['level_id', 'attempts'], ['128', 10])

    expect(flagsFor(row, 'difficulty_opinion_stars')).toEqual([])
  })
})

describe('boolean fields', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['yes', true],
    ['1', true],
    [1, true],
    ['false', false],
    ['no', false],
    ['0', false],
  ])('reads %s as %s', (value, expected) => {
    expect(
      oneCompletion(['level_id', 'on_stream'], ['128', value]).data.onStream
    ).toBe(expected)
  })

  it.each(['', 'maybe'])('reads %s as absent', (value) => {
    expect(
      oneCompletion(['level_id', 'on_stream'], ['128', value]).data.onStream
    ).toBeNull()
  })
})

describe('the demon list tab', () => {
  const rankingOrder = (rows: unknown[][]) =>
    parse({ 'Demon List': [['rank', 'level_id'], ...rows] }).ranking.map(
      (r) => r.levelId
    )

  // Rank numbers are authoritative only when every importable row has one;
  // otherwise the sheet's own row order is the ranking.
  it('sorts by rank when every row carries one', () => {
    expect(
      rankingOrder([
        [3, '3'],
        [1, '1'],
        [2, '2'],
      ])
    ).toEqual(['1', '2', '3'])
  })

  it('keeps sheet order when only some rows carry a rank', () => {
    expect(
      rankingOrder([
        [3, '3'],
        ['', '1'],
        [2, '2'],
      ])
    ).toEqual(['3', '1', '2'])
  })

  it('keeps sheet order when the tab has no rank column at all', () => {
    const result = parse({ 'Demon List': [['level_id'], ['3'], ['1'], ['2']] })

    expect(result.ranking.map((r) => r.levelId)).toEqual(['3', '1', '2'])
  })

  it('warns and falls back to row order for a non-numeric rank', () => {
    const result = parse({
      'Demon List': [
        ['rank', 'level_id'],
        ['first', '1'],
      ],
    })

    expect(
      result.ranking[0]!.flags.some(
        (f) => f.field === 'rank' && f.severity === 'warning'
      )
    ).toBe(true)
  })

  it('errors on a ranking row identifying no level', () => {
    const result = parse({
      'Demon List': [
        ['level_id', 'level_name'],
        ['', ''],
      ],
    })

    expect(result.ranking[0]!.flags[0]!.severity).toBe('error')
  })
})

describe('the ratings tab', () => {
  // The tab is "wide": every header that is not a level-identity column is a
  // rating category, discovered from the header row.
  it('discovers category columns from the header row', () => {
    const result = parse({
      Ratings: [
        ['level_id', 'level_name', 'creator', 'Gameplay', 'Design'],
        ['128', 'Bloodbath', 'Riot', 9, 8],
      ],
    })

    expect(result.ratingCategories).toEqual(['Gameplay', 'Design'])
  })

  it.each([
    'level_id',
    'level_name',
    'creator',
    'publisher',
    'level_author',
    'in_game_difficulty',
  ])('does not mistake the reserved column %s for a category', (header) => {
    const result = parse({
      Ratings: [
        [header, 'Gameplay'],
        ['x', 9],
      ],
    })

    expect(result.ratingCategories).toEqual(['Gameplay'])
  })

  it('matches reserved columns however they are cased or spaced', () => {
    const result = parse({
      Ratings: [
        ['Level ID', 'In Game Difficulty', 'Gameplay'],
        ['128', 'EXTREME_DEMON', 9],
      ],
    })

    expect(result.ratingCategories).toEqual(['Gameplay'])
  })

  // Same normalizeKey regression, seen from the other side: a padded reserved
  // column used to fall through the filter and be imported as a rating
  // category named " level_id ".
  it('does not turn a padded reserved column into a category', () => {
    const result = parse({
      Ratings: [
        [' level_id ', 'Gameplay'],
        ['128', 9],
      ],
    })

    expect(result.ratingCategories).toEqual(['Gameplay'])
    expect(result.ratings[0]!.levelId).toBe('128')
  })

  // The sheet may hold either scale; both normalize to the internal 0-100.
  it.each([
    [9.5, 95],
    [95, 95],
    [10, 100],
  ])('reads a score of %s as %s on the internal scale', (given, expected) => {
    const result = parse({
      Ratings: [
        ['level_id', 'Gameplay'],
        ['128', given],
      ],
    })

    expect(result.ratings[0]!.scores.Gameplay).toBe(expected)
  })

  it('leaves a level with no scores an empty score map', () => {
    const result = parse({
      Ratings: [
        ['level_id', 'Gameplay'],
        ['128', ''],
      ],
    })

    expect(result.ratings[0]!.scores).toEqual({})
  })
})

describe('the lists tab', () => {
  it('reads the collection name and level identity', () => {
    const result = parse({
      Lists: [
        ['list', 'level_id', 'level_name'],
        ['Favorites', '128', 'Bloodbath'],
      ],
    })

    expect(result.lists[0]).toMatchObject({
      list: 'Favorites',
      levelId: '128',
      levelName: 'Bloodbath',
    })
  })

  it('keeps rows in sheet order', () => {
    const result = parse({
      Lists: [
        ['list', 'level_id'],
        ['Favorites', '3'],
        ['Favorites', '1'],
      ],
    })

    expect(result.lists.map((r) => r.levelId)).toEqual(['3', '1'])
  })
})

describe('duplicate detection', () => {
  it('reports a level logged twice on the completions tab', () => {
    const result = parse(completions(['level_id'], ['128'], ['200'], ['128']))

    expect(result.duplicateLevelIds).toEqual([
      { tab: 'completions', levelId: '128', rows: [0, 2] },
    ])
  })

  it('reports every row a duplicated level appears on', () => {
    const result = parse(completions(['level_id'], ['128'], ['128'], ['128']))

    expect(result.duplicateLevelIds[0]!.rows).toEqual([0, 1, 2])
  })

  it('reports nothing when every level appears once', () => {
    const result = parse(completions(['level_id'], ['128'], ['200']))

    expect(result.duplicateLevelIds).toEqual([])
  })

  // Progress and Dropped are additive by design — many rows per level is the
  // expected shape there, not a mistake worth reporting.
  it.each(['Progress', 'Dropped'])(
    'does not report repeats on the additive %s tab',
    (tab) => {
      const result = parse({ [tab]: [['level_id'], ['128'], ['128']] })

      expect(result.duplicateLevelIds).toEqual([])
    }
  )

  it('cannot report a duplicate for rows with no level id', () => {
    const result = parse(
      completions(['level_name'], ['Bloodbath'], ['Bloodbath'])
    )

    expect(result.duplicateLevelIds).toEqual([])
  })
})

// The whole contract of the parser: bad data becomes a flag, never an
// exception, so the review step can show the user what will be skipped.
describe('resilience', () => {
  it('never throws on a workbook of entirely malformed rows', () => {
    expect(() =>
      parse({
        Completions: [
          ['level_id', 'date', 'attempts', 'percentage', 'enjoyment'],
          ['', 'sometime', 'many', 'most of it', 'great'],
          [null, null, null, null, null],
        ],
        'Demon List': [
          ['rank', 'level_id'],
          ['first', 'abc'],
        ],
        Lists: [
          ['list', 'level_id'],
          ['', ''],
        ],
        Ratings: [
          ['level_id', 'Gameplay'],
          ['', 'good'],
        ],
      })
    ).not.toThrow()
  })

  it('flags rather than drops a malformed row, so the user sees it', () => {
    const result = parse(completions(['level_id', 'attempts'], ['', 'many']))

    expect(result.completions).toHaveLength(1)
    expect(result.completions[0]!.flags.length).toBeGreaterThan(0)
  })

  // SheetJS is lenient enough to read arbitrary bytes as an empty workbook
  // rather than rejecting them, so the module doc's "only throws when the
  // file cannot be read as a workbook" never fires for these. The wizard sees
  // a valid parse with nothing in it — worth knowing, because the user gets
  // "0 rows" rather than "that is not a spreadsheet".
  it.each([
    ['arbitrary bytes', new TextEncoder().encode('not a spreadsheet').buffer],
    ['an empty file', new Uint8Array([]).buffer],
  ])('reads %s as an empty workbook rather than throwing', (_label, buffer) => {
    const result = parseSpreadsheet(buffer, 'MDY')

    expect(result.completions).toEqual([])
    expect(result.ranking).toEqual([])
    expect(result.ratingCategories).toEqual([])
  })
})
