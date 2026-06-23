import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { COLUMNS, type ColumnVisibility } from './columns'
import { ListRow, LEVEL_MIN_WIDTH } from './ListRow'
import { RowContextMenu, RowActionsKebab } from './rowActions'
import type { ListItem, SortKey, SortSpec } from './types'

interface ListTableProps {
  items: ListItem[]
  columns: ColumnVisibility
  sorts: SortSpec[]
  onToggleSort: (key: SortKey) => void
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  onEditItem: (item: ListItem) => void
  onDeleteItem: (item: ListItem) => void
}

// px-3 (12px) on each side of every row.
const ROW_PADDING = 24

function rowMinWidth(columns: ColumnVisibility): number {
  const cols = COLUMNS.filter((c) => columns[c.id]).reduce(
    (sum, c) => sum + c.width,
    0
  )
  return LEVEL_MIN_WIDTH + cols + ROW_PADDING
}

function SortIndicator({
  sort,
  index,
}: {
  sort: SortSpec | undefined
  index: number
}) {
  if (!sort) return null
  // Up = ascending (green), down = descending (red).
  const isAsc = sort.dir === 'asc'
  return (
    <span
      className={cn(
        'flex items-center',
        isAsc ? 'text-success' : 'text-primary'
      )}
    >
      {isAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      <span className="text-[9px] font-bold">{index + 1}</span>
    </span>
  )
}

function ColumnHeaders({
  columns,
  sorts,
  onToggleSort,
  minWidth,
}: Pick<ListTableProps, 'columns' | 'sorts' | 'onToggleSort'> & {
  minWidth: number
}) {
  return (
    <div
      className="flex h-8 items-center border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3"
      style={{ minWidth }}
    >
      <div
        className="text-[11px] font-medium text-text-secondary"
        style={{ minWidth: LEVEL_MIN_WIDTH, flex: '1 1 0%' }}
      >
        Level
      </div>
      {COLUMNS.map((col) => {
        if (!columns[col.id]) return null
        const sortIdx = col.sortKey
          ? sorts.findIndex((s) => s.key === col.sortKey)
          : -1
        const sort = sortIdx >= 0 ? sorts[sortIdx] : undefined
        return (
          <button
            key={col.id}
            type="button"
            disabled={!col.sortKey}
            onClick={() => col.sortKey && onToggleSort(col.sortKey)}
            className={cn(
              'h-8 shrink-0 items-center justify-center gap-1 text-[11px] font-medium text-text-secondary',
              col.sortKey && 'hover:text-text-primary',
              col.responsiveClass
            )}
            style={{ width: col.width }}
          >
            {col.label}
            <SortIndicator sort={sort} index={sortIdx} />
          </button>
        )
      })}
    </div>
  )
}

export function ListTable({
  items,
  columns,
  sorts,
  onToggleSort,
  scale,
  datePref,
  onEditItem,
  onDeleteItem,
}: ListTableProps) {
  // Desktop / tablet only — mobile uses MobilePager. One connected box: a single
  // bordered container, rows flush with dividers, horizontal scroll when the
  // chosen columns exceed the width.
  const minWidth = rowMinWidth(columns)

  return (
    <div className="hidden overflow-x-auto rounded-card border border-[var(--color-border-subtle)] md:block">
      <ColumnHeaders
        columns={columns}
        sorts={sorts}
        onToggleSort={onToggleSort}
        minWidth={minWidth}
      />
      {items.map((item) => {
        const handlers = {
          onEdit: () => onEditItem(item),
          onDelete: () => onDeleteItem(item),
        }
        return (
          <RowContextMenu key={item.levelProgressId} handlers={handlers}>
            <div className="group relative border-b border-[var(--color-border-subtle)] last:border-b-0">
              <ListRow
                item={item}
                columns={columns}
                scale={scale}
                datePref={datePref}
                minWidth={minWidth}
              />
              <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
                <RowActionsKebab handlers={handlers} />
              </div>
            </div>
          </RowContextMenu>
        )
      })}
    </div>
  )
}
