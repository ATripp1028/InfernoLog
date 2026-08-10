import { createPortal } from 'react-dom'
import { ChevronDown, Loader2, Plus, RotateCcw, Undo2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  getPresetColor,
  summarizeColumns,
  summarizeFilters,
  summarizeSorts,
} from './presets'
import { PresetRow } from './PresetRow'
import type { ListPreset } from '@/lib/api/presets'
import { useMe, type RatingDisplayScale } from '@/lib/api/me'
import { getCategoryColumnDefs } from './columns'
import { usePresetSelector } from './usePresetSelector'

// ─────────────────────────────────────────────
// Hover card (portal-rendered, so it can overflow the Popover boundary)
// ─────────────────────────────────────────────

const CARD_WIDTH = 272

function computeCardStyle(rect: DOMRect): React.CSSProperties {
  const spaceRight = window.innerWidth - rect.right
  const left =
    spaceRight > CARD_WIDTH + 16 ? rect.right + 8 : rect.left - CARD_WIDTH - 8
  const top = Math.min(rect.top, window.innerHeight - 240)
  return { position: 'fixed', top, left, width: CARD_WIDTH, zIndex: 9999 }
}

function PresetHoverCard({ preset }: { preset: ListPreset }) {
  const me = useMe()
  const scale: RatingDisplayScale = me.data?.ratingDisplayScale ?? 'ZERO_TO_TEN'
  const categories =
    me.data?.ratingMode === 'WEIGHTED' ? (me.data.ratingCategories ?? []) : []
  const catSortOptions = categories.map((cat) => ({
    key: `cat:${cat.id}` as `cat:${string}`,
    label: cat.name,
  }))
  const allColumnDefs = getCategoryColumnDefs(categories)
  const color = getPresetColor(preset.color)
  const sortSummary = summarizeSorts(preset.sorts, catSortOptions)
  const filterLines = summarizeFilters(preset.filters, scale, categories)
  const colSummary = summarizeColumns(
    preset.columns,
    preset.columnOrder,
    allColumnDefs
  )

  return (
    <div className="space-y-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-md">
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ background: color.hex }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {preset.name}
          </p>
          {preset.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
              {preset.description}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-[var(--color-border-subtle)] pt-2">
        <HoverRow label="Sort" value={sortSummary} />
        <HoverRow label="Cols" value={colSummary} />
        {preset.hideTime && <HoverRow label="Time" value="Hidden" />}
        {filterLines.length === 0 ? (
          <HoverRow label="Filters" value="None" />
        ) : (
          filterLines.map((line, i) => (
            <HoverRow key={i} label={i === 0 ? 'Filters' : ''} value={line} />
          ))
        )}
      </div>
    </div>
  )
}

function DefaultHoverCard() {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-md">
      <p className="text-sm font-semibold text-text-primary">Default</p>
      <p className="mt-1 text-xs text-text-secondary">
        The built-in view — sorted by date, all columns and filters at their
        defaults. Cannot be overwritten.
      </p>
    </div>
  )
}

function HoverRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-12 shrink-0 text-right text-text-tertiary">
        {label}
      </span>
      <span className="min-w-0 truncate text-text-secondary">{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface PresetSelectorProps {
  presets: ListPreset[]
  selectedPresetId: string | null
  isModified: boolean
  deletingPresetId: string | null
  overwritingPresetIds: string[]
  onSelect: (id: string | null) => void
  onSaveNew: () => void
  onOverwrite: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (preset: ListPreset) => void
  onDiscard: () => void
}

export function PresetSelector({
  presets,
  selectedPresetId,
  isModified,
  deletingPresetId,
  overwritingPresetIds,
  onSelect,
  onSaveNew,
  onOverwrite,
  onDelete,
  onEdit,
  onDiscard,
}: PresetSelectorProps) {
  const {
    open,
    handleOpenChange,
    isOverwriting,
    selectedPreset,
    triggerLabel,
    triggerColor,
    handleSelect,
    handleOverwrite,
    handleEditClick,
    pendingDeleteId,
    handleDeleteClick,
    handleConfirmDelete,
    cancelDelete,
    close,
    hoveredId,
    hoveredPreset,
    hoverRect,
    handleOptionEnter,
    handleOptionLeave,
    cancelHide,
    scheduleHide,
  } = usePresetSelector({
    presets,
    selectedPresetId,
    deletingPresetId,
    overwritingPresetIds,
    onSelect,
    onOverwrite,
    onDelete,
    onEdit,
  })

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 pl-2.5 pr-2 text-[13px] cursor-pointer"
          >
            <span className="font-medium text-text-primary">Preset</span>
            <span className="text-[11px] text-text-tertiary">·</span>
            {triggerColor ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: triggerColor.hex }}
              />
            ) : (
              <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--color-border)]" />
            )}
            <span className="max-w-[90px] truncate text-[12px] text-text-secondary">
              {triggerLabel}
            </span>
            {isModified && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
            )}
            <ChevronDown size={12} className="text-text-secondary" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-56 p-1">
          {/* Default option */}
          <PresetRow
            density="compact"
            preset={null}
            isSelected={selectedPresetId === null}
            isPendingDelete={false}
            isDeleting={false}
            onSelect={() => handleSelect(null)}
            onCancelDelete={() => {}}
            onConfirmDelete={() => {}}
            onDeleteClick={() => {}}
            onEditClick={() => {}}
            onMouseEnter={(e) => handleOptionEnter(e, 'default')}
            onMouseLeave={handleOptionLeave}
          />

          {/* User presets */}
          {presets.length > 0 && (
            <>
              <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
              {presets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  density="compact"
                  preset={preset}
                  isSelected={preset.id === selectedPresetId}
                  isPendingDelete={pendingDeleteId === preset.id}
                  isDeleting={deletingPresetId === preset.id}
                  onSelect={() => handleSelect(preset.id)}
                  onCancelDelete={cancelDelete}
                  onConfirmDelete={() => handleConfirmDelete(preset.id)}
                  onDeleteClick={(e) => handleDeleteClick(preset.id, e)}
                  onEditClick={(e) => handleEditClick(preset, e)}
                  onMouseEnter={(e) => handleOptionEnter(e, preset.id)}
                  onMouseLeave={handleOptionLeave}
                />
              ))}
            </>
          )}

          {/* Actions */}
          <div className="my-1 h-px bg-[var(--color-border-subtle)]" />

          {isModified && (
            <button
              type="button"
              onClick={() => {
                close()
                onSaveNew()
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-[var(--color-bg-subtle)]"
            >
              <Plus size={13} className="text-[var(--color-primary)]" />
              Save as new preset
            </button>
          )}

          {selectedPresetId !== null && isModified && (
            <button
              type="button"
              onClick={handleOverwrite}
              disabled={isOverwriting}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-secondary hover:bg-[var(--color-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOverwriting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RotateCcw size={12} />
              )}
              {isOverwriting
                ? `Overwriting "${selectedPreset?.name}"…`
                : `Overwrite "${selectedPreset?.name}"`}
            </button>
          )}

          {isModified && (
            <button
              type="button"
              onClick={() => {
                close()
                onDiscard()
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-secondary hover:bg-[var(--color-bg-subtle)]"
            >
              <Undo2 size={12} />
              {selectedPresetId ? `Discard changes` : 'Reset to default'}
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* Inline save button that appears when the view has drifted from the preset */}
      {isModified && (
        <button
          type="button"
          onClick={onSaveNew}
          title="Save current view as a new preset"
          className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-dashed border-[var(--color-primary)] px-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
        >
          <Plus size={12} />
          Save
        </button>
      )}

      {/* Inline overwrite button — only when a named preset is active */}
      {isModified && selectedPresetId !== null && (
        <button
          type="button"
          onClick={() => onOverwrite(selectedPresetId)}
          disabled={isOverwriting}
          title={`Overwrite "${selectedPreset?.name}" with current view`}
          className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isOverwriting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RotateCcw size={12} />
          )}
          {isOverwriting ? 'Overwriting…' : 'Overwrite'}
        </button>
      )}

      {/* Inline discard button that appears when the view has drifted from the preset */}
      {isModified && (
        <button
          type="button"
          onClick={onDiscard}
          title={
            selectedPresetId
              ? `Discard changes and return to "${selectedPreset?.name}"`
              : 'Discard changes and return to default'
          }
          className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs font-medium text-text-secondary hover:bg-[var(--color-bg-subtle)]"
        >
          <Undo2 size={12} />
          Discard
        </button>
      )}

      {/* Hover card rendered into a portal so it can overflow the Popover boundary */}
      {open &&
        hoveredId &&
        hoverRect &&
        createPortal(
          <div
            style={computeCardStyle(hoverRect)}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            {hoveredId === 'default' ? (
              <DefaultHoverCard />
            ) : hoveredPreset ? (
              <PresetHoverCard preset={hoveredPreset} />
            ) : null}
          </div>,
          document.body
        )}
    </div>
  )
}
