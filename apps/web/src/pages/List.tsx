import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
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
import { Toolbar } from '../features/list/Toolbar'
import { ListTable } from '../features/list/ListTable'
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
  defaultColumnVisibility,
  defaultColumnOrder,
  type ColumnId,
  type ColumnVisibility,
} from '../features/list/columns'
import { defaultDir } from '../features/list/sortMeta'
import {
  defaultFilterState,
  type FilterState,
  type ListItem,
  type SortKey,
  type SortSpec,
} from '../features/list/types'
import {
  viewConfigsEqual,
  defaultViewConfig,
  DEFAULT_SORTS,
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

    setSelectedPresetId(preset.id)
    setSorts(preset.sorts)
    setFilters(preset.filters)
    setColumns(preset.columns)
    setColumnOrder(preset.columnOrder)
  }, [me.data?.id, presetsQuery.data])

  // md+ docks the filter panel inline (live table updates); mobile uses a sheet.
  const isWide = useMediaQuery('(min-width: 768px)')

  // Fetch full level-page data when the user triggers edit from the list.
  const userId = me.data?.id ?? ''
  const editLevelQuery = useLevelPage(userId, editingLevelId ?? '')

  useEffect(() => {
    if (editLevelQuery.isError) {
      toast.error('Failed to load level data')
      setEditingLevelId(null)
    }
  }, [editLevelQuery.isError])

  // Push the global FAB left of the docked filter panel while it's open.
  const dockedOpen = isWide && filterOpen
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--fab-shift', dockedOpen ? '320px' : '0px')
    return () => root.style.setProperty('--fab-shift', '0px')
  }, [dockedOpen])

  const items = useMemo(() => progress.data ?? [], [progress.data])
  const presets = useMemo(() => presetsQuery.data ?? [], [presetsQuery.data])

  const visible = useMemo(
    () => sortItems(applyFilters(items, filters, search), sorts),
    [items, filters, search, sorts]
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
    if (selectedPresetId === null) {
      return !viewConfigsEqual(currentConfig, defaultViewConfig())
    }
    const preset = presets.find((p) => p.id === selectedPresetId)
    if (!preset) return false
    return !viewConfigsEqual(currentConfig, {
      sorts: preset.sorts,
      filters: preset.filters,
      columns: preset.columns,
      columnOrder: preset.columnOrder,
    })
  }, [selectedPresetId, currentConfig, presets])

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
    setSorts(config.sorts)
    setFilters(config.filters)
    setColumns(config.columns)
    setColumnOrder(config.columnOrder)
  }

  function handleSelectPreset(id: string | null) {
    setSelectedPresetId(id)
    if (me.data?.id) setPresetCookie(me.data.id, id)
    if (id === null) {
      applyPresetConfig(defaultViewConfig())
    } else {
      const preset = presets.find((p) => p.id === id)
      if (preset) applyPresetConfig(preset)
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
      { id: editingPreset.id, input: { name, description: description || null, color } },
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
      onSuccess: () => toast.success(`Deleted ${name}`),
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
      availableLengths={availableLengths}
      availableGameVersions={availableGameVersions}
      availableDifficulties={availableDifficulties}
      onClose={() => setFilterOpen(false)}
    />
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:p-6">
          <Toolbar
            search={search}
            onSearch={setSearch}
            sorts={sorts}
            onSorts={setSorts}
            columns={columns}
            onColumns={setColumns}
            activeFilterCount={activeFilterCount}
            onOpenFilters={() => setFilterOpen((o) => !o)}
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
                onReorderColumns={setColumnOrder}
                sorts={sorts}
                onToggleSort={toggleSort}
                scale={ratingDisplayScale}
                datePref={dateFormatPreference}
                onEditItem={handleEdit}
                onDeleteItem={setPendingDelete}
                onNavigate={handleNavigate}
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

        {/* Docked filter panel (md+) — table updates live as filters change. */}
        {isWide && filterOpen && (
          <aside className="w-[320px] shrink-0 border-l border-[var(--color-border-subtle)]">
            <div className="sticky top-0 h-[calc(100dvh-64px)] overflow-hidden">
              {filterPanel}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile: filter panel as an overlay sheet. */}
      {!isWide && (
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
        onConfirm={confirmDelete}
      />

      {editingLevelId && editLevelQuery.data && (
        <EditProgressModal
          open
          onClose={() => setEditingLevelId(null)}
          data={editLevelQuery.data}
          userId={userId}
          levelId={editingLevelId}
          scale={ratingDisplayScale}
        />
      )}

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
