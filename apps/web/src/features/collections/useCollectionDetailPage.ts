// All non-presentational logic for the collection detail page
// (`src/pages/CollectionDetail.tsx`), split the same way the page is: the
// shell hook covers the query + dialog state + FAB registration and runs
// before data lands; the loaded hook covers everything that needs a resolved
// collection (drag-to-reorder and the ordered list's search, remove, rename,
// convert, delete). An unordered collection's browse is useUnorderedEntryList.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutationState } from '@tanstack/react-query'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  CollectionOrdering,
  isCollectionOrderingConvertible,
} from '@infernolog/core'
import { toast } from '@/components/generic/sonner'
import { useSortableSensors } from '@/lib/dnd/useSortableSensors'
import { ApiError } from '@/lib/api/client'
import {
  useCollection,
  useDeleteCollection,
  useRemoveCollectionEntry,
  useReorderCollectionEntry,
  useSetCollectionOrdering,
  useUpdateCollection,
  type CollectionDetail as CollectionDetailData,
} from '@/lib/api/collections'
import { isBuiltIn } from './identity'
import { collectionDetailActions } from './collectionDetailActions'
import { entryMatches } from './entryFilter'
import { useFabActions } from '@/context/FabActionsContext'

/**
 * The ordering a collection would convert to.
 */
function otherOrdering(ordering: CollectionOrdering): CollectionOrdering {
  return ordering === CollectionOrdering.ORDERED
    ? CollectionOrdering.UNORDERED
    : CollectionOrdering.ORDERED
}

/**
 * Page shell: the collection query, the dialogs' open state, and the
 * collection-scoped FAB.
 */
export function useCollectionDetailPage(collectionId: string) {
  const collection = useCollection(collectionId)
  const [addOpen, setAddOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [confirmConvert, setConfirmConvert] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Registered unconditionally (like LevelPage's owner-actions override) so
  // the FAB switches to this collection's actions in the same commit data
  // arrives, rather than showing the unrelated global default (logging)
  // actions for the entire loading window — collection pages used to
  // suppress that default FAB outright while loading.
  useFabActions(
    collection.data
      ? collectionDetailActions({
          isCustom: !isBuiltIn(collection.data.type),
          convertTo: isCollectionOrderingConvertible(collection.data.type)
            ? otherOrdering(collection.data.ordering)
            : null,
          onAddLevels: () => setAddOpen(true),
          onCopyTo: () => setCopyOpen(true),
          onConvert: () => setConfirmConvert(true),
          onEdit: () => setEditOpen(true),
          onDelete: () => setConfirmDelete(true),
        })
      : null
  )

  return {
    isLoading: collection.isPending,
    data: collection.data,
    // True for a collection that does not exist, as opposed to a request that
    // failed for any other reason — the two get different copy.
    isMissing:
      collection.error instanceof ApiError && collection.error.status === 404,
    failed: collection.error != null || !collection.data,
    addOpen,
    setAddOpen,
    copyOpen,
    setCopyOpen,
    confirmConvert,
    setConfirmConvert,
    editOpen,
    setEditOpen,
    confirmDelete,
    setConfirmDelete,
  }
}

/**
 * Everything that needs a resolved collection.
 */
export function useLoadedCollection(
  collection: CollectionDetailData,
  // Called after a rename saves, so the page can close its edit dialog.
  onEditSaved: () => void,
  // Called after a conversion lands, so the page can close its confirm.
  onConverted: () => void = () => {}
) {
  const navigate = useNavigate()

  const updateCollection = useUpdateCollection()
  const deleteCollection = useDeleteCollection()
  const removeEntry = useRemoveCollectionEntry()
  const reorderEntry = useReorderCollectionEntry()
  const setOrdering = useSetCollectionOrdering()
  const removingEntryIds = useMutationState({
    filters: { mutationKey: ['removeCollectionEntry'], status: 'pending' },
    select: (mutation) =>
      (mutation.state.variables as { entryId: string } | undefined)?.entryId,
  })

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSortableSensors()

  // Locally-controlled entry order so drag-end re-renders are immediate rather
  // than waiting for the async onMutate cache update (mirrors DemonListBoard's
  // containers pattern). Sync back from the cache only when the queue is idle.
  const pendingCollectionsCount = useMutationState({
    filters: { mutationKey: ['collectionReorder'], status: 'pending' },
  }).length
  const [displayEntries, setDisplayEntries] = useState(collection.entries)
  useEffect(() => {
    if (activeId) return
    if (pendingCollectionsCount > 0) return
    setDisplayEntries(collection.entries)
  }, [collection.entries, activeId, pendingCollectionsCount])

  // The ordered list's search box. While it narrows the list, rows keep their
  // real positions and dragging is off — the neighbours of a drop among
  // filtered rows would not be the entry's real neighbours.
  const [filterQuery, setFilterQuery] = useState('')
  const filterActive = filterQuery.trim().length > 0
  const visibleRows = useMemo(
    () =>
      displayEntries
        .map((entry, i) => ({ entry, position: i + 1 }))
        .filter(({ entry }) => entryMatches(entry, filterQuery)),
    [displayEntries, filterQuery]
  )

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = displayEntries.findIndex((x) => x.id === active.id)
    const to = displayEntries.findIndex((x) => x.id === over.id)
    if (from < 0 || to < 0) return
    setDisplayEntries((cur) => arrayMove(cur, from, to))
    // Neighbours at the drop slot AFTER the moved row leaves its old spot.
    // Whether moving up or down, the landing index within the remaining rows
    // equals the over-row's index in the original array.
    const without = displayEntries.filter((x) => x.id !== active.id)
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

  function handleRemoveEntry(entryId: string) {
    removeEntry.mutate(
      { collectionId: collection.id, entryId },
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

  async function handleSaveEdit(input: {
    name: string
    description: string | null
  }) {
    await updateCollection.mutateAsync({ collectionId: collection.id, input })
    toast.success('Collection updated')
    onEditSaved()
  }

  const convertTo = otherOrdering(collection.ordering)

  async function handleConvert() {
    try {
      await setOrdering.mutateAsync({
        collectionId: collection.id,
        ordering: convertTo,
      })
      toast.success(
        convertTo === CollectionOrdering.UNORDERED
          ? `${collection.name} is now unordered`
          : `${collection.name} is now ordered`
      )
      onConverted()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not convert collection'
      )
    }
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

  const activeIndex = activeId
    ? displayEntries.findIndex((x) => x.id === activeId)
    : -1

  return {
    displayEntries,
    removingEntryIds,
    handleRemoveEntry,

    // The ordered list's search
    filterQuery,
    setFilterQuery,
    filterActive,
    visibleRows,

    // Drag to reorder
    sensors,
    activeId,
    activeIndex,
    activeEntry: activeIndex >= 0 ? displayEntries[activeIndex] : null,
    handleDragStart,
    handleDragEnd,
    handleDragCancel: () => setActiveId(null),

    // Rename / convert / delete
    handleSaveEdit,
    isSaving: updateCollection.isPending,
    convertTo,
    handleConvert: () => void handleConvert(),
    isConverting: setOrdering.isPending,
    handleDelete: () => void handleDelete(),
    isDeleting: deleteCollection.isPending,
  }
}
