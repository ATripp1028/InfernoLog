// Collection detail — identity hero, drag-to-reorder member rows with
// per-row remove and GDDL/AREDL badges, and the context-scoped FAB menu
// (Add levels / Edit / Delete; built-ins keep only Add levels).
// Mocks: desktop 1206:164, tablet 1212:2, mobile 1213:2; empty 1241:3;
// built-in variant 1256:2 / 1257:2.

import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronLeft, GripVertical, Plus, X } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/PageLoading'
import { DifficultyFace } from '@/components/DifficultyFace'
import { RankingBadge } from '@/features/ranking/RankingBadge'
import { useSortableSensors } from '@/features/settings/hooks/useSortableSensors'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { ApiError } from '@/lib/api/client'
import {
  useCollection,
  useDeleteCollection,
  useRemoveCollectionEntry,
  useReorderCollectionEntry,
  useUpdateCollection,
  type CollectionDetail as CollectionDetailData,
  type CollectionEntry,
} from '@/lib/api/collections'
import { collectionIdentity, isBuiltIn, withAlpha } from '@/features/collections/identity'
import { CollectionFormDialog } from '@/features/collections/CollectionFormDialog'
import { AddLevelsDialog } from '@/features/collections/AddLevelsDialog'
import {
  CollectionsFab,
  collectionDetailActions,
} from '@/features/collections/CollectionsFab'

export function CollectionDetail({ collectionId }: { collectionId: string }) {
  const collection = useCollection(collectionId)

  if (collection.isPending) return <PageLoading />
  if (collection.error || !collection.data) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-500">
          {collection.error instanceof ApiError &&
          collection.error.status === 404
            ? 'This collection does not exist.'
            : 'Could not load this collection. Refresh to try again.'}
        </p>
        <Link
          to="/collections"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          ‹ All collections
        </Link>
      </div>
    )
  }

  return <Loaded collection={collection.data} />
}

function Loaded({ collection }: { collection: CollectionDetailData }) {
  const navigate = useNavigate()
  const custom = !isBuiltIn(collection.type)

  const updateCollection = useUpdateCollection()
  const deleteCollection = useDeleteCollection()
  const removeEntry = useRemoveCollectionEntry()
  const reorderEntry = useReorderCollectionEntry()

  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSortableSensors()
  const entries = collection.entries

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = entries.findIndex((x) => x.id === active.id)
    const to = entries.findIndex((x) => x.id === over.id)
    if (from < 0 || to < 0) return
    // Neighbours at the drop slot AFTER the moved row leaves its old spot.
    // Whether moving up or down, the landing index within the remaining rows
    // equals the over-row's index in the original array.
    const without = entries.filter((x) => x.id !== active.id)
    const prev = without[to - 1]
    const next = without[to]
    reorderEntry.mutate(
      {
        collectionId: collection.id,
        entryId: String(active.id),
        prevId: prev?.id,
        nextId: next?.id,
      },
      {
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not reorder'
          ),
      }
    )
  }

  async function handleDelete() {
    try {
      await deleteCollection.mutateAsync(collection.id)
      toast.success(`Deleted ${collection.name}`)
      void navigate({ to: '/collections' })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not delete collection'
      )
    }
  }

  const activeEntry = activeId
    ? entries.find((x) => x.id === activeId)
    : null

  return (
    <div className="mx-auto flex max-w-[1136px] flex-col gap-5 p-4 pb-24 md:p-8 md:pt-5">
      <Link
        to="/collections"
        className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ChevronLeft size={16} />
        All collections
      </Link>

      <Hero collection={collection} />

      {entries.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <section aria-label="Collection levels">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Levels · drag to reorder
          </p>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext
              items={entries.map((x) => x.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <SortableRow
                    key={entry.id}
                    entry={entry}
                    dimmed={entry.id === activeId}
                    onRemove={() =>
                      removeEntry.mutate(
                        { collectionId: collection.id, entryId: entry.id },
                        {
                          onError: (err) =>
                            toast.error(
                              err instanceof ApiError
                                ? err.message
                                : 'Could not remove that level'
                            ),
                        }
                      )
                    }
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeEntry ? <Row entry={activeEntry} overlay /> : null}
            </DragOverlay>
          </DndContext>
        </section>
      )}

      <CollectionsFab
        actions={collectionDetailActions({
          isCustom: custom,
          onAddLevels: () => setAddOpen(true),
          onEdit: () => setEditOpen(true),
          onDelete: () => setConfirmDelete(true),
        })}
      />

      <AddLevelsDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        collection={collection}
      />

      <CollectionFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        isSaving={updateCollection.isPending}
        editing={collection}
        onSave={async (input) => {
          await updateCollection.mutateAsync({
            collectionId: collection.id,
            input,
          })
          toast.success('Collection updated')
          setEditOpen(false)
        }}
      />

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(false)
          }}
        >
          <div className="w-full max-w-[420px] rounded-xl border border-border bg-bg-elevated p-6 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-semibold text-text-primary">
              Delete {collection.name}?
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              The collection and its {collection.entries.length}{' '}
              {collection.entries.length === 1 ? 'entry' : 'entries'} will be
              removed. Your logged progress on those levels is untouched.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleDelete()}
                disabled={deleteCollection.isPending}
                className="bg-red-600 hover:bg-red-500"
              >
                {deleteCollection.isPending ? 'Deleting…' : 'Delete collection'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Identity hero — glyph-branded gradient, name (+ Built-in pill), description,
// count. Identity only; no stats.
function Hero({ collection }: { collection: CollectionDetailData }) {
  const identity = collectionIdentity(collection.type, collection.id)
  const Icon = identity.icon
  const count = collection.entries.length

  return (
    <div className="overflow-hidden rounded-card border border-border bg-bg-surface md:flex md:h-[140px] md:items-center">
      <div
        className="relative flex h-24 items-center justify-center md:h-full md:w-[200px] md:shrink-0"
        style={{
          backgroundImage: `linear-gradient(150deg, ${identity.color} 0%, ${withAlpha(
            identity.color,
            0.25
          )} 100%)`,
        }}
      >
        <span className="flex size-12 items-center justify-center rounded-[10px] bg-bg-base/20">
          <Icon size={26} className="text-bg-base" strokeWidth={2.5} />
        </span>
        <span className="absolute inset-y-0 right-0 hidden w-14 bg-gradient-to-r from-transparent to-bg-surface md:block" />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 p-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-2xl font-bold text-text-primary">
            {collection.name}
          </h1>
          {isBuiltIn(collection.type) && (
            <span className="shrink-0 rounded bg-bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-secondary">
              Built-in
            </span>
          )}
        </div>
        {collection.description && (
          <p className="text-sm text-text-secondary">
            {collection.description}
          </p>
        )}
        <p className="text-[13px] font-medium text-text-tertiary">
          {count} {count === 1 ? 'level' : 'levels'}
        </p>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-border py-16 text-center">
      <p className="text-base font-semibold text-text-primary">No levels yet</p>
      <p className="mt-1 text-sm text-text-secondary">
        Add levels to start building this collection.
      </p>
      <Button onClick={onAdd} className="mt-4">
        <Plus size={16} className="mr-1.5" />
        Add levels
      </Button>
    </div>
  )
}

function SortableRow({
  entry,
  dimmed,
  onRemove,
}: {
  entry: CollectionEntry
  dimmed: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: entry.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={dimmed ? 'opacity-40' : undefined}
    >
      <Row
        entry={entry}
        onRemove={onRemove}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

// One member row. `overlay` renders the floating drag copy (no handle wiring).
function Row({
  entry,
  onRemove,
  handleProps,
  overlay = false,
}: {
  entry: CollectionEntry
  onRemove?: () => void
  handleProps?: Record<string, unknown>
  overlay?: boolean
}) {
  const { level } = entry
  return (
    <div
      className={`flex h-[72px] items-center gap-3 rounded-card border border-border bg-bg-surface pl-2 pr-3 md:gap-3.5 md:pr-4 ${
        overlay ? 'shadow-[0_8px_24px_rgba(0,0,0,0.6)]' : ''
      }`}
    >
      <button
        type="button"
        aria-label={`Reorder ${level.name ?? 'level'}`}
        className="flex h-full w-5 shrink-0 cursor-grab touch-none items-center justify-center text-text-tertiary active:cursor-grabbing"
        {...handleProps}
      >
        <GripVertical size={16} />
      </button>
      <img
        src={levelThumbnailUrl(level.inGameId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden'
        }}
        className="hidden h-[54px] w-24 shrink-0 rounded object-cover md:block"
      />
      <DifficultyFace
        difficulty={level.inGameDifficulty}
        featured={level.featured}
        epicValue={level.epicValue}
        rated={level.isRated}
        size={64}
        className="shrink-0 drop-shadow"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-text-primary">
          {level.name ?? `Level #${level.inGameId}`}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          {level.creator && (
            <p className="truncate text-[13px] text-text-secondary">
              {level.creator}
            </p>
          )}
          {/* Mobile: badges drop under the name (mock 1213:2). */}
          <span className="flex items-center gap-1.5 md:hidden">
            <RankingBadge badge={entry.badge} />
          </span>
        </div>
      </div>
      <span className="hidden items-center gap-1.5 md:flex">
        <RankingBadge badge={entry.badge} />
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${level.name ?? 'level'} from collection`}
          onClick={onRemove}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
