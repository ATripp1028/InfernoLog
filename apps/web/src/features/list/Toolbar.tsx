import { ArrowUpDown, ChevronDown, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SortChips } from './SortChips'
import { ColumnsMenu } from './ColumnsMenu'
import { PresetSelector } from './PresetSelector'
import { FilterTab } from './FilterTab'
import { getPresetColor } from './presets'
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
  hideTime: boolean
  onHideTime: (next: boolean) => void
  allColumnDefs: ColumnDef[]
  categorySortOptions: { key: SortKey; label: string }[]
  activeFilterCount: number
  filterOpen: boolean
  onToggleFilters: () => void
  onOpenControls: () => void
  onOpenPresets: () => void
  onReset: () => void
  canReset: boolean
  // Presets
  presets: ListPreset[]
  selectedPresetId: string | null
  isPresetModified: boolean
  deletingPresetId: string | null
  overwritingPresetIds: string[]
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
  hideTime,
  onHideTime,
  allColumnDefs,
  categorySortOptions,
  activeFilterCount,
  filterOpen,
  onToggleFilters,
  onOpenControls,
  onOpenPresets,
  onReset,
  canReset,
  presets,
  selectedPresetId,
  isPresetModified,
  deletingPresetId,
  overwritingPresetIds,
  onSelectPreset,
  onSaveNewPreset,
  onOverwritePreset,
  onDeletePreset,
  onEditPreset,
  onDiscardPreset,
}: ToolbarProps) {
  const selectedPreset = presets.find((p) => p.id === selectedPresetId)
  const presetTriggerLabel = selectedPreset?.name ?? 'Default'
  const presetTriggerColor = selectedPreset
    ? getPresetColor(selectedPreset.color)
    : null

  return (
    <div className="flex flex-col gap-2">
      {/* Mobile: preset trigger (+ conditional save/reset) lives above the
          search bar; the desktop PresetSelector below stays hidden here and
          reappears inline. */}
      <div className="flex items-center gap-1.5 md:hidden">
        <button
          type="button"
          onClick={onOpenPresets}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-[13px]"
        >
          <span className="font-medium text-text-primary">Preset</span>
          <span className="text-[11px] text-text-tertiary">·</span>
          {presetTriggerColor ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: presetTriggerColor.hex }}
            />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--color-border)]" />
          )}
          <span className="min-w-0 flex-1 truncate text-left text-[12px] text-text-secondary">
            {presetTriggerLabel}
          </span>
          {isPresetModified && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
          )}
          <ChevronDown size={12} className="shrink-0 text-text-secondary" />
        </button>

        {isPresetModified && (
          <>
            <button
              type="button"
              onClick={onSaveNewPreset}
              className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-[13px] font-medium text-text-primary"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onDiscardPreset}
              className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-[13px] font-medium text-text-secondary"
            >
              Reset
            </button>
          </>
        )}
      </div>

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
            overwritingPresetIds={overwritingPresetIds}
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
          {/* Mobile: sort + columns live in a bottom sheet; presets get
              their own trigger above the search bar. */}
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
              hideTime={hideTime}
              onHideTime={onHideTime}
              allColumnDefs={allColumnDefs}
            />
          </div>

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

          {/* Last child on purpose — its negative right margin cancels the
              page's own padding, so it pokes out to the true edge. */}
          <FilterTab
            open={filterOpen}
            onToggle={onToggleFilters}
            activeCount={activeFilterCount}
          />
        </div>
      </div>
    </div>
  )
}
