import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RatingDisplayScale, DateFormatPreference } from '@/lib/api/me'
import { COLUMNS, type ColumnDef, type ColumnId, type ColumnVisibility } from './columns'
import { ListRow, LEVEL_MIN_WIDTH } from './ListRow'
import { RowContextMenu, RowActionsKebab } from './rowActions'
import type { ListItem, SortKey, SortSpec } from './types'

interface ListTableProps {
  items: ListItem[]
  columns: ColumnVisibility
  columnOrder: ColumnId[]
  onReorderColumns: (order: ColumnId[]) => void
  sorts: SortSpec[]
  onToggleSort: (key: SortKey) => void
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  onEditItem: (item: ListItem) => void
  onDeleteItem: (item: ListItem) => void
  onNavigate: (item: ListItem) => void
}

// px-3 (12px) on each side of every row.
const ROW_PADDING = 24

function rowMinWidth(orderedCols: ColumnDef[]): number {
  const colsWidth = orderedCols.reduce((sum, c) => sum + c.width, 0)
  return LEVEL_MIN_WIDTH + colsWidth + ROW_PADDING
}

function SortIndicator({
  sort,
  index,
}: {
  sort: SortSpec | undefined
  index: number
}) {
  if (!sort) return null
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
  orderedCols,
  sorts,
  onToggleSort,
  columnOrder,
  onReorderColumns,
  minWidth,
}: {
  orderedCols: ColumnDef[]
  sorts: SortSpec[]
  onToggleSort: (key: SortKey) => void
  columnOrder: ColumnId[]
  onReorderColumns: (order: ColumnId[]) => void
  minWidth: number
}) {
  const [draggingId, setDraggingId] = useState<ColumnId | null>(null)
  const [dragOverId, setDragOverId] = useState<ColumnId | null>(null)

  function handleDrop(targetId: ColumnId) {
    if (!draggingId || draggingId === targetId) return
    const newOrder = [...columnOrder]
    const fromIdx = newOrder.indexOf(draggingId)
    const toIdx = newOrder.indexOf(targetId)
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, draggingId)
    onReorderColumns(newOrder)
  }

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
      {orderedCols.map((col) => {
        const isDraggable = !!col.sortKey
        const isDragging = draggingId === col.id
        const isOver = dragOverId === col.id && draggingId !== col.id
        const sortIdx = col.sortKey
          ? sorts.findIndex((s) => s.key === col.sortKey)
          : -1
        const sort = sortIdx >= 0 ? sorts[sortIdx] : undefined
        return (
          <button
            key={col.id}
            type="button"
            disabled={!col.sortKey}
            draggable={isDraggable}
            onDragStart={
              isDraggable
                ? (e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingId(col.id)
                  }
                : undefined
            }
            onDragOver={
              isDraggable && draggingId && draggingId !== col.id
                ? (e) => {
                    e.preventDefault()
                    setDragOverId(col.id)
                  }
                : undefined
            }
            onDragLeave={() => setDragOverId(null)}
            onDrop={
              isDraggable
                ? (e) => {
                    e.preventDefault()
                    handleDrop(col.id)
                    setDragOverId(null)
                  }
                : undefined
            }
            onDragEnd={() => {
              setDraggingId(null)
              setDragOverId(null)
            }}
            onClick={() => col.sortKey && onToggleSort(col.sortKey)}
            className={cn(
              'h-8 shrink-0 items-center justify-center gap-1 text-[11px] font-medium text-text-secondary transition-opacity',
              col.sortKey && 'hover:text-text-primary',
              isDraggable && !isDragging && 'cursor-grab active:cursor-grabbing',
              isDragging && 'opacity-40',
              isOver && 'border-l-2 border-primary',
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
  columnOrder,
  onReorderColumns,
  sorts,
  onToggleSort,
  scale,
  datePref,
  onEditItem,
  onDeleteItem,
  onNavigate,
}: ListTableProps) {
  const orderedCols = columnOrder
    .map((id) => COLUMNS.find((c) => c.id === id)!)
    .filter((col) => columns[col.id])

  const minWidth = rowMinWidth(orderedCols)

  return (
    <div className="hidden overflow-x-auto rounded-card border border-[var(--color-border-subtle)] md:block">
      <ColumnHeaders
        orderedCols={orderedCols}
        sorts={sorts}
        onToggleSort={onToggleSort}
        columnOrder={columnOrder}
        onReorderColumns={onReorderColumns}
        minWidth={minWidth}
      />
      {items.map((item) => {
        const handlers = {
          onEdit: () => onEditItem(item),
          onDelete: () => onDeleteItem(item),
        }
        return (
          <RowContextMenu key={item.levelProgressId} handlers={handlers}>
            <div
              className="group relative cursor-pointer border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-white/[0.02]"
              style={{ minWidth }}
              onClick={() => onNavigate(item)}
            >
              <ListRow
                item={item}
                columns={columns}
                columnOrder={columnOrder}
                scale={scale}
                datePref={datePref}
                minWidth={minWidth}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ boxShadow: 'inset 0 0 40px rgba(255, 159, 28, 0.22)' }}
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
