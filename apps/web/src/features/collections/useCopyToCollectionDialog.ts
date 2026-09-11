// Logic for CopyToCollectionDialog: the candidate targets (every other
// collection, each with how many levels the copy would add), the picker's
// search and selection, and the copy itself.

import { useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import {
  useCollectionDetails,
  useCollections,
  useCopyCollectionEntries,
  type CollectionDetail,
  type CollectionSummary,
} from '@/lib/api/collections'
import { copyResultMessage, newLevelCount } from './copyPreview'

/**
 * A collection the source could be added to. `newCount` is null until that
 * collection's entries have loaded.
 */
export interface CopyTarget {
  collection: CollectionSummary
  newCount: number | null
}

/**
 * State for CopyToCollectionDialog.
 */
export function useCopyToCollectionDialog({
  open,
  onClose,
  source,
}: {
  open: boolean
  onClose: () => void
  source: CollectionDetail
}) {
  const collections = useCollections()
  const copy = useCopyCollectionEntries()
  const [query, setQuery] = useState('')
  const [targetId, setTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTargetId(null)
    }
  }, [open])

  const others = useMemo(
    () => (collections.data ?? []).filter((c) => c.id !== source.id),
    [collections.data, source.id]
  )
  // Every candidate's entries, to count what the copy would add to it. Only
  // loaded while the dialog is open.
  const details = useCollectionDetails(
    others.map((c) => c.id),
    open
  )
  const targets: CopyTarget[] = others.map((collection, i) => {
    const detail = details[i]?.data
    return {
      collection,
      newCount: detail ? newLevelCount(source, detail) : null,
    }
  })

  const q = query.trim().toLowerCase()
  const visibleTargets = q
    ? targets.filter((t) => t.collection.name.toLowerCase().includes(q))
    : targets
  const selected = targets.find((t) => t.collection.id === targetId) ?? null
  const canSubmit = !!selected && selected.newCount !== 0 && !copy.isPending

  async function handleCopy() {
    if (!selected || !canSubmit) return
    try {
      const result = await copy.mutateAsync({
        collectionId: selected.collection.id,
        sourceCollectionId: source.id,
      })
      toast.success(copyResultMessage(result, selected.collection.name))
      onClose()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not add those levels'
      )
    }
  }

  const submitLabel = copy.isPending
    ? 'Adding…'
    : !selected
      ? 'Choose a collection'
      : selected.newCount === null
        ? `Add to ${selected.collection.name}`
        : `Add ${selected.newCount} ${
            selected.newCount === 1 ? 'level' : 'levels'
          } to ${selected.collection.name}`

  return {
    query,
    setQuery,
    isLoading: collections.isPending,
    failed: collections.isError,
    hasOthers: others.length > 0,
    targets: visibleTargets,
    targetId,
    selectTarget: setTargetId,
    canSubmit,
    submitLabel,
    handleCopy: () => void handleCopy(),
    isSubmitting: copy.isPending,
  }
}
