import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import { useMe } from '../lib/api/me'
import { useMyProgress, useDeleteProgress } from '../lib/api/list'
import {
  useListPresets,
  useCreatePreset,
  useUpdatePreset,
  useDeletePreset,
  type ListPreset,
} from '../lib/api/presets'
import { useLevelPage } from '../lib/api/levelPage'
import { PageLoading } from '../components/PageLoading'
import { TooltipProvider } from '../components/ui/tooltip'
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet'
import { AlertDialog } from '../components/ui/alert-dialog'
import { toast } from '../components/ui/sonner'
import { useMediaQuery } from '../lib/useMediaQuery'
import { EditProgressModal } from '../features/level-page/EditProgressModal'
import { AddToCollectionDialog } from '../features/collections/AddToCollectionDialog'
import { Toolbar } from '../features/list/Toolbar'
import { ListTable, tableMinWidth } from '../features/list/ListTable'
import { MobilePager } from '../features/list/MobilePager'
import { FilterPanel } from '../features/list/FilterPanel'
import { ControlsSheet } from '../features/list/ControlsSheet'
import { PresetCreateDialog } from '../features/list/PresetCreateDialog'
import {
  applyFilters,
  countActiveFilters,
  difficultyRank,
  sortItems,
} from '../features/list/filtering'
import {
  COLUMNS,
  defaultColumnVisibility,
  defaultColumnOrder,
  getCategoryColumnDefs,
  type ColumnId,
  type ColumnDef,
  type ColumnVisibility,
} from '../features/list/columns'
import { defaultDir } from '../features/list/sortMeta'
import {
  ATTEMPTS_DOMAIN,
  DATE_MIN_MS,
  defaultFilterState,
  normalizeFilterState,
  type FilterState,
  type ListItem,
  type SortKey,
  type SortSpec,
} from '../features/list/types'
import {
  viewConfigsEqual,
  defaultViewConfig,
  DEFAULT_SORTS,
  cleanupPresetForCategories,
} from '../features/list/presets'
import type { PresetColorId } from '../features/list/presets'
import { getPresetCookie, setPresetCookie } from '../lib/presetCookie'

export function List() {
  const me = useMe()
  const progress = useMyProgress()
  const presetsQuery = useListPresets()
  const createPreset = useCreatePreset()
  const updatePreset = useUpdatePreset()
  const deletePreset = useDeletePreset()
  const deleteProgress = useDeleteProgress()
  const navigate = useNavigate()

  const [pendingDelete, setPendingDelete] = useState<ListItem | null>(null)
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null)
  const [addToCollectionItem, setAddToCollectionItem] =
    useState<ListItem | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState>(defaultFilterState)
  const [sorts, setSorts] = useState<SortSpec[]>(DEFAULT_SORTS)
  const [columns, setColumns] = useState<ColumnVisibility>(
    defaultColumnVisibility
  )
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(defaultColumnOrder)
  const [filterOpen, setFilterOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<ListPreset | null>(null)
  const [overwritingPresetId, setOverwritingPresetId] = useState<
    string | null
  >(null)

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

  useEffect(() => {
    if (editLevelQuery.isError) {
      toast.error('Failed to load level data')
      setEditingLevelId(null)
    }
  }, [editLevelQuery.isError])

  const items = useMemo(() => progress.data ?? [], [progress.data])
  const presets = useMemo(() => presetsQuery.data ?? [], [presetsQuery.data])

  // Category columns are only available in WEIGHTED mode.
  const activeCategories = useMemo(
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

  // The docked panel is 320px wide; the content column adds ~48px padding at md+.
  // Dock only if the table's min width still fits in what's left.
  const PANEL_WIDTH = 320
  const CONTENT_PADDING = 48
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

  const { earliestDate, maxAttempts } = useMemo(() => {
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
  }, [items])

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
  const currentConfig = useMemo(
    () => ({ sorts, filters, columns, columnOrder }),
    [sorts, filters, columns, columnOrder]
  )

  const isPresetModified = useMemo(() => {
    const activeIds = new Set(activeCategories.map((c) => c.id))
    // Normalize a config the same way applyPresetConfig does: add missing active
    // cat keys to columnOrder, and fill in any filter fields added after the
    // preset was saved.
    function normalize(config: {
      sorts: SortSpec[]
      filters: FilterState
      columns: ColumnVisibility
      columnOrder: ColumnId[]
    }) {
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

  if (me.isPending || !me.data || progress.isPending) {
    return <PageLoading />
  }

  const { ratingDisplayScale, dateFormatPreference } = me.data

  function applyPresetConfig(config: {
    sorts: SortSpec[]
    filters: FilterState
    columns: ColumnVisibility
    columnOrder: ColumnId[]
  }) {
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

  function handleSaveNewPreset() {
    setCreateDialogOpen(true)
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
    setOverwritingPresetId(id)
    updatePreset.mutate(
      { id, input: currentConfig },
      {
        onSuccess: () => toast.success(`Preset "${preset.name}" updated`),
        onError: () => toast.error('Failed to update preset'),
        onSettled: () => setOverwritingPresetId(null),
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

  function handleDiscardPresetChanges() {
    handleSelectPreset(selectedPresetId)
  }

  function handleEditPreset(preset: ListPreset) {
    setEditingPreset(preset)
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

  const deletingPresetId = deletePreset.isPending
    ? (deletePreset.variables ?? null)
    : null

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

  function handleEdit(item: ListItem) {
    setEditingLevelId(item.level.inGameId)
  }

  function handleNavigate(item: ListItem) {
    void navigate({
      to: '/list/$levelId',
      params: { levelId: item.level.inGameId },
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

  const canReset = search.trim() !== '' || activeFilterCount > 0

  const filterPanel = (
    <FilterPanel
      filters={filters}
      onChange={setFilters}
      matchCount={visible.length}
      totalCount={items.length}
      scale={ratingDisplayScale}
      dateFormatPreference={dateFormatPreference}
      availableLengths={availableLengths}
      availableGameVersions={availableGameVersions}
      availableDifficulties={availableDifficulties}
      earliestDate={earliestDate}
      maxAttempts={maxAttempts}
      onClose={() => setFilterOpen(false)}
      {...(activeCategories.length > 0 && {
        ratingCategories: activeCategories,
      })}
    />
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div ref={containerRef} className="flex">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:p-6 max-h-[calc(100dvh-64px)]">
          <Toolbar
            search={search}
            onSearch={setSearch}
            sorts={sorts}
            onSorts={setSorts}
            columns={columns}
            onColumns={setColumns}
            allColumnDefs={allColumnDefs}
            categorySortOptions={categorySortOptions}
            activeFilterCount={activeFilterCount}
            filterOpen={filterOpen}
            onToggleFilters={() => setFilterOpen((o) => !o)}
            onOpenControls={() => setControlsOpen(true)}
            onReset={resetAll}
            canReset={canReset}
            presets={presets}
            selectedPresetId={selectedPresetId}
            isPresetModified={isPresetModified}
            onSelectPreset={handleSelectPreset}
            onSaveNewPreset={handleSaveNewPreset}
            onOverwritePreset={handleOverwritePreset}
            onDeletePreset={handleDeletePreset}
            onEditPreset={handleEditPreset}
            onDiscardPreset={handleDiscardPresetChanges}
            deletingPresetId={deletingPresetId}
            overwritingPresetId={overwritingPresetId}
          />

          {items.length === 0 ? (
            <EmptyState />
          ) : visible.length === 0 ? (
            <NoMatches />
          ) : (
            <>
              <ListTable
                items={visible}
                columns={columns}
                columnOrder={columnOrder}
                allColumnDefs={allColumnDefs}
                onReorderColumns={setColumnOrder}
                sorts={sorts}
                onToggleSort={toggleSort}
                scale={ratingDisplayScale}
                datePref={dateFormatPreference}
                onEditItem={handleEdit}
                onDeleteItem={setPendingDelete}
                onNavigate={handleNavigate}
                onAddToCollectionItem={setAddToCollectionItem}
              />
              <MobilePager
                items={visible}
                columns={columns}
                scale={ratingDisplayScale}
                datePref={dateFormatPreference}
              />
            </>
          )}
        </div>

        {/* Docked filter panel — only when the table's min width still fits
            beside it; otherwise it falls through to the overlay sheet below.
            Width (not x) animates so the table's push happens in step with
            the panel appearing, rather than the layout jumping instantly. */}
        <AnimatePresence>
          {canDock && filterOpen && (
            <motion.aside
              initial={{ width: 0 }}
              animate={{ width: 320 }}
              exit={{ width: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="shrink-0 overflow-hidden border-l border-[var(--color-border-subtle)]"
            >
              <div className="sticky top-0 h-[calc(100dvh-64px)] w-[320px] overflow-hidden">
                {filterPanel}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Overlay sheet — mobile, and any width too narrow to dock the panel. */}
      {!canDock && (
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetContent side="right" className="p-0">
            <SheetTitle className="sr-only">Filters</SheetTitle>
            {filterPanel}
          </SheetContent>
        </Sheet>
      )}

      {/* Mobile controls — sort + columns. */}
      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent side="bottom" className="p-0">
          <SheetTitle className="sr-only">Sort and columns</SheetTitle>
          <ControlsSheet
            sorts={sorts}
            onSorts={setSorts}
            columns={columns}
            onColumns={setColumns}
            allColumnDefs={allColumnDefs}
            categorySortOptions={categorySortOptions}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete entry?"
        description={`This removes "${
          pendingDelete?.level.name ?? 'this level'
        }" and all its logged progress. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        isPending={deleteProgress.isPending}
        onConfirm={confirmDelete}
      />

      {editingLevelId && editLevelQuery.data && (
        <EditProgressModal
          open
          onClose={() => setEditingLevelId(null)}
          data={editLevelQuery.data}
          levelId={editingLevelId}
          scale={ratingDisplayScale}
          progressUpdateId={null}
        />
      )}

      {/* Fetching a level's edit data is a network round-trip — without this,
          clicking Edit does nothing visible until it resolves, which reads as
          a hang. Shown immediately on click; swaps for EditProgressModal once
          editLevelQuery.data lands. */}
      {editingLevelId && !editLevelQuery.data && !editLevelQuery.isError && (
        <Dialog.Root open onOpenChange={(o) => !o && setEditingLevelId(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
            <Dialog.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-50 w-[280px] -translate-x-1/2 -translate-y-1/2 focus:outline-none"
            >
              <Dialog.Title className="sr-only">Loading entry</Dialog.Title>
              <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-bg-surface p-8 shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
                <Loader2 size={20} className="animate-spin text-primary" />
                <p className="text-sm text-text-secondary">Loading entry…</p>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      <AddToCollectionDialog
        open={addToCollectionItem !== null}
        onClose={() => setAddToCollectionItem(null)}
        {...(addToCollectionItem && {
          preselectedLevel: addToCollectionItem.level,
        })}
      />

      <PresetCreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSave={handleCreatePreset}
        isSaving={createPreset.isPending}
        existingNames={presets.map((p) => p.name)}
      />

      <PresetCreateDialog
        open={editingPreset !== null}
        onClose={() => setEditingPreset(null)}
        onSave={handleUpdatePresetMeta}
        isSaving={updatePreset.isPending}
        title="Edit preset"
        submitLabel="Save changes"
        existingNames={presets.map((p) => p.name)}
        {...(editingPreset && {
          initialName: editingPreset.name,
          initialDescription: editingPreset.description ?? '',
          initialColor: editingPreset.color,
          excludeName: editingPreset.name,
        })}
      />
    </TooltipProvider>
  )
}

function EmptyState() {
  return (
    <div className="rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-10 text-center">
      <p className="text-text-primary">No levels logged yet.</p>
      <p className="mt-1 text-sm text-text-secondary">
        Log a completion or progress with the + button to start your list.
      </p>
    </div>
  )
}

function NoMatches() {
  return (
    <div className="rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-10 text-center text-text-secondary">
      No levels match your filters.
    </div>
  )
}
