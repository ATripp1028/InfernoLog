import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  getPresetColor,
  summarizeColumns,
  summarizeFilters,
  summarizeSorts,
} from './presets'
import type { ListPreset } from '@/lib/api/presets'
import { useMe, type RatingDisplayScale } from '@/lib/api/me'
import { getCategoryColumnDefs } from './columns'

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

function PresetHoverCard({
  preset,
}: {
  preset: ListPreset
}) {
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
  const colSummary = summarizeColumns(preset.columns, preset.columnOrder, allColumnDefs)

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
      <span className="w-12 shrink-0 text-right text-text-tertiary">{label}</span>
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
  onSelect,
  onSaveNew,
  onOverwrite,
  onDelete,
  onEdit,
  onDiscard,
}: PresetSelectorProps) {
  const [open, setOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Hover card state
  const [hoveredId, setHoveredId] = useState<string | 'default' | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Track when a deletion is in-flight so we can auto-close when it finishes.
  const pendingDeleteRef = useRef<string | null>(null)

  const scheduleHide = useCallback(() => {
    hideTimeout.current = setTimeout(() => {
      setHoveredId(null)
      setHoverRect(null)
    }, 120)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
  }, [])

  function handleOptionEnter(e: React.MouseEvent, id: string | 'default') {
    cancelHide()
    setHoveredId(id)
    setHoverRect((e.currentTarget as HTMLElement).getBoundingClientRect())
  }

  function handleOptionLeave() {
    scheduleHide()
  }

  // When deletingPresetId transitions from non-null → null, close the dropdown.
  useEffect(() => {
    if (!deletingPresetId && pendingDeleteRef.current) {
      pendingDeleteRef.current = null
      setPendingDeleteId(null)
      setOpen(false)
    }
  }, [deletingPresetId])

  // Clear hover on close.
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      cancelHide()
      setHoveredId(null)
      setHoverRect(null)
      if (!deletingPresetId) setPendingDeleteId(null)
    }
  }

  const selectedPreset = presets.find((p) => p.id === selectedPresetId)
  const triggerLabel = selectedPreset?.name ?? 'Default'
  const triggerColor = selectedPreset ? getPresetColor(selectedPreset.color) : null

  function handleSelect(id: string | null) {
    onSelect(id)
    setOpen(false)
    setPendingDeleteId(null)
  }

  function handleOverwrite() {
    if (selectedPresetId) {
      onOverwrite(selectedPresetId)
      setOpen(false)
    }
  }

  function handleDeleteClick(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setPendingDeleteId(id)
    setHoveredId(null)
  }

  function handleEditClick(preset: ListPreset, e: React.MouseEvent) {
    e.stopPropagation()
    setOpen(false)
    onEdit(preset)
  }

  function handleConfirmDelete(id: string) {
    pendingDeleteRef.current = id
    onDelete(id)
    // Dropdown stays open; useEffect closes it when deletion finishes.
  }

  const hoveredPreset =
    hoveredId && hoveredId !== 'default'
      ? presets.find((p) => p.id === hoveredId)
      : null

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
            <span className="max-w-[90px] truncate text-[12px] text-text-secondary">{triggerLabel}</span>
            {isModified && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
            )}
            <ChevronDown size={12} className="text-text-secondary" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-56 p-1">
          {/* Default option */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            onMouseEnter={(e) => handleOptionEnter(e, 'default')}
            onMouseLeave={handleOptionLeave}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer',
              'hover:bg-[var(--color-bg-subtle)]',
              selectedPresetId === null && 'font-medium'
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-border)]" />
            <span className="min-w-0 flex-1 truncate text-text-primary">Default</span>
            {selectedPresetId === null && (
              <Check size={12} className="shrink-0 text-[var(--color-primary)]" />
            )}
          </button>

          {/* User presets */}
          {presets.length > 0 && (
            <>
              <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
              {presets.map((preset) => {
                const color = getPresetColor(preset.color)
                const isSelected = preset.id === selectedPresetId
                const isPendingDelete = pendingDeleteId === preset.id
                const isDeleting = deletingPresetId === preset.id

                if (isPendingDelete) {
                  return (
                    <div
                      key={preset.id}
                      className="flex items-center gap-1 rounded-sm px-2 py-1.5"
                    >
                      <span className="flex-1 truncate text-xs text-text-secondary">
                        Delete "{preset.name}"?
                      </span>
                      {isDeleting ? (
                        <Loader2
                          size={13}
                          className="shrink-0 animate-spin text-text-tertiary"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            className="cursor-pointer rounded px-1 py-0.5 text-xs text-text-secondary hover:bg-[var(--color-bg-subtle)]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(preset.id)}
                            className="cursor-pointer rounded px-1 py-0.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )
                }

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelect(preset.id)}
                    onMouseEnter={(e) => handleOptionEnter(e, preset.id)}
                    onMouseLeave={handleOptionLeave}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer',
                      'hover:bg-[var(--color-bg-subtle)]',
                      isSelected && 'font-medium'
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: color.hex }}
                    />
                    <span className="min-w-0 flex-1 truncate text-text-primary">
                      {preset.name}
                    </span>
                    {isSelected && !isDeleting && (
                      <Check size={12} className="shrink-0 text-[var(--color-primary)]" />
                    )}
                    {/* Edit + delete icons — revealed on row hover */}
                    <span className="invisible flex shrink-0 items-center gap-0.5 group-hover:visible">
                      <span
                        role="button"
                        onClick={(e) => handleEditClick(preset, e)}
                        aria-label={`Edit ${preset.name}`}
                        className="cursor-pointer rounded p-0.5 text-text-tertiary hover:text-text-primary"
                      >
                        <Pencil size={11} />
                      </span>
                      <span
                        role="button"
                        onClick={(e) => handleDeleteClick(preset.id, e)}
                        aria-label={`Delete ${preset.name}`}
                        className="cursor-pointer rounded p-0.5 text-text-tertiary hover:text-red-500"
                      >
                        <Trash2 size={11} />
                      </span>
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {/* Actions */}
          <div className="my-1 h-px bg-[var(--color-border-subtle)]" />

          {isModified && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
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
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-secondary hover:bg-[var(--color-bg-subtle)]"
            >
              <RotateCcw size={12} />
              Overwrite "{selectedPreset?.name}"
            </button>
          )}

          {isModified && (
            <button
              type="button"
              onClick={() => { setOpen(false); onDiscard() }}
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
          title={`Overwrite "${selectedPreset?.name}" with current view`}
          className="flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
        >
          <RotateCcw size={12} />
          Overwrite
        </button>
      )}

      {/* Inline discard button that appears when the view has drifted from the preset */}
      {isModified && (
        <button
          type="button"
          onClick={onDiscard}
          title={selectedPresetId ? `Discard changes and return to "${selectedPreset?.name}"` : 'Discard changes and return to default'}
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
