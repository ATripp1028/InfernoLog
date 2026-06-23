import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortableSensors } from '@/features/settings/hooks/useSortableSensors'
import type { ClassicRankingResponse } from '@infernolog/core'
import {
  usePlaceRanking,
  useReorderRanking,
  useUnplaceRanking,
} from '@/lib/api/ranking'
import { neighboursAround } from './neighbours'
import { filterPlaced, filterUnplaced, reorderDisabled } from './filtering'
import { SortableRankedRow, RankedRow } from './RankedRow'
import { SortableUnplacedCard, UnplacedCard } from './UnplacedCard'
import { UnplacedPanel } from './UnplacedPanel'
import type { ContainerId, RankingItem } from './types'

interface RankingBoardProps {
  data: ClassicRankingResponse
  search: string
  showUnrated: boolean
  onSearchUnplaced: (v: string) => void
  unplacedSearch: string
  // levelProgressId to highlight (post-log handoff).
  highlightId?: string | undefined
}

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

// Cursor-based collision: a drop registers the moment the pointer is over a row
// or container, instead of waiting for the dragged card's centre to reach a row
// centre (closestCenter). Falls back to rect-intersection for keyboard drags,
// where there's no pointer.
const collisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args)
  return byPointer.length > 0 ? byPointer : rectIntersection(args)
}

export function RankingBoard({
  data,
  search,
  showUnrated,
  unplacedSearch,
  onSearchUnplaced,
  highlightId,
}: RankingBoardProps) {
  const sensors = useSortableSensors()
  const place = usePlaceRanking()
  const reorder = useReorderRanking()
  const unplace = useUnplaceRanking()

  // Common level data for any id, in either container.
  const itemsById = useMemo(() => {
    const m = new Map<string, RankingItem>()
    for (const e of data.placed) m.set(e.levelProgressId, e)
    for (const e of data.unplaced) m.set(e.levelProgressId, e)
    return m
  }, [data])

  // Live, locally-controlled ordering during a drag; otherwise mirrors `data`.
  const [containers, setContainers] = useState<Record<ContainerId, string[]>>({
    placed: data.placed.map((e) => e.levelProgressId),
    unplaced: data.unplaced.map((e) => e.levelProgressId),
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const startContainer = useRef<ContainerId | null>(null)

  useEffect(() => {
    if (activeId) return // don't clobber the in-flight drag
    setContainers({
      placed: data.placed.map((e) => e.levelProgressId),
      unplaced: data.unplaced.map((e) => e.levelProgressId),
    })
  }, [data, activeId])

  const findContainer = (id: string): ContainerId | null => {
    if (id === 'placed' || id === 'unplaced') return id
    if (containers.placed.includes(id)) return 'placed'
    if (containers.unplaced.includes(id)) return 'unplaced'
    return null
  }

  // ── Read-only (filtered) view: no DnD, recomputed ranks ──────────────────
  const filtering = reorderDisabled(
    data.placed.length,
    filterPlaced(data.placed, search, showUnrated).length,
    search
  )

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    setActiveId(id)
    startContainer.current = findContainer(id)
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const activeC = findContainer(String(active.id))
    const overC = findContainer(String(over.id))
    if (!activeC || !overC || activeC === overC) return

    setContainers((prev) => {
      const activeItems = prev[activeC]
      const overItems = prev[overC]
      const overIsContainer = over.id === 'placed' || over.id === 'unplaced'
      const overIndex = overIsContainer
        ? overItems.length
        : overItems.indexOf(String(over.id))
      const insertAt = overIndex < 0 ? overItems.length : overIndex
      return {
        ...prev,
        [activeC]: activeItems.filter((id) => id !== String(active.id)),
        [overC]: [
          ...overItems.slice(0, insertAt),
          String(active.id),
          ...overItems.slice(insertAt),
        ],
      }
    })
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    const id = String(active.id)
    const start = startContainer.current
    setActiveId(null)
    startContainer.current = null
    if (!over || !start) return

    const end = findContainer(id)
    if (!end) return

    // Final within-placed reorder relative to the row we dropped over.
    let placedIds = containers.placed
    if (end === 'placed') {
      const overC = findContainer(String(over.id))
      if (overC === 'placed' && String(over.id) !== id) {
        const from = placedIds.indexOf(id)
        const to = placedIds.indexOf(String(over.id))
        if (from >= 0 && to >= 0) placedIds = arrayMove(placedIds, from, to)
      }
      setContainers((prev) => ({ ...prev, placed: placedIds }))
    }

    if (end === 'placed') {
      const index = placedIds.indexOf(id)
      const neighbours = neighboursAround(placedIds, index)
      if (start === 'unplaced') {
        place.mutate({ levelProgressId: id, ...neighbours })
      } else {
        const original = data.placed.map((x) => x.levelProgressId)
        if (!sameOrder(placedIds, original)) {
          reorder.mutate({ levelProgressId: id, ...neighbours })
        }
      }
    } else if (end === 'unplaced' && start === 'placed') {
      unplace.mutate(id)
    }
    // unplaced → unplaced: nothing to persist.
  }

  const PlacedColumn = (
    <PlacedDroppable>
      {filtering ? (
        <StaticPlaced
          entries={filterPlaced(data.placed, search, showUnrated)}
        />
      ) : containers.placed.length === 0 ? (
        <EmptyRanked />
      ) : (
        <SortableContext
          items={containers.placed}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {containers.placed.map((id, i) => {
              const item = itemsById.get(id)
              return item ? (
                <SortableRankedRow
                  key={id}
                  rank={i + 1}
                  item={item}
                  highlight={id === highlightId}
                />
              ) : null
            })}
          </div>
        </SortableContext>
      )}
    </PlacedDroppable>
  )

  const unplacedView = filtering
    ? filterUnplaced(data.unplaced, unplacedSearch).map((e) => e.levelProgressId)
    : containers.unplaced.filter((id) => {
        const item = itemsById.get(id)
        if (!item) return false
        const q = unplacedSearch.trim().toLowerCase()
        if (!q) return true
        return (
          (item.level.name?.toLowerCase().includes(q) ?? false) ||
          (item.level.creator?.toLowerCase().includes(q) ?? false) ||
          item.level.inGameId.toLowerCase().includes(q)
        )
      })

  const UnplacedColumn = (
    <UnplacedDroppable
      count={data.unplaced.length}
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
    <div className="flex gap-4">
      <div className="min-w-0 flex-1">{PlacedColumn}</div>
      <div className="w-[280px] shrink-0 lg:w-[300px]">{UnplacedColumn}</div>
    </div>
  )

  if (filtering) {
    // Static — no DnD wiring while rows are hidden.
    return layout
  }

  const activeItem = activeId ? itemsById.get(activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        startContainer.current = null
      }}
    >
      {layout}
      <DragOverlay>
        {activeItem ? (
          findContainer(activeItem.levelProgressId) === 'unplaced' ? (
            <UnplacedCard item={activeItem} />
          ) : (
            <RankedRow
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
        isOver
          ? 'bg-[var(--color-primary-dim)] ring-1 ring-[var(--color-primary)]'
          : '',
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
}: {
  entries: ClassicRankingResponse['placed']
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
        <RankedRow
          key={e.levelProgressId}
          rank={e.rank}
          item={e}
          domId={`rk-${e.levelProgressId}`}
        />
      ))}
    </div>
  )
}

function EmptyRanked() {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-card border border-dashed border-[var(--color-border-subtle)] px-6 text-center text-sm text-text-tertiary">
      Drag a level here from Unplaced to start your ranking.
    </div>
  )
}
