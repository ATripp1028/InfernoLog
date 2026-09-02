import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { SortablePlacedRow, PlacedRow } from './PlacedRow'
import { SortableUnplacedCard, UnplacedCard } from './UnplacedCard'
import { UnplacedPanel } from './UnplacedPanel'
import type { useOrderingBoard } from '@/lib/ordering/useOrderingBoard'
import type { OrderedItem } from '@/lib/ordering/types'

type Board = ReturnType<typeof useOrderingBoard>

interface OrderingBoardProps {
  /** From `useOrderingBoard` — the caller owns which ordering it is running. */
  board: Board
  unplacedCount: number
  onSearchUnplaced: (v: string) => void
  unplacedSearch: string
  /**
   * What this ordering is called, in the remove control and the empty state:
   * "demon list" or "ranking". Everything else about the board is identical.
   */
  listLabel: string
  // levelProgressId to highlight (post-log handoff).
  highlightId?: string | undefined
}

/**
 * The desktop ordering board: the placed list beside the unplaced panel, with
 * drag-and-drop between them.
 *
 * Shared by the demon list and the MANUAL rating ranking. They order the same
 * completions on different axes — difficulty and quality — and neither the
 * layout nor the drag rules differ between them, so only the wording is a prop.
 */
export function OrderingBoard({
  board,
  unplacedCount,
  unplacedSearch,
  onSearchUnplaced,
  listLabel,
  highlightId,
}: OrderingBoardProps) {
  const {
    sensors,
    collisionDetection,
    containers,
    itemsById,
    activeItem,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    clearActive,
    removeFromOrdering,
    filtering,
    placedView,
    unplacedView,
  } = board

  const PlacedColumn = (
    <PlacedDroppable>
      {filtering ? (
        <StaticPlaced
          entries={placedView}
          onRemove={removeFromOrdering}
          listLabel={listLabel}
        />
      ) : containers.placed.length === 0 ? (
        <EmptyRanked listLabel={listLabel} />
      ) : (
        <SortableContext
          items={containers.placed}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {containers.placed.map((id, i) => {
              const item = itemsById.get(id)
              return item ? (
                <SortablePlacedRow
            listLabel={listLabel}
                  key={id}
                  rank={i + 1}
                  item={item}
                  highlight={id === highlightId}
                  onRemove={() => removeFromOrdering(id)}
                />
              ) : null
            })}
          </div>
        </SortableContext>
      )}
    </PlacedDroppable>
  )

  const UnplacedColumn = (
    <UnplacedDroppable
      count={unplacedCount}
      search={unplacedSearch}
      onSearch={onSearchUnplaced}
    >
      {unplacedView.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-text-tertiary">
          Nothing to place.
        </p>
      ) : filtering ? (
        unplacedView.map((id) => {
          const item = itemsById.get(id)
          return item ? (
            <UnplacedCard key={id} item={item} domId={`rk-${id}`} />
          ) : null
        })
      ) : (
        <SortableContext
          items={unplacedView}
          strategy={verticalListSortingStrategy}
        >
          {unplacedView.map((id) => {
            const item = itemsById.get(id)
            return item ? (
              <SortableUnplacedCard
                key={id}
                item={item}
                highlight={id === highlightId}
              />
            ) : null
          })}
        </SortableContext>
      )}
    </UnplacedDroppable>
  )

  const layout = (
    <div className="flex h-full gap-4">
      <div className="min-w-0 flex-1 overflow-y-auto">{PlacedColumn}</div>
      <div className="h-full w-[280px] shrink-0 lg:w-[300px]">
        {UnplacedColumn}
      </div>
    </div>
  )

  if (filtering) {
    // Static — no DnD wiring while rows are hidden.
    return layout
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={clearActive}
    >
      {layout}
      <DragOverlay>
        {activeItem ? (
          containers.unplaced.includes(activeItem.levelProgressId) ? (
            <UnplacedCard item={activeItem} />
          ) : (
            <PlacedRow
            listLabel={listLabel}
              rank={containers.placed.indexOf(activeItem.levelProgressId) + 1}
              item={activeItem}
            />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// Container-level droppables so an empty list still accepts a drop. h-full makes
// the whole ranked column a drop target — not just the rows — so dropping into
// the empty space below the last row still places the level.
function PlacedDroppable({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'placed' })
  return (
    <div
      ref={setNodeRef}
      className={[
        'h-full min-h-[160px] rounded-card',
        isOver ? 'bg-primary-dim ring-1 ring-primary' : '',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function UnplacedDroppable({
  count,
  search,
  onSearch,
  children,
}: {
  count: number
  search: string
  onSearch: (v: string) => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unplaced' })
  return (
    <UnplacedPanel
      ref={setNodeRef}
      count={count}
      search={search}
      onSearch={onSearch}
      isOver={isOver}
    >
      {children}
    </UnplacedPanel>
  )
}

function StaticPlaced({
  entries,
  onRemove,
  listLabel,
}: {
  entries: (OrderedItem & { rank: number })[]
  onRemove: (levelProgressId: string) => void
  listLabel: string
}) {
  if (entries.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-text-tertiary">
        No ranked levels match.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <PlacedRow
            listLabel={listLabel}
          key={e.levelProgressId}
          rank={e.rank}
          item={e}
          onRemove={() => onRemove(e.levelProgressId)}
          domId={`rk-${e.levelProgressId}`}
        />
      ))}
    </div>
  )
}

function EmptyRanked({ listLabel }: { listLabel: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-card border border-dashed border-border-subtle px-6 text-center text-sm text-text-tertiary">
      Drag a level here from Unplaced to start your {listLabel}.
    </div>
  )
}
