// Collection detail — identity hero, drag-to-reorder member rows with
// per-row remove and GDDL/AREDL badges, and the context-scoped FAB menu
// (Add levels / Edit / Delete; built-ins keep only Add levels). All logic
// lives in useCollectionDetailPage.
// Mocks: desktop 1206:164, tablet 1212:2, mobile 1213:2; empty 1241:3;
// built-in variant 1256:2 / 1257:2.

import { Link } from '@tanstack/react-router'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/PageLoading'
import type { CollectionDetail as CollectionDetailData } from '@/lib/api/collections'
import {
  collectionIdentity,
  isBuiltIn,
  withAlpha,
} from '@/features/collections/identity'
import { CollectionFormDialog } from '@/features/collections/CollectionFormDialog'
import { AddLevelsDialog } from '@/features/collections/AddLevelsDialog'
import { Row, SortableRow } from '@/features/collections/CollectionEntryRow'
import {
  useCollectionDetailPage,
  useLoadedCollection,
} from '@/features/collections/useCollectionDetailPage'

export function CollectionDetail({ collectionId }: { collectionId: string }) {
  const page = useCollectionDetailPage(collectionId)

  if (page.isLoading) return <PageLoading />
  if (page.failed || !page.data) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-500">
          {page.isMissing
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

  return (
    <Loaded
      collection={page.data}
      addOpen={page.addOpen}
      setAddOpen={page.setAddOpen}
      editOpen={page.editOpen}
      setEditOpen={page.setEditOpen}
      confirmDelete={page.confirmDelete}
      setConfirmDelete={page.setConfirmDelete}
    />
  )
}

function Loaded({
  collection,
  addOpen,
  setAddOpen,
  editOpen,
  setEditOpen,
  confirmDelete,
  setConfirmDelete,
}: {
  collection: CollectionDetailData
  addOpen: boolean
  setAddOpen: (v: boolean) => void
  editOpen: boolean
  setEditOpen: (v: boolean) => void
  confirmDelete: boolean
  setConfirmDelete: (v: boolean) => void
}) {
  const {
    displayEntries,
    removingEntryIds,
    handleRemoveEntry,
    sensors,
    activeId,
    activeIndex,
    activeEntry,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    handleSaveEdit,
    isSaving,
    handleDelete,
    isDeleting,
  } = useLoadedCollection(collection, () => setEditOpen(false))

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

      {displayEntries.length === 0 ? (
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
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={displayEntries.map((x) => x.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {displayEntries.map((entry, i) => (
                  <SortableRow
                    key={entry.id}
                    position={i + 1}
                    entry={entry}
                    dimmed={entry.id === activeId}
                    removing={removingEntryIds.includes(entry.id)}
                    onRemove={() => handleRemoveEntry(entry.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeEntry ? (
                <Row entry={activeEntry} position={activeIndex + 1} overlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>
      )}

      <AddLevelsDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        collection={collection}
      />

      <CollectionFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        isSaving={isSaving}
        editing={collection}
        onSave={handleSaveEdit}
      />

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(false)
          }}
        >
          <div className="w-full max-w-[420px] rounded-xl border border-border bg-bg-surface p-6 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
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
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-500"
              >
                {isDeleting ? 'Deleting…' : 'Delete collection'}
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
