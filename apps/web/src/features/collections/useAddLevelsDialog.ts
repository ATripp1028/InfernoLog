// Logic for AddLevelsDialog: the level lookup, the two add paths (direct add
// for a visible result, seed-then-confirm for a raw ID), and the flags that
// decide which section the dialog shows. The component renders what this returns.

import { useEffect, useState } from 'react'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import {
  useLevelById,
  useLevelSearch,
  useResolveLevel,
} from '@/lib/api/logging'
import {
  collectionErrorCode,
  useAddCollectionEntry,
  type CollectionDetail,
} from '@/lib/api/collections'
import { sortAndCapSearchResults } from '@/lib/levelSearchResults'
import { useEscalation } from '@/features/search/useEscalation'

import type { SeededLevel } from './SeededLevelPreviewCard'

export type { SeededLevel }

/**
 * State for AddLevelsDialog: the level search, the by-id seed and its confirmation, and the add mutation.
 */
export function useAddLevelsDialog({
  open,
  onClose,
  collection,
  completedIds,
}: {
  open: boolean
  onClose: () => void
  collection: CollectionDetail
  completedIds?: Set<string> | undefined
}) {
  const [query, setQuery] = useState('')
  const [seeded, setSeeded] = useState<SeededLevel | null>(null)
  const [addAnother, setAddAnother] = useState(false)
  const [seedingId, setSeedingId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  const resolveLevel = useResolveLevel()
  const addEntry = useAddCollectionEntry()
  const escalation = useEscalation()

  const trimmed = query.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const search = useLevelSearch(query)
  const cachedLevel = useLevelById(trimmed)

  const inCollection = new Set(collection.entries.map((e) => e.level.inGameId))
  const isWantToBeat = collection.type === 'WANT_TO_BEAT'

  useEffect(() => {
    if (open) {
      setQuery('')
      setSeeded(null)
      setAddAnother(false)
      setSeedingId(null)
      setAddingId(null)
      escalation.clear()
    }
    // escalation is stable enough; re-running only on `open` is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Editing the query drops any prior GD escalation (fresh confirm required).
  function updateQuery(value: string) {
    setQuery(value)
    escalation.clear()
  }

  // Both add paths report the same set of failures.
  function reportAddError(err: unknown) {
    const code = collectionErrorCode(err)
    toast.error(
      code === 'LEVEL_ALREADY_COMPLETED'
        ? 'Already completed — Want to Beat only holds unbeaten levels'
        : err instanceof ApiError
          ? err.message
          : 'Could not add that level'
    )
  }

  // Direct add — for name-search results and known cached IDs where the user
  // can see exactly what they're clicking.
  async function handleDirectAdd(levelId: string, levelName: string | null) {
    setAddingId(levelId)
    try {
      await addEntry.mutateAsync({ collectionId: collection.id, levelId })
      toast.success(`Added ${levelName ?? 'level'} to ${collection.name}`)
      setQuery('')
      if (!addAnother) onClose()
    } catch (err) {
      reportAddError(err)
    } finally {
      setAddingId(null)
    }
  }

  // Seeded add — fetch an unknown ID from RobTop, then hold for confirmation.
  async function seedAndSelect(levelId: string) {
    setSeedingId(levelId)
    try {
      const res = await resolveLevel.mutateAsync(levelId)
      if (!res.level) {
        toast.error(
          'That level could not be fetched from the GD servers. Log it once to add it manually.'
        )
        return
      }
      setSeeded({
        inGameId: res.level.inGameId,
        name: res.level.name,
        creator: res.level.creator,
        inGameDifficulty: res.level.inGameDifficulty,
        featured: res.level.featured,
        epicValue: res.level.epicValue,
        isRated: res.level.isRated,
        completed: res.existingCompletion !== null,
      })
      setQuery('')
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not look up that level'
      )
    } finally {
      setSeedingId(null)
    }
  }

  // Confirm add after seeding.
  async function handleSeededAdd() {
    if (!seeded || seeded.completed) return
    try {
      await addEntry.mutateAsync({
        collectionId: collection.id,
        levelId: seeded.inGameId,
      })
      toast.success(`Added ${seeded.name ?? 'level'} to ${collection.name}`)
      if (addAnother) {
        setSeeded(null)
        setQuery('')
      } else {
        onClose()
      }
    } catch (err) {
      reportAddError(err)
    }
  }

  // Enter on a numeric query adds the cached level, or seeds it from RobTop.
  function submitQuery() {
    if (!isNumeric) return
    if (cachedLevel.data) {
      void handleDirectAdd(cachedLevel.data.inGameId, cachedLevel.data.name)
    } else {
      void seedAndSelect(trimmed)
    }
  }

  const seededAlreadyAdded = !!seeded && inCollection.has(seeded.inGameId)
  const seededBlocked = !!seeded && isWantToBeat && seeded.completed

  const showResults = !isNumeric && trimmed.length >= 2 && !seedingId && !seeded
  const showCachedPreview =
    isNumeric &&
    trimmed.length >= 4 &&
    !!cachedLevel.data &&
    !seedingId &&
    !seeded
  const showSeedHint =
    isNumeric &&
    trimmed.length >= 4 &&
    !cachedLevel.data &&
    !cachedLevel.isFetching &&
    !seedingId &&
    !seeded

  return {
    // Query + results
    query,
    trimmed,
    updateQuery,
    submitQuery,
    escalation,
    searchPending: search.isPending,
    results: sortAndCapSearchResults(
      search.data ?? [],
      (r) =>
        inCollection.has(r.inGameId) || (completedIds?.has(r.inGameId) ?? false)
    ),
    cachedLevel: cachedLevel.data,

    // Which section renders
    showResults,
    showCachedPreview,
    showSeedHint,
    showEmptyPrompt:
      !seeded &&
      !showResults &&
      !showCachedPreview &&
      !showSeedHint &&
      !seedingId,

    // Row state. A badge means the row can't be picked: already a member of
    // this collection, or (Want to Beat only, via completedIds) already beaten.
    rowBadge: (levelId: string): string | null =>
      inCollection.has(levelId)
        ? 'Added'
        : (completedIds?.has(levelId) ?? false)
          ? 'Already beaten'
          : null,
    addingId,
    isAdding: addEntry.isPending,

    // Add paths
    addLevel: (levelId: string, levelName: string | null) =>
      void handleDirectAdd(levelId, levelName),
    seedAndSelect: (levelId: string) => void seedAndSelect(levelId),
    seedingId,
    seeded,
    clearSeeded: () => setSeeded(null),
    seededAlreadyAdded,
    seededBlocked,
    confirmSeeded: () => void handleSeededAdd(),
    canConfirm: !!seeded && !seededBlocked && !addEntry.isPending,

    // Footer
    addAnother,
    setAddAnother,
  }
}
