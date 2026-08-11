import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import type { FlowPath } from '@/features/logging/types'
import { type ColumnDef, type ColumnId, type ColumnVisibility } from './columns'
import { ListRow, LEVEL_MIN_WIDTH } from './ListRow'
import { RowContextMenu, RowActionsKebab } from './rowActions'
import type { ListItem, SortKey, SortSpec } from './types'

interface ListTableProps {
  items: ListItem[]
  columns: ColumnVisibility
  columnOrder: ColumnId[]
  allColumnDefs: ColumnDef[]
  onReorderColumns: (order: ColumnId[]) => void
  sorts: SortSpec[]
  onToggleSort: (key: SortKey) => void
  scale: RatingDisplayScale
  datePref: DateFormatPreference
  hideTime: boolean
  onEditRunItem: (item: ListItem) => void
  onEditLevelItem: (item: ListItem) => void
  onDeleteItem: (item: ListItem) => void
  onNavigate: (item: ListItem) => void
  onAddToCollectionItem: (item: ListItem) => void
  onLogItem: (item: ListItem, path: FlowPath) => void
}

// px-3 (12px) on each side of every row.
const ROW_PADDING = 24

function rowMinWidth(orderedCols: ColumnDef[]): number {
  const colsWidth = orderedCols.reduce((sum, c) => sum + c.width, 0)
  return LEVEL_MIN_WIDTH + colsWidth + ROW_PADDING
}

/**
 * The minimum width the table needs for the currently visible columns. The page
 * uses this to decide whether the filter panel can dock beside the table or must
 * open as an overlay instead.
 */
export function tableMinWidth(
  columns: ColumnVisibility,
  columnOrder: ColumnId[],
  allColumnDefs: ColumnDef[]
): number {
  const orderedCols = columnOrder
    .map((id) => allColumnDefs.find((c) => c.id === id))
    .filter(
      (col): col is ColumnDef => col != null && (columns[col.id] ?? false)
    )
  return rowMinWidth(orderedCols)
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
      className="flex h-8 items-center border-b border-border-subtle bg-bg-base px-3 sticky top-0 z-20 text-[11px] font-medium text-text-secondary"
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
        // handleDrop inserts the dragged column at the target's original
        // index — for a forward drag (dragging rightward past its own slot)
        // that removal shifts everything left first, so the column actually
        // lands to the right of the target. Point the indicator at the side
        // it will really land on, or dragging onto the last column shows a
        // "before" indicator while the column drops in after it.
        const isForwardDrag =
          isOver &&
          draggingId != null &&
          columnOrder.indexOf(draggingId) < columnOrder.indexOf(col.id)
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
              isDraggable &&
                !isDragging &&
                'cursor-grab active:cursor-grabbing',
              isDragging && 'opacity-40',
              isOver && (isForwardDrag ? 'border-r-2' : 'border-l-2'),
              isOver && 'border-primary',
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

/**
 * The virtualized columnar List (md+). Its mobile counterpart is the card list.
 */
export function ListTable({
  items,
  columns,
  columnOrder,
  allColumnDefs,
  onReorderColumns,
  sorts,
  onToggleSort,
  scale,
  datePref,
  hideTime,
  onEditRunItem,
  onEditLevelItem,
  onDeleteItem,
  onNavigate,
  onAddToCollectionItem,
  onLogItem,
}: ListTableProps) {
  const orderedCols = columnOrder
    .map((id) => allColumnDefs.find((c) => c.id === id))
    .filter(
      (col): col is ColumnDef => col != null && (columns[col.id] ?? false)
    )

  const minWidth = rowMinWidth(orderedCols)

  // Only one row's kebab menu open at a time — opening another closes it.
  const [openKebabId, setOpenKebabId] = useState<string | null>(null)

  // Timer used to disambiguate single-click (navigate) from double-click (add
  // to collection). A 250ms window matches standard OS double-click thresholds.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])
  return (
    <div
      className="hidden min-h-0 overflow-auto rounded-card border border-border-subtle md:block"
      style={{
        maskImage:
          'linear-gradient(to bottom, black calc(100% - 5rem), transparent 100%)',
      }}
    >
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
          onEditRun: () => onEditRunItem(item),
          onEditLevel: () => onEditLevelItem(item),
          onDelete: () => onDeleteItem(item),
          onAddToCollection: () => onAddToCollectionItem(item),
          // A level can only hold one completion — once it's COMPLETED there's
          // nothing new left to log.
          ...(item.status !== 'COMPLETED' && {
            onLog: (path: FlowPath) => onLogItem(item, path),
          }),
        }
        return (
          <RowContextMenu key={item.levelProgressId} handlers={handlers}>
            <div
              className="group relative cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-white/[0.02]"
              style={{ minWidth }}
              onClick={() => {
                if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
                clickTimerRef.current = setTimeout(() => {
                  clickTimerRef.current = null
                  onNavigate(item)
                }, 250)
              }}
              onDoubleClick={() => {
                if (clickTimerRef.current) {
                  clearTimeout(clickTimerRef.current)
                  clickTimerRef.current = null
                }
                onAddToCollectionItem(item)
              }}
            >
              <ListRow
                item={item}
                columns={columns}
                columnOrder={columnOrder}
                allColumnDefs={allColumnDefs}
                scale={scale}
                datePref={datePref}
                hideTime={hideTime}
                minWidth={minWidth}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ boxShadow: 'inset 0 0 40px rgba(255, 159, 28, 0.22)' }}
              />
              <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2">
                <RowActionsKebab
                  handlers={handlers}
                  open={openKebabId === item.levelProgressId}
                  onOpenChange={(o) => {
                    if (o) setOpenKebabId(item.levelProgressId)
                    // Only clear if this row is still the open one — otherwise a
                    // just-closed row's dismiss would clobber the newly-opened
                    // row (the click that opens B also dismisses A).
                    else
                      setOpenKebabId((cur) =>
                        cur === item.levelProgressId ? null : cur
                      )
                  }}
                />
              </div>
            </div>
          </RowContextMenu>
        )
      })}
      <div aria-hidden className="h-20 shrink-0" />
    </div>
  )
}
