import { describe, expect, it } from 'vitest'
import type { RatingCategory } from '@/lib/api/me'
import {
  COLUMNS,
  defaultColumnOrder,
  defaultColumnVisibility,
  getCategoryColumnDefs,
  type ColumnId,
} from '../columns'
import {
  DEFAULT_SORTS,
  PRESET_COLORS,
  cleanupPresetForCategories,
  defaultViewConfig,
  getContrastColor,
  getPresetColor,
  isDefaultConfig,
  summarizeColumns,
  summarizeFilters,
  summarizeSorts,
  viewConfigsEqual,
  type ViewConfig,
} from '../presets'
import { RATING_DOMAIN, TIER_DOMAIN } from '../types'
import { filters } from './fixtures'

const category = (id: string, sortOrder = 0, name = id): RatingCategory =>
  ({ id, name, sortOrder }) as RatingCategory

const config = (overrides: Partial<ViewConfig> = {}): ViewConfig => ({
  ...defaultViewConfig(),
  ...overrides,
})

describe('preset colours', () => {
  it('resolves every declared colour by id', () => {
    for (const c of PRESET_COLORS) {
      expect(getPresetColor(c.id)).toBe(c)
    }
  })

  it('declares each colour id exactly once', () => {
    const ids = PRESET_COLORS.map((c) => c.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  // A preset saved with a colour that was later removed must still render.
  it('falls back rather than returning nothing for an unknown id', () => {
    expect(getPresetColor('not-a-colour' as never)).toBeDefined()
  })
})

describe('getContrastColor', () => {
  it('puts white text on a dark background', () => {
    expect(getContrastColor('#000000')).toBe('#ffffff')
  })

  it('puts black text on a light background', () => {
    expect(getContrastColor('#ffffff')).toBe('#000000')
  })

  // Luminance is weighted per channel, so a saturated colour is not judged by
  // brightness alone — pure green reads far lighter than pure blue.
  it('weighs the channels rather than averaging them', () => {
    expect(getContrastColor('#00ff00')).toBe('#000000')
    expect(getContrastColor('#0000ff')).toBe('#ffffff')
  })

  it('picks a legible foreground for every preset colour', () => {
    for (const c of PRESET_COLORS) {
      expect(['#000000', '#ffffff']).toContain(getContrastColor(c.hex))
    }
  })
})

describe('viewConfigsEqual', () => {
  it('matches a config against itself', () => {
    expect(viewConfigsEqual(defaultViewConfig(), defaultViewConfig())).toBe(
      true
    )
  })

  it.each([
    ['sorts', { sorts: [{ key: 'name', dir: 'asc' } as const] }],
    ['filters', { filters: filters({ statuses: ['COMPLETED'] }) }],
    ['columns', { columns: { name: false } }],
    ['columnOrder', { columnOrder: ['tier'] as ColumnId[] }],
    ['hideTime', { hideTime: true }],
  ])('notices a change in %s', (_label, overrides) => {
    expect(
      viewConfigsEqual(defaultViewConfig(), config(overrides as never))
    ).toBe(false)
  })

  // Multi-selects are sets in spirit, so the order the user ticked them in
  // must not read as an unsaved change.
  it('ignores the order of a multi-select filter', () => {
    const a = config({
      filters: filters({ statuses: ['COMPLETED', 'DROPPED'] }),
    })
    const b = config({
      filters: filters({ statuses: ['DROPPED', 'COMPLETED'] }),
    })

    expect(viewConfigsEqual(a, b)).toBe(true)
  })

  // Sorts ARE ordered — they are a priority stack.
  it('respects the order of the sort stack', () => {
    const a = config({
      sorts: [
        { key: 'name', dir: 'asc' },
        { key: 'date', dir: 'desc' },
      ],
    })
    const b = config({
      sorts: [
        { key: 'date', dir: 'desc' },
        { key: 'name', dir: 'asc' },
      ],
    })

    expect(viewConfigsEqual(a, b)).toBe(false)
  })

  it('notices a direction change on the same sort key', () => {
    const a = config({ sorts: [{ key: 'date', dir: 'desc' }] })
    const b = config({ sorts: [{ key: 'date', dir: 'asc' }] })

    expect(viewConfigsEqual(a, b)).toBe(false)
  })

  it('respects the order of the columns', () => {
    const order = defaultColumnOrder()
    const swapped = [order[1]!, order[0]!, ...order.slice(2)]

    expect(
      viewConfigsEqual(defaultViewConfig(), config({ columnOrder: swapped }))
    ).toBe(false)
  })

  // A preset saved before a filter or column existed has no key for it, which
  // must compare equal to that field's inactive value rather than "different".
  it('treats a missing category range as its full domain', () => {
    const a = config({ filters: filters({ categoryRatings: {} }) })
    const b = config({
      filters: filters({ categoryRatings: { gameplay: [...RATING_DOMAIN] } }),
    })

    expect(viewConfigsEqual(a, b)).toBe(true)
  })

  it('still notices a constrained category against a missing one', () => {
    const a = config({ filters: filters({ categoryRatings: {} }) })
    const b = config({
      filters: filters({ categoryRatings: { gameplay: [50, 100] } }),
    })

    expect(viewConfigsEqual(a, b)).toBe(false)
  })

  it('treats a missing column key as hidden', () => {
    const a = config({ columns: { name: true, creator: false } })
    const b = config({ columns: { name: true } })

    expect(viewConfigsEqual(a, b)).toBe(true)
  })

  it('notices a date bound change', () => {
    expect(
      viewConfigsEqual(
        defaultViewConfig(),
        config({ filters: filters({ dateBeaten: { from: 1, to: null } }) })
      )
    ).toBe(false)
  })
})

describe('isDefaultConfig', () => {
  it('recognizes a fresh view', () => {
    expect(isDefaultConfig(defaultViewConfig())).toBe(true)
  })

  it('recognizes any change away from it', () => {
    expect(isDefaultConfig(config({ hideTime: true }))).toBe(false)
  })

  it('starts a fresh view sorted by date, newest first', () => {
    expect(defaultViewConfig().sorts).toEqual(DEFAULT_SORTS)
  })

  // A function rather than a shared constant, so one caller mutating its
  // config cannot corrupt the baseline every other comparison runs against.
  it('hands out an independent config each time', () => {
    const a = defaultViewConfig()
    a.filters.statuses.push('COMPLETED')

    expect(isDefaultConfig(defaultViewConfig())).toBe(true)
  })
})

describe('cleanupPresetForCategories', () => {
  const withCats = (overrides: Partial<ViewConfig>) => config(overrides)

  it('drops a column for a deleted category', () => {
    const result = cleanupPresetForCategories(
      withCats({ columns: { tier: true, 'cat:gone': true, 'cat:kept': true } }),
      new Set(['kept'])
    )

    expect(result.columns).toEqual({ tier: true, 'cat:kept': true })
  })

  it('drops a deleted category from the column order', () => {
    const result = cleanupPresetForCategories(
      withCats({ columnOrder: ['tier', 'cat:gone', 'cat:kept'] as ColumnId[] }),
      new Set(['kept'])
    )

    expect(result.columnOrder).toEqual(['tier', 'cat:kept'])
  })

  it('drops a sort on a deleted category', () => {
    const result = cleanupPresetForCategories(
      withCats({
        sorts: [
          { key: 'date', dir: 'desc' },
          { key: 'cat:gone', dir: 'desc' },
        ],
      }),
      new Set(['kept'])
    )

    expect(result.sorts).toEqual([{ key: 'date', dir: 'desc' }])
  })

  it('drops a range filter on a deleted category', () => {
    const result = cleanupPresetForCategories(
      withCats({
        filters: filters({
          categoryRatings: { gone: [50, 100], kept: [10, 100] },
        }),
      }),
      new Set(['kept'])
    )

    expect(result.filters.categoryRatings).toEqual({ kept: [10, 100] })
  })

  // A category added after the preset was saved still needs a column slot,
  // or it would be permanently unreachable from that preset.
  it('appends a column for a category the preset never saw', () => {
    const result = cleanupPresetForCategories(
      withCats({ columnOrder: ['tier'] as ColumnId[] }),
      new Set(['brandNew'])
    )

    expect(result.columnOrder).toEqual(['tier', 'cat:brandNew'])
  })

  it('appends nothing that is already in the order', () => {
    const result = cleanupPresetForCategories(
      withCats({ columnOrder: ['tier', 'cat:kept'] as ColumnId[] }),
      new Set(['kept'])
    )

    expect(result.columnOrder).toEqual(['tier', 'cat:kept'])
  })

  it('leaves the non-category parts of the view alone', () => {
    const original = withCats({
      hideTime: true,
      filters: filters({ statuses: ['COMPLETED'] }),
    })

    const result = cleanupPresetForCategories(original, new Set())

    expect(result.hideTime).toBe(true)
    expect(result.filters.statuses).toEqual(['COMPLETED'])
  })

  it('leaves the input untouched', () => {
    const original = withCats({
      columnOrder: ['tier', 'cat:gone'] as ColumnId[],
    })
    const before = [...original.columnOrder]

    cleanupPresetForCategories(original, new Set())

    expect(original.columnOrder).toEqual(before)
  })
})

// The hover card summarizes a preset through cleanupPresetForCategories rather
// than straight from storage, because each summarizer falls back to the raw key
// when it can't name a category — which renders a UUID where the name was.
// Deleting a category purges those references server-side; this pairing is what
// covers a preset written before that existed.
describe('summarizing a cleaned preset', () => {
  const GONE = 'gone-category-id'
  const KEPT = category('kept-category-id', 0, 'Gameplay')

  it('names no deleted category in any summary line', () => {
    const stored = config({
      sorts: [{ key: `cat:${GONE}`, dir: 'desc' }],
      filters: filters({ categoryRatings: { [GONE]: [40, 90] } }),
      columns: { ...defaultColumnVisibility(), [`cat:${GONE}`]: true },
      columnOrder: [...defaultColumnOrder(), `cat:${GONE}`] as ColumnId[],
    })

    const view = cleanupPresetForCategories(stored, new Set([KEPT.id]))
    const summaries = [
      summarizeSorts(view.sorts, [
        { key: `cat:${KEPT.id}`, label: KEPT.name },
      ]),
      ...summarizeFilters(view.filters, 'ZERO_TO_TEN', [KEPT]),
      summarizeColumns(
        view.columns,
        view.columnOrder,
        getCategoryColumnDefs([KEPT])
      ),
    ]

    expect(summaries.join(' | ')).not.toContain(GONE)
  })

  it('still names a category that survived', () => {
    const stored = config({
      sorts: [{ key: `cat:${KEPT.id}`, dir: 'desc' }],
    })

    const view = cleanupPresetForCategories(stored, new Set([KEPT.id]))

    expect(
      summarizeSorts(view.sorts, [{ key: `cat:${KEPT.id}`, label: KEPT.name }])
    ).toBe('Gameplay ↓')
  })
})

describe('summarizeSorts', () => {
  it('reads a single sort with its direction arrow', () => {
    expect(summarizeSorts([{ key: 'date', dir: 'desc' }])).toBe('Date ↓')
  })

  it('arrows an ascending sort the other way', () => {
    expect(summarizeSorts([{ key: 'name', dir: 'asc' }])).toBe('Name ↑')
  })

  it('joins a sort stack in priority order', () => {
    expect(
      summarizeSorts([
        { key: 'status', dir: 'asc' },
        { key: 'date', dir: 'desc' },
      ])
    ).toBe('Status ↑, Date ↓')
  })

  it('names a per-category sort from the options passed in', () => {
    expect(
      summarizeSorts(
        [{ key: 'cat:gameplay', dir: 'desc' }],
        [{ key: 'cat:gameplay', label: 'Gameplay' }]
      )
    ).toBe('Gameplay ↓')
  })

  it('says so when nothing is sorted', () => {
    expect(summarizeSorts([])).toBe('None')
  })
})

describe('summarizeFilters', () => {
  const lines = (overrides: Parameters<typeof filters>[0] = {}) =>
    summarizeFilters(filters(overrides), 'ZERO_TO_HUNDRED')

  it('says nothing about a view with no filters', () => {
    expect(lines()).toEqual([])
  })

  it.each([
    ['statuses', { statuses: ['COMPLETED'] }, 'Status: COMPLETED'],
    ['levelTypes', { levelTypes: ['CLASSIC'] }, 'Type: CLASSIC'],
    ['ratedStatus', { ratedStatus: 'EPIC' }, 'Rated: EPIC'],
    ['flags', { flags: ['onStream'] }, 'Flags: onStream'],
    ['lengths', { lengths: ['Long'] }, 'Length: Long'],
    [
      'difficulties',
      { difficulties: ['Easy Demon'] },
      'Difficulty: Easy Demon',
    ],
    ['gameVersions', { gameVersions: ['2.1'] }, 'Version: 2.1'],
    ['tier', { tier: [10, 20] }, 'Tier: 10–20'],
    ['attempts', { attempts: [100, 200] }, 'Attempts: 100–200'],
  ] as const)('describes %s', (_label, filter, expected) => {
    expect(lines(filter as never)).toContain(expected)
  })

  it('joins a multi-select selection', () => {
    expect(lines({ statuses: ['COMPLETED', 'DROPPED'] })).toContain(
      'Status: COMPLETED, DROPPED'
    )
  })

  it('says nothing about a rated status of ALL', () => {
    expect(lines({ ratedStatus: 'ALL' })).toEqual([])
  })

  it('says nothing about a range left at its full domain', () => {
    expect(lines({ tier: [...TIER_DOMAIN] })).toEqual([])
  })

  // Dates are summarized by year, with an open bound reading as a word
  // rather than a blank.
  it('describes a date window by year', () => {
    expect(
      lines({
        dateBeaten: { from: Date.UTC(2024, 0, 1), to: Date.UTC(2026, 0, 1) },
      })
    ).toContain('Date: 2024–2026')
  })

  it.each([
    [
      'an open lower bound',
      { from: null, to: Date.UTC(2026, 0, 1) },
      'Date: Any–2026',
    ],
    [
      'an open upper bound',
      { from: Date.UTC(2024, 0, 1), to: null },
      'Date: 2024–Today',
    ],
  ])('describes %s', (_label, dateBeaten, expected) => {
    expect(lines({ dateBeaten: dateBeaten as never })).toContain(expected)
  })

  it('names a constrained category', () => {
    expect(
      summarizeFilters(
        filters({ categoryRatings: { gameplay: [50, 100] } }),
        'ZERO_TO_HUNDRED',
        [category('gameplay', 0, 'Gameplay')]
      )
    ).toContain('Gameplay: 50–100')
  })

  // The category may have been deleted since the preset was saved.
  it('falls back to a generic name for an unknown category', () => {
    expect(
      summarizeFilters(
        filters({ categoryRatings: { gone: [50, 100] } }),
        'ZERO_TO_HUNDRED'
      )
    ).toContain('Category: 50–100')
  })

  it('renders ratings on the user’s own scale', () => {
    const onTen = summarizeFilters(
      filters({ rating: [50, 100] }),
      'ZERO_TO_TEN'
    )

    expect(onTen).toContain('Rating: 5–10')
  })

  it('lists every active filter', () => {
    expect(
      lines({ statuses: ['COMPLETED'], tier: [10, 20], flags: ['onStream'] })
    ).toHaveLength(3)
  })
})

describe('summarizeColumns', () => {
  const defaults = defaultColumnVisibility()
  const order = defaultColumnOrder()

  it('recognizes the default column set', () => {
    const visible = order.filter((id) => defaults[id]).length

    expect(summarizeColumns(defaults, order)).toBe(`Default (${visible})`)
  })

  it('lists an added column with a plus', () => {
    const hidden = COLUMNS.find((c) => !c.defaultVisible)!
    const cols = { ...defaults, [hidden.id]: true }

    expect(summarizeColumns(cols, order)).toContain(`+${hidden.label}`)
  })

  it('lists a removed column with a minus', () => {
    const shown = COLUMNS.find((c) => c.defaultVisible)!
    const cols = { ...defaults, [shown.id]: false }

    expect(summarizeColumns(cols, order)).toContain(`−${shown.label}`)
  })

  it('reports the total alongside the changes', () => {
    const shown = COLUMNS.find((c) => c.defaultVisible)!
    const cols = { ...defaults, [shown.id]: false }
    const total = order.filter((id) => cols[id]).length

    expect(summarizeColumns(cols, order)).toContain(`(${total} total)`)
  })

  // Category columns are discovered at runtime, so their labels arrive with
  // the defs rather than from the static table.
  it('names a category column from the defs passed in', () => {
    const defs = getCategoryColumnDefs([category('gameplay', 0, 'Gameplay')])
    const cols = { ...defaults, 'cat:gameplay': true }
    const withCat = [...order, 'cat:gameplay' as ColumnId]

    expect(summarizeColumns(cols, withCat, defs)).toContain('+Gameplay')
  })

  it('falls back to the raw id for a column it cannot name', () => {
    const cols = { ...defaults, 'cat:gone': true }
    const withCat = [...order, 'cat:gone' as ColumnId]

    expect(summarizeColumns(cols, withCat)).toContain('+cat:gone')
  })
})

describe('column defaults', () => {
  it('declares each column exactly once', () => {
    const ids = COLUMNS.map((c) => c.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every column a visibility default', () => {
    const visibility = defaultColumnVisibility()

    for (const c of COLUMNS) {
      expect(typeof visibility[c.id]).toBe('boolean')
    }
  })

  it('orders a fresh view by the declared column order', () => {
    expect(defaultColumnOrder()).toEqual(COLUMNS.map((c) => c.id))
  })

  it('shows at least one column by default', () => {
    expect(COLUMNS.some((c) => c.defaultVisible)).toBe(true)
  })
})

describe('getCategoryColumnDefs', () => {
  it('builds one opt-in column per category', () => {
    const defs = getCategoryColumnDefs([category('gameplay', 0, 'Gameplay')])

    expect(defs).toHaveLength(1)
    expect(defs[0]).toMatchObject({
      id: 'cat:gameplay',
      label: 'Gameplay',
      sortKey: 'cat:gameplay',
      defaultVisible: false,
    })
  })

  it('orders the columns by category priority', () => {
    const defs = getCategoryColumnDefs([
      category('third', 2),
      category('first', 0),
      category('second', 1),
    ])

    expect(defs.map((d) => d.id)).toEqual([
      'cat:first',
      'cat:second',
      'cat:third',
    ])
  })

  it('leaves the input order untouched', () => {
    const cats = [category('b', 1), category('a', 0)]
    const before = cats.map((c) => c.id)

    getCategoryColumnDefs(cats)

    expect(cats.map((c) => c.id)).toEqual(before)
  })

  it('builds nothing for a user with no categories', () => {
    expect(getCategoryColumnDefs([])).toEqual([])
  })
})
