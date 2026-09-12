import { Link } from '@tanstack/react-router'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { CollectionOrdering } from '@infernolog/core'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { AlertDialog } from '@/components/generic/alert-dialog'
import { PageLoading } from '@/components/shell/PageLoading'
import type { CollectionDetail as CollectionDetailData } from '@/lib/api/collections'
import {
  collectionIdentity,
  isBuiltIn,
  withAlpha,
} from '@/features/collections/identity'
import { CollectionFormDialog } from '@/features/collections/CollectionFormDialog'
import { AddLevelsDialog } from '@/features/collections/AddLevelsDialog'
import { CopyToCollectionDialog } from '@/features/collections/CopyToCollectionDialog'
import { Row, SortableRow } from '@/features/collections/CollectionEntryRow'
import { UnorderedEntryList } from '@/features/collections/UnorderedEntryList'
import { EmptyState } from '@/components/data/EmptyState'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import {
  useCollectionDetailPage,
  useLoadedCollection,
} from '@/features/collections/useCollectionDetailPage'

// The Search page's padding, full width; the extra bottom padding clears the
// FAB and the mobile nav.
const PAGE_PADDING = 'p-4 pb-24 md:p-6'

/**
 * Collection detail — identity hero, then the levels: an ordered collection
 * lists them in its curated order with drag-to-reorder and a search box; an
 * unordered one is browsed with the search page's bar (sort + filters). Every
 * row has a remove button. The context-scoped FAB carries Add levels, Add to
 * another collection, Convert, Edit and Delete (built-ins lose Edit/Delete;
 * Favorites and Least Favorites can't convert). All logic lives in
 * useCollectionDetailPage.
 * Mocks: desktop 1206:164, tablet 1212:2, mobile 1213:2; empty 1241:3;
 * built-in variant 1256:2 / 1257:2.
 */
export function CollectionDetail({ collectionId }: { collectionId: string }) {
  const page = useCollectionDetailPage(collectionId)

  if (page.isLoading) return <PageLoading />
  if (page.failed || !page.data) {
    return (
      <div className={PAGE_PADDING}>
        <p className="text-sm text-danger">
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

  return <Loaded collection={page.data} page={page} />
}

function Loaded({
  collection,
  page,
}: {
  collection: CollectionDetailData
  page: ReturnType<typeof useCollectionDetailPage>
}) {
  const loaded = useLoadedCollection(
    collection,
    () => page.setEditOpen(false),
    () => page.setConfirmConvert(false)
  )
  const toUnordered = loaded.convertTo === CollectionOrdering.UNORDERED

  return (
    <div className={`flex flex-col gap-5 ${PAGE_PADDING}`}>
      <Link
        to="/collections"
        className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ChevronLeft size={16} />
        All collections
      </Link>

      <Hero collection={collection} />

      {loaded.displayEntries.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="No levels yet"
          description="Add levels to start building this collection."
          action={
            <Button onClick={() => page.setAddOpen(true)}>
              <Plus size={16} className="mr-1.5" />
              Add levels
            </Button>
          }
        />
      ) : collection.ordering === CollectionOrdering.UNORDERED ? (
        <UnorderedEntryList
          collection={collection}
          removingEntryIds={loaded.removingEntryIds}
          onRemove={loaded.handleRemoveEntry}
        />
      ) : (
        <OrderedEntries loaded={loaded} />
      )}

      <AddLevelsDialog
        open={page.addOpen}
        onClose={() => page.setAddOpen(false)}
        collection={collection}
      />

      <CopyToCollectionDialog
        open={page.copyOpen}
        onClose={() => page.setCopyOpen(false)}
        source={collection}
      />

      <CollectionFormDialog
        open={page.editOpen}
        onClose={() => page.setEditOpen(false)}
        isSaving={loaded.isSaving}
        editing={collection}
        onSave={loaded.handleSaveEdit}
      />

      {/* Converting to unordered throws the curated order away for good, so
          that direction is worded — and styled — as destructive. */}
      <AlertDialog
        open={page.confirmConvert}
        onOpenChange={(o) => !o && page.setConfirmConvert(false)}
        title={
          toUnordered
            ? `Convert ${collection.name} to unordered?`
            : `Convert ${collection.name} to ordered?`
        }
        description={
          toUnordered
            ? 'Its current order will be lost, and converting back will not restore it. Levels will be listed by level ID, and you can sort and filter them like on the search page instead of dragging them.'
            : 'Levels will start in level ID order. You can then drag them into any order you like.'
        }
        confirmLabel={toUnordered ? 'Convert and lose order' : 'Convert'}
        destructive={toUnordered}
        isPending={loaded.isConverting}
        onConfirm={loaded.handleConvert}
      />

      {/* Deleting navigates to /collections on success, which unmounts this
          page — so nothing closes the dialog on the happy path. A failure
          toasts and leaves it open to retry. */}
      <AlertDialog
        open={page.confirmDelete}
        onOpenChange={(o) => !o && page.setConfirmDelete(false)}
        title={`Delete ${collection.name}?`}
        description={`The collection and its ${collection.entries.length} ${
          collection.entries.length === 1 ? 'entry' : 'entries'
        } will be removed. Your logged progress on those levels is untouched.`}
        confirmLabel="Delete collection"
        destructive
        isPending={loaded.isDeleting}
        onConfirm={loaded.handleDelete}
      />
    </div>
  )
}

// An ordered collection's rows: a search box, then the curated order with
// drag-to-reorder — or, while the search narrows the list, the matching rows
// at their real positions with dragging off.
function OrderedEntries({
  loaded,
}: {
  loaded: ReturnType<typeof useLoadedCollection>
}) {
  const total = loaded.displayEntries.length

  return (
    <section aria-label="Collection levels" className="flex flex-col gap-3">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <Input
          type="search"
          value={loaded.filterQuery}
          onChange={(e) => loaded.setFilterQuery(e.target.value)}
          placeholder="Search this collection by name, creator, or level ID…"
          aria-label="Search this collection"
          autoComplete="off"
          className="h-11 pl-9"
        />
      </div>

      <SectionLabel tone="secondary">
        {loaded.filterActive
          ? `${loaded.visibleRows.length} of ${total} levels · clear the search to reorder`
          : 'Levels · drag to reorder'}
      </SectionLabel>

      {loaded.filterActive ? (
        loaded.visibleRows.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-subtle p-6 text-center text-sm text-text-secondary">
            No levels in this collection match &ldquo;
            {loaded.filterQuery.trim()}&rdquo;
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {loaded.visibleRows.map(({ entry, position }) => (
              <Row
                key={entry.id}
                position={position}
                entry={entry}
                reorderable={false}
                removing={loaded.removingEntryIds.includes(entry.id)}
                onRemove={() => loaded.handleRemoveEntry(entry.id)}
              />
            ))}
          </div>
        )
      ) : (
        <DndContext
          sensors={loaded.sensors}
          onDragStart={loaded.handleDragStart}
          onDragEnd={loaded.handleDragEnd}
          onDragCancel={loaded.handleDragCancel}
        >
          <SortableContext
            items={loaded.displayEntries.map((x) => x.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {loaded.displayEntries.map((entry, i) => (
                <SortableRow
                  key={entry.id}
                  position={i + 1}
                  entry={entry}
                  dimmed={entry.id === loaded.activeId}
                  removing={loaded.removingEntryIds.includes(entry.id)}
                  onRemove={() => loaded.handleRemoveEntry(entry.id)}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {loaded.activeEntry ? (
              <Row
                entry={loaded.activeEntry}
                position={loaded.activeIndex + 1}
                overlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  )
}

// Identity hero — glyph-branded gradient, name (+ Built-in and ordering
// pills), description, count. Identity only; no stats.
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
          <span className="shrink-0 rounded bg-bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-secondary">
            {collection.ordering === CollectionOrdering.UNORDERED
              ? 'Unordered'
              : 'Ordered'}
          </span>
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
