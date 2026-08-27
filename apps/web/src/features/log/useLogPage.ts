// All non-presentational logic for the Log page (`src/pages/Log.tsx`):
// data fetching, view state (search/filters/sorts/columns), preset
// selection + persistence, layout measurement, and the row action handlers.
// The page component consumes this and renders — it holds no logic of its own.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useMutationState } from '@tanstack/react-query'
import { useMe, type RatingCategory } from '@/lib/api/me'
import { backOriginState } from '@/lib/backOrigin'
import { useMyProgress, useDeleteProgress } from '@/lib/api/log'
import {
  useListPresets,
  useCreatePreset,
  useUpdatePreset,
  useDeletePreset,
  updatePresetMutationKey,
  type ListPreset,
} from '@/lib/api/presets'
import { useLevelPage } from '@/lib/api/levelPage'
import { useLoggingFlow } from '@/features/logging/LoggingFlowProvider'
import type { FlowPath } from '@/features/logging/types'
import { toast } from '@/components/generic/sonner'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { tableMinWidth } from '@/features/log/tableLayout'
import {
  applyFilters,
  countActiveFilters,
  difficultyRank,
  sortItems,
} from '@/features/log/filtering'
import {
  COLUMNS,
  defaultColumnVisibility,
  defaultColumnOrder,
  getCategoryColumnDefs,
  type ColumnId,
  type ColumnDef,
  type ColumnVisibility,
} from '@/features/log/columns'
import { defaultDir } from '@/features/log/sortMeta'
import {
  ATTEMPTS_DOMAIN,
  DATE_MIN_MS,
  defaultFilterState,
  normalizeFilterState,
  type FilterState,
  type LogItem,
  type SortKey,
  type SortSpec,
} from '@/features/log/types'
import {
  viewConfigsEqual,
  defaultViewConfig,
  DEFAULT_SORTS,
  cleanupPresetForCategories,
  type PresetColorId,
  type ViewConfig,
} from '@/features/log/presets'
import { getPresetCookie, setPresetCookie } from '@/lib/presetCookie'

// The docked filter panel is 320px wide; the content column adds ~48px
// padding at md+. Dock only if the table's min width still fits in what's left.
const PANEL_WIDTH = 320
const CONTENT_PADDING = 48

/**
 * Everything the Log page renders from: the query, the active view, sorting and filtering, and every dialog and sheet it can open.
 */
export function useLogPage() {
  const me = useMe()
  const progress = useMyProgress()
  const presetsQuery = useListPresets()
  const createPreset = useCreatePreset()
  const updatePreset = useUpdatePreset()
  const deletePreset = useDeletePreset()
  const deleteProgress = useDeleteProgress()
  const navigate = useNavigate()
  const location = useLocation()
  const { openForEdit } = useLoggingFlow()

  // Derived (not local state) so concurrent overwrites of different presets
  // don't clear each other's in-flight indicator via a shared onSettled.
  const overwritingPresetIds = useMutationState({
    filters: { mutationKey: updatePresetMutationKey, status: 'pending' },
    select: (mutation) => (mutation.state.variables as { id: string }).id,
  })

  const [pendingDelete, setPendingDelete] = useState<LogItem | null>(null)
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null)
  const [addToCollectionItem, setAddToCollectionItem] =
    useState<LogItem | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState>(defaultFilterState)
  const [sorts, setSorts] = useState<SortSpec[]>(DEFAULT_SORTS)
  const [columns, setColumns] = useState<ColumnVisibility>(
    defaultColumnVisibility
  )
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(defaultColumnOrder)
  const [hideTime, setHideTime] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [presetSheetOpen, setPresetSheetOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<ListPreset | null>(null)

  // Currently active preset: null = Default built-in view
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  // Restore the selected preset from cookie on first load.
  const presetInitialized = useRef(false)
  useEffect(() => {
    if (presetInitialized.current) return
    if (!me.data?.id || presetsQuery.data === undefined) return
    presetInitialized.current = true

    const saved = getPresetCookie(me.data.id)
    if (!saved || saved === 'default') return

    const preset = presetsQuery.data.find((p) => p.id === saved)
    if (!preset) return // preset was deleted — stay on default

    const activeIds = new Set(
      (me.data?.ratingMode === 'WEIGHTED'
        ? (me.data?.ratingCategories ?? [])
        : []
      ).map((c) => c.id)
    )
    const cleaned = cleanupPresetForCategories(preset, activeIds)
    setSelectedPresetId(preset.id)
    setSorts(cleaned.sorts)
    setFilters(cleaned.filters)
    setColumns(cleaned.columns)
    setColumnOrder(cleaned.columnOrder)
    setHideTime(cleaned.hideTime)
  }, [me.data, presetsQuery.data])

  // md+ docks the filter panel inline (live table updates); mobile uses a sheet.
  const isWide = useMediaQuery('(min-width: 768px)')

  // Measure the content row so we can dock the panel only when the table's
  // minimum width still fits beside it — otherwise the panel opens as an overlay
  // (like mobile) rather than squeezing/overlapping the table.
  const [containerWidth, setContainerWidth] = useState(0)
  const resizeObs = useRef<ResizeObserver | null>(null)
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    resizeObs.current?.disconnect()
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    resizeObs.current = ro
  }, [])

  // Fetch full level-page data when the user triggers edit from the list.
  const editLevelQuery = useLevelPage(editingLevelId ?? '')

  const closeEditModal = useCallback(() => {
    setEditingLevelId(null)
  }, [])

  useEffect(() => {
    if (editLevelQuery.isError) {
      toast.error('Failed to load level data')
      closeEditModal()
    }
  }, [editLevelQuery.isError, closeEditModal])

  const items = useMemo(() => progress.data ?? [], [progress.data])
  const presets = useMemo(() => presetsQuery.data ?? [], [presetsQuery.data])

  // Category columns are only available in WEIGHTED mode.
  const activeCategories: RatingCategory[] = useMemo(
    () =>
      me.data?.ratingMode === 'WEIGHTED'
        ? (me.data.ratingCategories ?? [])
        : [],
    [me.data]
  )

  const allColumnDefs: ColumnDef[] = useMemo(
    () => [...COLUMNS, ...getCategoryColumnDefs(activeCategories)],
    [activeCategories]
  )

  const categorySortOptions = useMemo(
    () =>
      [...activeCategories]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({
          key: `cat:${cat.id}` as `cat:${string}`,
          label: cat.name,
        })),
    [activeCategories]
  )

  // When categories change, sync column state: add new cat columns to
  // columnOrder and strip deleted cat references from all view state.
  const prevCatSigRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = activeCategories
      .map((c) => c.id)
      .sort()
      .join(',')
    if (sig === prevCatSigRef.current) return
    prevCatSigRef.current = sig

    const activeIds = new Set(activeCategories.map((c) => c.id))
    const activeCatKeys = new Set([...activeIds].map((id) => `cat:${id}`))
    const isActiveCatKey = (k: string) =>
      !k.startsWith('cat:') || activeCatKeys.has(k)

    setColumnOrder((prev) => {
      const filtered = prev.filter(isActiveCatKey)
      const newCats = ([...activeCatKeys] as ColumnId[]).filter(
        (k) => !filtered.includes(k)
      )
      return newCats.length ? [...filtered, ...newCats] : filtered
    })
    setColumns((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([k]) => isActiveCatKey(k))
      )
    )
    setSorts((prev) => prev.filter((s) => isActiveCatKey(s.key)))
    setFilters((prev) => ({
      ...prev,
      categoryRatings: Object.fromEntries(
        Object.entries(prev.categoryRatings ?? {}).filter(([k]) =>
          activeIds.has(k)
        )
      ),
    }))
    // activeCategories reference changes only when category content changes (TanStack Query stable refs)
  }, [activeCategories])

  const minTableWidth = useMemo(
    () => tableMinWidth(columns, columnOrder, allColumnDefs),
    [columns, columnOrder, allColumnDefs]
  )
  const canDock =
    isWide && containerWidth - PANEL_WIDTH - CONTENT_PADDING >= minTableWidth

  // Push the global FAB left of the docked filter panel while it's open.
  const dockedOpen = canDock && filterOpen
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--fab-shift', dockedOpen ? '320px' : '0px')
    return () => root.style.setProperty('--fab-shift', '0px')
  }, [dockedOpen])

  const { earliestDate, maxAttempts } = useMemo(
    () => filterDomains(items),
    [items]
  )

  const visible = useMemo(
    () =>
      sortItems(applyFilters(items, filters, search), sorts, activeCategories),
    [items, filters, search, sorts, activeCategories]
  )

  const availableLengths = useMemo(() => {
    const order = ['Tiny', 'Short', 'Medium', 'Long', 'XL', 'Platformer']
    const set = new Set<string>()
    for (const i of items) if (i.level.length) set.add(i.level.length)
    return [...set].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  }, [items])

  const availableGameVersions = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.level.gameVersion) set.add(i.level.gameVersion)
    return [...set].sort((a, b) => parseFloat(a) - parseFloat(b))
  }, [items])

  const availableDifficulties = useMemo(() => {
    const set = new Set<string>()
    for (const i of items)
      if (i.level.inGameDifficulty) set.add(i.level.inGameDifficulty)
    return [...set].sort(
      (a, b) => (difficultyRank(a) ?? 99) - (difficultyRank(b) ?? 99)
    )
  }, [items])

  const activeFilterCount = countActiveFilters(filters)

  // Compare the current view config against the selected preset (or the default).
  const currentConfig: ViewConfig = useMemo(
    () => ({ sorts, filters, columns, columnOrder, hideTime }),
    [sorts, filters, columns, columnOrder, hideTime]
  )

  const isPresetModified = useMemo(() => {
    const activeIds = new Set(activeCategories.map((c) => c.id))
    // Normalize a config the same way applyPresetConfig does: add missing active
    // cat keys to columnOrder, and fill in any filter fields added after the
    // preset was saved.
    function normalize(config: ViewConfig) {
      const cleaned = cleanupPresetForCategories(config, activeIds)
      return { ...cleaned, filters: normalizeFilterState(cleaned.filters) }
    }

    if (selectedPresetId === null) {
      return !viewConfigsEqual(currentConfig, normalize(defaultViewConfig()))
    }
    const preset = presets.find((p) => p.id === selectedPresetId)
    if (!preset) return false
    return !viewConfigsEqual(currentConfig, normalize(preset))
  }, [selectedPresetId, currentConfig, presets, activeCategories])

  function applyPresetConfig(config: ViewConfig) {
    // Ensure active cat keys are always in columnOrder regardless of whether the
    // preset or default config was saved before those categories existed.
    const activeCatKeys = activeCategories.map((c) => `cat:${c.id}` as ColumnId)
    const order = config.columnOrder
    const fullOrder = [
      ...order,
      ...activeCatKeys.filter((k) => !order.includes(k)),
    ]
    setSorts(config.sorts)
    setFilters(config.filters)
    setColumns(config.columns)
    setHideTime(config.hideTime)
    setColumnOrder(fullOrder)
  }

  function handleSelectPreset(id: string | null) {
    setSelectedPresetId(id)
    if (me.data?.id) setPresetCookie(me.data.id, id)
    if (id === null) {
      applyPresetConfig(defaultViewConfig())
    } else {
      const preset = presets.find((p) => p.id === id)
      if (preset) {
        const activeIds = new Set(activeCategories.map((c) => c.id))
        applyPresetConfig(cleanupPresetForCategories(preset, activeIds))
      }
    }
  }

  function handleCreatePreset(
    name: string,
    description: string,
    color: PresetColorId
  ) {
    createPreset.mutate(
      { name, description: description || null, color, ...currentConfig },
      {
        onSuccess: (preset) => {
          setSelectedPresetId(preset.id)
          setCreateDialogOpen(false)
          toast.success(`Preset "${preset.name}" saved`)
        },
        onError: () => toast.error('Failed to save preset'),
      }
    )
  }

  function handleOverwritePreset(id: string) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    updatePreset.mutate(
      { id, input: currentConfig },
      {
        onSuccess: () => toast.success(`Preset "${preset.name}" updated`),
        onError: () => toast.error('Failed to update preset'),
      }
    )
  }

  function handleDeletePreset(id: string) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    deletePreset.mutate(id, {
      onSuccess: () => {
        if (selectedPresetId === id) {
          setSelectedPresetId(null)
          applyPresetConfig(defaultViewConfig())
        }
        toast.success(`Preset "${preset.name}" deleted`)
      },
      onError: () => toast.error('Failed to delete preset'),
    })
  }

  function handleUpdatePresetMeta(
    name: string,
    description: string,
    color: PresetColorId
  ) {
    if (!editingPreset) return
    updatePreset.mutate(
      {
        id: editingPreset.id,
        input: { name, description: description || null, color },
      },
      {
        onSuccess: () => {
          setEditingPreset(null)
          toast.success(`Preset "${name}" updated`)
        },
        onError: () => toast.error('Failed to update preset'),
      }
    )
  }

  function toggleSort(key: SortKey) {
    setSorts((prev) => {
      const primary = prev[0]
      if (primary?.key === key) {
        return [{ key, dir: primary.dir === 'asc' ? 'desc' : 'asc' }]
      }
      return [{ key, dir: defaultDir(key) }]
    })
  }

  function resetAll() {
    setSearch('')
    setFilters(defaultFilterState())
  }

  // Both halves of the entry — the run and the level's own fields — are tabs
  // of the one modal, so the row menu has a single Edit action.
  function handleEdit(item: LogItem) {
    setEditingLevelId(item.level.inGameId)
  }

  function handleLog(item: LogItem, path: FlowPath) {
    openForEdit(item.level.inGameId, path)
  }

  function handleNavigate(item: LogItem) {
    void navigate({
      to: '/log/$levelId',
      params: { levelId: item.level.inGameId },
      state: backOriginState(location.href),
    })
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const name = pendingDelete.level.name ?? 'Level'
    deleteProgress.mutate(pendingDelete.level.inGameId, {
      onSuccess: () => {
        toast.success(`Deleted ${name}`)
        setPendingDelete(null)
      },
      onError: () => toast.error(`Couldn't delete ${name}`),
    })
  }

  return {
    // Load gate — `user` is undefined until /v1/me resolves.
    isLoading: me.isPending || progress.isPending,
    user: me.data,

    // Data
    items,
    activeCategories,
    visible,
    presets,
    allColumnDefs,
    categorySortOptions,
    availableLengths,
    availableGameVersions,
    availableDifficulties,
    earliestDate,
    maxAttempts,

    // View state
    search,
    setSearch,
    filters,
    setFilters,
    sorts,
    setSorts,
    columns,
    setColumns,
    columnOrder,
    setColumnOrder,
    hideTime,
    setHideTime,
    toggleSort,
    activeFilterCount,
    canReset: search.trim() !== '' || activeFilterCount > 0,
    resetAll,

    // Layout
    containerRef,
    canDock,
    filterOpen,
    setFilterOpen,
    controlsOpen,
    setControlsOpen,

    // Presets
    selectedPresetId,
    isPresetModified,
    presetSheetOpen,
    setPresetSheetOpen,
    createDialogOpen,
    setCreateDialogOpen,
    editingPreset,
    setEditingPreset,
    deletingPresetId: deletePreset.isPending
      ? (deletePreset.variables ?? null)
      : null,
    overwritingPresetIds,
    isCreatingPreset: createPreset.isPending,
    isUpdatingPreset: updatePreset.isPending,
    handleSelectPreset,
    handleSaveNewPreset: () => setCreateDialogOpen(true),
    handleCreatePreset,
    handleOverwritePreset,
    handleDeletePreset,
    handleEditPreset: setEditingPreset,
    handleUpdatePresetMeta,
    handleDiscardPresetChanges: () => handleSelectPreset(selectedPresetId),

    // Row actions
    handleEdit,
    handleLog,
    handleNavigate,
    addToCollectionItem,
    setAddToCollectionItem,

    // Edit modals
    editingLevelId,
    editLevelData: editLevelQuery.data,
    editLevelFailed: editLevelQuery.isError,
    closeEditModal,

    // Delete confirmation
    pendingDelete,
    setPendingDelete,
    confirmDelete,
    isDeleting: deleteProgress.isPending,
  }
}

// Filter-slider domains that depend on the user's own data: the earliest
// completion date and an attempts ceiling that clears the largest logged run.
function filterDomains(items: LogItem[]) {
  let earliest = DATE_MIN_MS
  let maxAtt = ATTEMPTS_DOMAIN[1]
  let hasCompletionDate = false
  for (const item of items) {
    if (item.status === 'COMPLETED' && item.entry?.date) {
      const ms = new Date(item.entry.date).getTime()
      if (!hasCompletionDate || ms < earliest) {
        earliest = ms
        hasCompletionDate = true
      }
    }
    if (item.entry?.attempts != null && item.entry.attempts > maxAtt) {
      maxAtt = item.entry.attempts
    }
  }
  return {
    earliestDate: hasCompletionDate ? earliest : DATE_MIN_MS,
    maxAttempts: maxAtt,
  }
}
