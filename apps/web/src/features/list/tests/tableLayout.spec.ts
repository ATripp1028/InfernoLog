import { describe, expect, it } from 'vitest'
import {
  COLUMNS,
  defaultColumnOrder,
  defaultColumnVisibility,
  getCategoryColumnDefs,
  type ColumnDef,
  type ColumnId,
  type ColumnVisibility,
} from '../columns'
import {
  LEVEL_MIN_WIDTH,
  ROW_PADDING,
  rowMinWidth,
  tableMinWidth,
  visibleOrderedColumns,
} from '../tableLayout'

const col = (id: string, width: number): ColumnDef =>
  ({ id, label: id, width, defaultVisible: true }) as ColumnDef

/** Every column visible, in the order given. */
const allVisible = (ids: string[]): ColumnVisibility =>
  Object.fromEntries(ids.map((id) => [id, true]))

describe('visibleOrderedColumns', () => {
  const defs = [col('tier', 100), col('date', 50), col('attempts', 70)]

  it('returns the visible columns in display order', () => {
    const result = visibleOrderedColumns(
      allVisible(['tier', 'date', 'attempts']),
      ['attempts', 'tier', 'date'],
      defs
    )

    expect(result.map((c) => c.id)).toEqual(['attempts', 'tier', 'date'])
  })

  it('drops a column that is switched off', () => {
    const result = visibleOrderedColumns(
      { tier: true, date: false, attempts: true },
      ['tier', 'date', 'attempts'],
      defs
    )

    expect(result.map((c) => c.id)).toEqual(['tier', 'attempts'])
  })

  // Missing means hidden — a column the visibility map has never heard of
  // takes no space rather than defaulting to shown.
  it('treats a column missing from the map as hidden', () => {
    const result = visibleOrderedColumns({ tier: true }, ['tier', 'date'], defs)

    expect(result.map((c) => c.id)).toEqual(['tier'])
  })

  // A preset saved with a `cat:` column for a category that has since been
  // deleted still lists it in columnOrder, with no def behind it.
  it('skips an order entry with no matching def', () => {
    const result = visibleOrderedColumns(
      allVisible(['tier', 'cat:deleted']),
      ['tier', 'cat:deleted'],
      defs
    )

    expect(result.map((c) => c.id)).toEqual(['tier'])
  })

  // Order is authoritative: a column with no slot in it is not rendered, even
  // if the visibility map says it is on.
  it('ignores a visible column that is not in the order', () => {
    const result = visibleOrderedColumns(
      allVisible(['tier', 'date']),
      ['tier'],
      defs
    )

    expect(result.map((c) => c.id)).toEqual(['tier'])
  })

  it('returns nothing when every column is off', () => {
    expect(
      visibleOrderedColumns({}, ['tier', 'date', 'attempts'], defs)
    ).toEqual([])
  })

  it('returns nothing for an empty order', () => {
    expect(visibleOrderedColumns(allVisible(['tier']), [], defs)).toEqual([])
  })

  it('hands back the defs themselves, not copies', () => {
    const result = visibleOrderedColumns(allVisible(['tier']), ['tier'], defs)

    expect(result[0]).toBe(defs[0])
  })
})

describe('rowMinWidth', () => {
  // The Level cell is always rendered, so its reserved width plus the row
  // padding is the floor no set of optional columns can go below.
  it('reserves the level cell and the padding with no columns at all', () => {
    expect(rowMinWidth([])).toBe(LEVEL_MIN_WIDTH + ROW_PADDING)
  })

  it('adds each column’s width on top', () => {
    expect(rowMinWidth([col('tier', 100), col('date', 50)])).toBe(
      LEVEL_MIN_WIDTH + ROW_PADDING + 150
    )
  })

  // Only the widths are summed, so shuffling the columns cannot change the
  // total — the table is as wide as its contents whatever order they sit in.
  it('does not depend on the column order', () => {
    const cols = [col('tier', 100), col('date', 50), col('attempts', 70)]

    expect(rowMinWidth(cols)).toBe(rowMinWidth([...cols].reverse()))
  })

  it('grows monotonically as columns are added', () => {
    const one = rowMinWidth([col('tier', 100)])
    const two = rowMinWidth([col('tier', 100), col('date', 50)])

    expect(two).toBeGreaterThan(one)
  })

  it('is never below the level cell’s own reservation', () => {
    expect(rowMinWidth([])).toBeGreaterThanOrEqual(LEVEL_MIN_WIDTH)
  })
})

describe('tableMinWidth', () => {
  const defs = [col('tier', 100), col('date', 50), col('attempts', 70)]

  it('measures only the visible columns', () => {
    const width = tableMinWidth(
      { tier: true, date: false, attempts: true },
      ['tier', 'date', 'attempts'],
      defs
    )

    expect(width).toBe(LEVEL_MIN_WIDTH + ROW_PADDING + 170)
  })

  it('collapses to the floor when everything is hidden', () => {
    expect(tableMinWidth({}, ['tier', 'date', 'attempts'], defs)).toBe(
      LEVEL_MIN_WIDTH + ROW_PADDING
    )
  })

  it('agrees with measuring the resolved columns directly', () => {
    const columns = { tier: true, date: false, attempts: true }
    const order: ColumnId[] = ['attempts', 'tier', 'date']

    expect(tableMinWidth(columns, order, defs)).toBe(
      rowMinWidth(visibleOrderedColumns(columns, order, defs))
    )
  })

  it('shrinks when a column is switched off', () => {
    const order: ColumnId[] = ['tier', 'date']
    const both = tableMinWidth(allVisible(['tier', 'date']), order, defs)
    const one = tableMinWidth({ tier: true, date: false }, order, defs)

    expect(one).toBeLessThan(both)
  })

  // The docking decision depends on this being stable across reorders — a
  // column drag must not flip the panel between docked and overlay.
  it('is unchanged by reordering the columns', () => {
    const columns = allVisible(['tier', 'date', 'attempts'])

    expect(tableMinWidth(columns, ['tier', 'date', 'attempts'], defs)).toBe(
      tableMinWidth(columns, ['attempts', 'date', 'tier'], defs)
    )
  })

  it('counts a category column like any other', () => {
    const catDefs = getCategoryColumnDefs([
      { id: 'gameplay', name: 'Gameplay', sortOrder: 0 } as never,
    ])
    const order: ColumnId[] = ['tier', 'cat:gameplay']
    const withCat = tableMinWidth(allVisible(['tier', 'cat:gameplay']), order, [
      ...defs,
      ...catDefs,
    ])
    const withoutCat = tableMinWidth({ tier: true }, order, [
      ...defs,
      ...catDefs,
    ])

    expect(withCat - withoutCat).toBe(catDefs[0]!.width)
  })

  // A preset carrying a deleted category must not throw or inflate the width.
  it('ignores an order entry whose def has gone', () => {
    const order: ColumnId[] = ['tier', 'cat:deleted']

    expect(
      tableMinWidth(allVisible(['tier', 'cat:deleted']), order, defs)
    ).toBe(tableMinWidth({ tier: true }, ['tier'], defs))
  })

  describe('against the real column table', () => {
    it('measures the default view', () => {
      const expected =
        LEVEL_MIN_WIDTH +
        ROW_PADDING +
        COLUMNS.filter((c) => c.defaultVisible).reduce(
          (sum, c) => sum + c.width,
          0
        )

      expect(
        tableMinWidth(defaultColumnVisibility(), defaultColumnOrder(), COLUMNS)
      ).toBe(expected)
    })

    // The docking threshold is only meaningful if the default view produces a
    // real width — a zero or negative number would dock the panel always.
    it('produces a plausible width for the default view', () => {
      const width = tableMinWidth(
        defaultColumnVisibility(),
        defaultColumnOrder(),
        COLUMNS
      )

      expect(width).toBeGreaterThan(LEVEL_MIN_WIDTH)
      expect(width).toBeLessThan(4000)
    })

    it('never exceeds the width of every column at once', () => {
      const everything = tableMinWidth(
        allVisible(COLUMNS.map((c) => c.id)),
        defaultColumnOrder(),
        COLUMNS
      )
      const defaults = tableMinWidth(
        defaultColumnVisibility(),
        defaultColumnOrder(),
        COLUMNS
      )

      expect(defaults).toBeLessThanOrEqual(everything)
    })
  })
})
