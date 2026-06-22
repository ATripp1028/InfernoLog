import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { COLUMNS, type ColumnVisibility } from './columns'
import { ListRow } from './ListRow'
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

function SortIndicator({
  sort,
  index,
}: {
  sort: SortSpec | undefined
  index: number
}) {
  if (!sort) return null
  return (
    <span className="flex items-center text-primary">
      {sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      <span className="text-[9px] font-bold">{index + 1}</span>
    </span>
  )
}

function ColumnHeaders({
  columns,
  sorts,
  onToggleSort,
}: Pick<ListTableProps, 'columns' | 'sorts' | 'onToggleSort'>) {
  return (
    <div className="hidden h-8 items-center gap-1 border-b border-[var(--color-border-subtle)] px-3 md:flex">
      <div className="min-w-0 flex-1 text-[11px] font-medium text-text-secondary">
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
  // Desktop / tablet only — mobile uses MobilePager. Each row gets a right-click
  // context menu plus a hover kebab, both running the same actions.
  return (
    <div className="hidden flex-col gap-2 md:flex">
      <ColumnHeaders columns={columns} sorts={sorts} onToggleSort={onToggleSort} />
      {items.map((item) => {
        const handlers = {
          onEdit: () => onEditItem(item),
          onDelete: () => onDeleteItem(item),
        }
        return (
          <RowContextMenu key={item.levelProgressId} handlers={handlers}>
            <div className="group relative">
              <ListRow
                item={item}
                columns={columns}
                scale={scale}
                datePref={datePref}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <RowActionsKebab handlers={handlers} />
              </div>
            </div>
          </RowContextMenu>
        )
      })}
    </div>
  )
}
