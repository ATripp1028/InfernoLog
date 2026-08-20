import { AnimatePresence, motion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import { PageLoading } from '@/components/shell/PageLoading'
import { TooltipProvider } from '@/components/generic/tooltip'
import { Sheet, SheetContent, SheetTitle } from '@/components/generic/sheet'
import { MobileActionSheet } from '@/components/shell/MobileActionSheet'
import { AlertDialog } from '@/components/generic/alert-dialog'
import { EditEntryModal } from '@/features/level-page/EditEntryModal'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'
import { Toolbar } from '@/features/list/Toolbar'
import { ListTable } from '@/features/list/ListTable'
import { MobilePager } from '@/features/list/MobilePager'
import { FilterPanel } from '@/features/list/FilterPanel'
import { ControlsSheet } from '@/features/list/ControlsSheet'
import { PresetSheet } from '@/features/list/PresetSheet'
import { PresetCreateDialog } from '@/features/list/PresetCreateDialog'
import { useListPage } from '@/features/list/useListPage'
import { EmptyState } from '@/components/data/EmptyState'

/**
 * The List — every level the user has logged, with saved views, filters, and sorts.
 */
export function List() {
  const {
    isLoading,
    user,
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
    canReset,
    resetAll,
    containerRef,
    canDock,
    filterOpen,
    setFilterOpen,
    controlsOpen,
    setControlsOpen,
    selectedPresetId,
    isPresetModified,
    presetSheetOpen,
    setPresetSheetOpen,
    createDialogOpen,
    setCreateDialogOpen,
    editingPreset,
    setEditingPreset,
    deletingPresetId,
    overwritingPresetIds,
    isCreatingPreset,
    isUpdatingPreset,
    handleSelectPreset,
    handleSaveNewPreset,
    handleCreatePreset,
    handleOverwritePreset,
    handleDeletePreset,
    handleEditPreset,
    handleUpdatePresetMeta,
    handleDiscardPresetChanges,
    handleEdit,
    handleLog,
    handleNavigate,
    addToCollectionItem,
    setAddToCollectionItem,
    editingLevelId,
    editLevelData,
    editLevelFailed,
    closeEditModal,
    pendingDelete,
    setPendingDelete,
    confirmDelete,
    isDeleting,
  } = useListPage()

  if (isLoading || !user) {
    return <PageLoading />
  }

  const { ratingDisplayScale, dateFormatPreference } = user

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
            hideTime={hideTime}
            onHideTime={setHideTime}
            allColumnDefs={allColumnDefs}
            categorySortOptions={categorySortOptions}
            activeFilterCount={activeFilterCount}
            filterOpen={filterOpen}
            onToggleFilters={() => setFilterOpen((o) => !o)}
            onOpenControls={() => setControlsOpen(true)}
            onOpenPresets={() => setPresetSheetOpen(true)}
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
            overwritingPresetIds={overwritingPresetIds}
          />

          {items.length === 0 ? (
            <EmptyState
              title="No levels logged yet."
              description="Log a completion or progress with the + button to start your list."
            />
          ) : visible.length === 0 ? (
            <EmptyState title="No levels match your filters." />
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
                hideTime={hideTime}
                onEditItem={handleEdit}
                onDeleteItem={setPendingDelete}
                onNavigate={handleNavigate}
                onAddToCollectionItem={setAddToCollectionItem}
                onLogItem={handleLog}
              />
              <MobilePager
                items={visible}
                columns={columns}
                scale={ratingDisplayScale}
                datePref={dateFormatPreference}
                hideTime={hideTime}
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
              className="shrink-0 overflow-hidden border-l border-border-subtle"
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

      {/* Mobile controls — sort + columns. MobileActionSheet (not the Radix
          Sheet primitive above) to match the spring-based slide the rest of
          the app's mobile menus use (MobileNav, SearchPageBar) — the Radix
          Sheet's CSS keyframe transition reads noticeably less smooth. */}
      <MobileActionSheet
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        ariaLabel="Sort and columns"
      >
        <div className="max-h-[75vh] overflow-y-auto">
          <ControlsSheet
            sorts={sorts}
            onSorts={setSorts}
            columns={columns}
            onColumns={setColumns}
            hideTime={hideTime}
            onHideTime={setHideTime}
            allColumnDefs={allColumnDefs}
            categorySortOptions={categorySortOptions}
          />
        </div>
      </MobileActionSheet>

      {/* Mobile presets — trigger lives above the search bar in Toolbar. */}
      <MobileActionSheet
        open={presetSheetOpen}
        onClose={() => setPresetSheetOpen(false)}
        ariaLabel="Presets"
      >
        <div className="max-h-[75vh] overflow-y-auto">
          <PresetSheet
            presets={presets}
            selectedPresetId={selectedPresetId}
            isModified={isPresetModified}
            deletingPresetId={deletingPresetId}
            overwritingPresetIds={overwritingPresetIds}
            onSelect={handleSelectPreset}
            onOverwrite={handleOverwritePreset}
            onDelete={handleDeletePreset}
            onEdit={handleEditPreset}
            onClose={() => setPresetSheetOpen(false)}
          />
        </div>
      </MobileActionSheet>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete entry?"
        description={`This removes "${
          pendingDelete?.level.name ?? 'this level'
        }" and all its logged progress. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        isPending={isDeleting}
        onConfirm={confirmDelete}
      />

      {editingLevelId && editLevelData && (
        <EditEntryModal
          open
          onClose={closeEditModal}
          data={editLevelData}
          levelId={editingLevelId}
          scale={ratingDisplayScale}
          datePref={dateFormatPreference}
        />
      )}

      {/* Fetching a level's edit data is a network round-trip — without this,
          clicking Edit does nothing visible until it resolves, which reads as
          a hang. Shown immediately on click; swaps for EditEntryModal once the
          query lands. */}
      {editingLevelId && !editLevelData && !editLevelFailed && (
        <Dialog.Root open onOpenChange={(o) => !o && closeEditModal()}>
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
        isSaving={isCreatingPreset}
        existingNames={presets.map((p) => p.name)}
      />

      <PresetCreateDialog
        open={editingPreset !== null}
        onClose={() => setEditingPreset(null)}
        onSave={handleUpdatePresetMeta}
        isSaving={isUpdatingPreset}
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
