import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { COLUMNS, type ColumnVisibility } from './columns'
import { ListRow } from './ListRow'
import { ListCard } from './ListCard'
import type { ListItem, SortKey, SortSpec } from './types'

interface ListTableProps {
  items: ListItem[]
  columns: ColumnVisibility
  sorts: SortSpec[]
  onToggleSort: (key: SortKey) => void
  scale: RatingDisplayScale
  datePref: DateFormatPreference
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
}: ListTableProps) {
  return (
    <div className="flex flex-col gap-2">
      <ColumnHeaders columns={columns} sorts={sorts} onToggleSort={onToggleSort} />
      {/* Columnar rows (tablet/desktop) */}
      <div className="hidden flex-col gap-2 md:flex">
        {items.map((item) => (
          <ListRow
            key={item.levelProgressId}
            item={item}
            columns={columns}
            scale={scale}
            datePref={datePref}
          />
        ))}
      </div>
      {/* Cards (mobile) */}
      <div className="flex flex-col gap-2 md:hidden">
        {items.map((item) => (
          <ListCard
            key={item.levelProgressId}
            item={item}
            scale={scale}
            datePref={datePref}
          />
        ))}
      </div>
    </div>
  )
}
