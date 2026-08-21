// Logic for AddToCollectionDialog: the two-step (level → collections) state
// machine, the level lookup/seed paths (a raw id is held for confirmation, a
// picked GD-search result is not), the collection list the picker shows, and
// the parallel add on confirm. The component renders what this returns.

import { useEffect, useMemo, useState } from 'react'
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
  useCollectionDetails,
  useCollections,
} from '@/lib/api/collections'
import { useMyProgress } from '@/lib/api/list'
import { sortAndCapSearchResults } from '@/lib/levelSearchResults'
import { useEscalation } from '@/features/search/useEscalation'
import { isBuiltIn } from './identity'

import type {
  SeededLevel,
  SeededLevelPreviewData,
} from './SeededLevelPreviewCard'

/**
 * The level the dialog is adding — enough to render it and to write the entry.
 *
 * `completed` is optional because only some sources know it: a level resolved
 * from RobTop reports its own completion, while a search result or a cached
 * level carries no viewer state at all. See `pickedIsCompleted`.
 */
export type PickedLevel = SeededLevelPreviewData & { completed?: boolean }

export type { SeededLevel }

/**
 * State for AddToCollectionDialog: which collections the level is already in, the search/seed flow, and the add and remove writes.
 */
export function useAddToCollectionDialog({
  open,
  onClose,
  preselectedLevel,
}: {
  open: boolean
  onClose: () => void
  preselectedLevel?: PickedLevel | undefined
}) {
  const [step, setStep] = useState<'search' | 'pick'>(
    preselectedLevel ? 'pick' : 'search'
  )
  const [pickedLevel, setPickedLevel] = useState<PickedLevel | null>(
    preselectedLevel ?? null
  )
  const [levelQuery, setLevelQuery] = useState('')
  const [collectionQuery, setCollectionQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [seedingId, setSeedingId] = useState<string | null>(null)
  const [seededLevel, setSeededLevel] = useState<SeededLevel | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resolveLevel = useResolveLevel()
  const addEntry = useAddCollectionEntry()
  const collections = useCollections()
  const list = useMyProgress()
  const escalation = useEscalation()

  const completedIds = useMemo(
    () =>
      new Set(
        list.data
          ?.filter((i) => i.status === 'COMPLETED')
          .map((i) => i.level.inGameId) ?? []
      ),
    [list.data]
  )

  const trimmed = levelQuery.trim()
  const isNumeric = /^\d+$/.test(trimmed)
  const search = useLevelSearch(levelQuery)
  const cachedLevel = useLevelById(trimmed)

  useEffect(() => {
    if (open) {
      setStep(preselectedLevel ? 'pick' : 'search')
      setPickedLevel(preselectedLevel ?? null)
      setLevelQuery('')
      setCollectionQuery('')
      setSelectedIds(new Set())
      setSeedingId(null)
      setSeededLevel(null)
      setIsSubmitting(false)
      escalation.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedLevel])

  // Editing the query drops any prior GD escalation (fresh confirm required).
  function updateLevelQuery(value: string) {
    setLevelQuery(value)
    escalation.clear()
  }

  // Batch-load collection details only once the user reaches the pick step.
  const collectionIds = useMemo(
    () => (collections.data ?? []).map((c) => c.id),
    [collections.data]
  )
  const collectionDetailQueries = useCollectionDetails(
    collectionIds,
    step === 'pick'
  )

  // Set of collection IDs that already contain the picked level (from loaded details).
  const levelAlreadyInCollectionIds = useMemo(() => {
    const result = new Set<string>()
    if (!pickedLevel) return result
    collectionIds.forEach((id, i) => {
      const q = collectionDetailQueries[i]
      if (
        q?.data?.entries.some((e) => e.level.inGameId === pickedLevel.inGameId)
      ) {
        result.add(id)
      }
    })
    return result
  }, [collectionIds, collectionDetailQueries, pickedLevel])

  // Auto-uncheck any selection that is discovered to already have the level.
  useEffect(() => {
    if (levelAlreadyInCollectionIds.size === 0) return
    setSelectedIds((prev) => {
      const toRemove = [...prev].filter((id) =>
        levelAlreadyInCollectionIds.has(id)
      )
      if (toRemove.length === 0) return prev
      const next = new Set(prev)
      toRemove.forEach((id) => next.delete(id))
      return next
    })
  }, [levelAlreadyInCollectionIds])

  function selectLevel(level: PickedLevel) {
    setPickedLevel(level)
    setCollectionQuery('')
    setSelectedIds(new Set())
    setStep('pick')
  }

  // Fetch a level from RobTop into the shared cache. Returns the seeded level,
  // or null when it could not be fetched (reported here, not by the caller).
  // The caller owns the seeding indicator, so it stays up until whatever it
  // does with the level has been rendered.
  async function seedLevel(levelId: string): Promise<SeededLevel | null> {
    try {
      const res = await resolveLevel.mutateAsync(levelId)
      if (!res.level) {
        toast.error(
          'That level could not be fetched from the GD servers. Log it once to add it manually.'
        )
        return null
      }
      return {
        inGameId: res.level.inGameId,
        name: res.level.name,
        creator: res.level.creator,
        inGameDifficulty: res.level.inGameDifficulty,
        featured: res.level.featured,
        epicValue: res.level.epicValue,
        isRated: res.level.isRated,
        completed: res.existingCompletion !== null,
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not look up that level'
      )
      return null
    }
  }

  // Raw id typed by the user — nothing about the level was visible before the
  // fetch, so hold it on a confirmation card before step 2.
  async function seedAndPick(levelId: string) {
    setSeedingId(levelId)
    try {
      const level = await seedLevel(levelId)
      if (!level) return
      setSeededLevel(level)
      setLevelQuery('')
    } finally {
      setSeedingId(null)
    }
  }

  // GD-search pick — the result row already showed name, creator, id and
  // difficulty, so seeding it leads straight to the collection picker. The
  // query is left alone so Back returns to those same results.
  async function seedAndSelect(levelId: string) {
    setSeedingId(levelId)
    try {
      const level = await seedLevel(levelId)
      if (level) selectLevel(level)
    } finally {
      setSeedingId(null)
    }
  }

  // Enter on a numeric query picks the cached level, or seeds it from RobTop.
  function submitLevelQuery() {
    if (!isNumeric) return
    if (cachedLevel.data) selectLevel(cachedLevel.data)
    else void seedAndPick(trimmed)
  }

  function toggleCollection(collectionId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(collectionId)
      else next.delete(collectionId)
      return next
    })
  }

  async function handleAdd() {
    if (!pickedLevel || selectedIds.size === 0 || isSubmitting) return
    setIsSubmitting(true)
    const idList = [...selectedIds]
    try {
      const results = await Promise.allSettled(
        idList.map((collectionId) =>
          addEntry.mutateAsync({ collectionId, levelId: pickedLevel.inGameId })
        )
      )
      const successNames: string[] = []
      results.forEach((r, i) => {
        const id = idList[i]!
        const colName =
          collections.data?.find((c) => c.id === id)?.name ?? 'collection'
        if (r.status === 'fulfilled') {
          successNames.push(colName)
        } else {
          const code = collectionErrorCode(r.reason)
          toast.error(
            code === 'LEVEL_ALREADY_COMPLETED'
              ? `${colName}: Want to Beat only holds unbeaten levels`
              : r.reason instanceof ApiError
                ? r.reason.message
                : `Could not add to ${colName}`
          )
        }
      })
      if (successNames.length > 0) {
        toast.success(`Added to ${successNames.join(', ')}`)
        onClose()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Step 1: level search ───────────────────────────────────────────

  const showResults =
    !isNumeric && trimmed.length >= 2 && !seedingId && !seededLevel
  const showCachedPreview =
    isNumeric &&
    trimmed.length >= 4 &&
    !!cachedLevel.data &&
    !seedingId &&
    !seededLevel
  const showSeedHint =
    isNumeric &&
    trimmed.length >= 4 &&
    !cachedLevel.data &&
    !cachedLevel.isFetching &&
    !seedingId &&
    !seededLevel

  // ── Step 2: collection picker ──────────────────────────────────────

  // The level's own flag wins where it exists — a level just resolved from
  // RobTop reports its completion directly, and one the user has never logged
  // is absent from the progress list entirely. Search results and cached
  // levels carry no viewer state, so those still resolve against the list.
  const pickedIsCompleted =
    pickedLevel?.completed ??
    (!!pickedLevel && completedIds.has(pickedLevel.inGameId))
  const allCollections = (collections.data ?? []).filter(
    (c) => !(pickedIsCompleted && c.type === 'WANT_TO_BEAT')
  )
  const filteredCollections = collectionQuery.trim()
    ? allCollections.filter((c) =>
        c.name.toLowerCase().includes(collectionQuery.toLowerCase())
      )
    : allCollections

  return {
    step,
    goBackToSearch: () => setStep('search'),
    // Step 1 is skipped entirely when the caller supplied the level.
    canGoBack: step === 'pick' && !preselectedLevel,

    // Level search
    levelQuery,
    trimmed,
    isNumeric,
    updateLevelQuery,
    submitLevelQuery,
    escalation,
    searchPending: search.isPending,
    results: sortAndCapSearchResults(search.data ?? [], () => false),
    cachedLevel: cachedLevel.data,
    showResults,
    showCachedPreview,
    showSeedHint,
    // True when nothing at all has been typed or resolved yet.
    showEmptyPrompt:
      !showResults &&
      !showCachedPreview &&
      !showSeedHint &&
      !seedingId &&
      !seededLevel,
    seedingId,
    seededLevel,
    clearSeededLevel: () => setSeededLevel(null),
    seedAndPick: (levelId: string) => void seedAndPick(levelId),
    seedAndSelect: (levelId: string) => void seedAndSelect(levelId),
    selectLevel,

    // Collection picker
    pickedLevel,
    collectionQuery,
    setCollectionQuery,
    collectionsLoading: collections.isLoading,
    collectionsFailed: collections.isError,
    hasBuiltIns: collections.data?.some((c) => isBuiltIn(c.type)) ?? false,
    filteredCollections,
    selectedIds,
    levelAlreadyInCollectionIds,
    toggleCollection,

    // Confirm
    handleAdd: () => void handleAdd(),
    isSubmitting,
  }
}
