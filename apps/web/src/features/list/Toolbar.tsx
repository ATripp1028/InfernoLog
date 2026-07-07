import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SortChips } from './SortChips'
import { ColumnsMenu } from './ColumnsMenu'
import { PresetSelector } from './PresetSelector'
import type { ColumnDef, ColumnVisibility } from './columns'
import type { SortKey, SortSpec } from './types'
import type { ListPreset } from '@/lib/api/presets'

interface ToolbarProps {
  search: string
  onSearch: (v: string) => void
  sorts: SortSpec[]
  onSorts: (s: SortSpec[]) => void
  columns: ColumnVisibility
  onColumns: (c: ColumnVisibility) => void
  allColumnDefs: ColumnDef[]
  categorySortOptions: { key: SortKey; label: string }[]
  activeFilterCount: number
  onOpenFilters: () => void
  onOpenControls: () => void
  onReset: () => void
  canReset: boolean
  // Presets
  presets: ListPreset[]
  selectedPresetId: string | null
  isPresetModified: boolean
  deletingPresetId: string | null
  onSelectPreset: (id: string | null) => void
  onSaveNewPreset: () => void
  onOverwritePreset: (id: string) => void
  onDeletePreset: (id: string) => void
  onEditPreset: (preset: ListPreset) => void
  onDiscardPreset: () => void
}

export function Toolbar({
  search,
  onSearch,
  sorts,
  onSorts,
  columns,
  onColumns,
  allColumnDefs,
  categorySortOptions,
  activeFilterCount,
  onOpenFilters,
  onOpenControls,
  onReset,
  canReset,
  presets,
  selectedPresetId,
  isPresetModified,
  deletingPresetId,
  onSelectPreset,
  onSaveNewPreset,
  onOverwritePreset,
  onDeletePreset,
  onEditPreset,
  onDiscardPreset,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:w-[260px] sm:flex-none">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search your levels…"
          className="h-9 pl-9"
        />
      </div>

      <div className="hidden md:block">
        <PresetSelector
          presets={presets}
          selectedPresetId={selectedPresetId}
          isModified={isPresetModified}
          deletingPresetId={deletingPresetId}
          onSelect={onSelectPreset}
          onSaveNew={onSaveNewPreset}
          onOverwrite={onOverwritePreset}
          onDelete={onDeletePreset}
          onEdit={onEditPreset}
          onDiscard={onDiscardPreset}
        />
      </div>

      <div className="hidden md:block">
        <SortChips
          sorts={sorts}
          onChange={onSorts}
          extraSortOptions={categorySortOptions}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Mobile: sort + columns + preset live in a bottom sheet. */}
        <button
          type="button"
          onClick={onOpenControls}
          aria-label="Sort and columns"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-text-secondary md:hidden"
        >
          <ArrowUpDown size={14} />
        </button>

        <div className="hidden md:block">
          <ColumnsMenu
            columns={columns}
            onChange={onColumns}
            allColumnDefs={allColumnDefs}
          />
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 pl-3 pr-2.5 text-[13px] font-medium text-text-primary cursor-pointer"
        >
          <SlidersHorizontal size={13} className="text-text-secondary" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-[var(--color-primary)] px-1.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {canReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset filters and sort"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-primary"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
