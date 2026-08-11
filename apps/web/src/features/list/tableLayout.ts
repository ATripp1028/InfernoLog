// How wide the List table needs to be. The page reads this to decide whether
// the filter panel can dock beside the table or has to open as an overlay, and
// the row itself reserves LEVEL_MIN_WIDTH for its Level cell.
//
// Extracted from ListTable so useListPage does not import from a component
// file to get at it.

import type { ColumnDef, ColumnId, ColumnVisibility } from './columns'

/**
 * Minimum width reserved for the Level (face + name) cell before the table
 * scrolls horizontally — keeps long names readable rather than squeezing them.
 */
export const LEVEL_MIN_WIDTH = 280

/**
 * Horizontal padding on a row: px-3 (12px) each side.
 */
export const ROW_PADDING = 24

/**
 * The columns a row actually renders, in display order.
 *
 * A column has to be both listed in `columnOrder` and switched on in
 * `columns` to count. An order entry with no matching def — a `cat:` column
 * for a since-deleted rating category, say — is skipped rather than throwing.
 *
 * Shared by ListTable (which renders them) and {@link tableMinWidth} (which
 * measures them), so the two can never disagree about what is visible.
 */
export function visibleOrderedColumns(
  columns: ColumnVisibility,
  columnOrder: ColumnId[],
  allColumnDefs: ColumnDef[]
): ColumnDef[] {
  return columnOrder
    .map((id) => allColumnDefs.find((c) => c.id === id))
    .filter(
      (col): col is ColumnDef => col != null && (columns[col.id] ?? false)
    )
}

/**
 * The minimum width a row needs for the given columns.
 *
 * The Level cell is always present, so a row is never narrower than its
 * reserved width plus the padding, whatever the optional columns do.
 */
export function rowMinWidth(orderedCols: ColumnDef[]): number {
  const colsWidth = orderedCols.reduce((sum, c) => sum + c.width, 0)
  return LEVEL_MIN_WIDTH + colsWidth + ROW_PADDING
}

/**
 * The minimum width the table needs for the currently visible columns. See
 * {@link visibleOrderedColumns} for which columns count.
 */
export function tableMinWidth(
  columns: ColumnVisibility,
  columnOrder: ColumnId[],
  allColumnDefs: ColumnDef[]
): number {
  return rowMinWidth(visibleOrderedColumns(columns, columnOrder, allColumnDefs))
}
