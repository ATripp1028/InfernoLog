import { useRef, useState } from 'react'
import { Check, ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  getContrastColor,
  getPresetColor,
  summarizeColumns,
  summarizeFilters,
  summarizeSorts,
} from './presets'
import type { ListPreset } from '@/lib/api/presets'

interface PresetSelectorProps {
  presets: ListPreset[]
  selectedPresetId: string | null
  isModified: boolean
  onSelect: (id: string | null) => void
  onSaveNew: () => void
  onOverwrite: (id: string) => void
  onDelete: (id: string) => void
}

function PresetHoverCard({ preset }: { preset: ListPreset }) {
  const color = getPresetColor(preset.color)
  const sortSummary = summarizeSorts(preset.sorts)
  const filterLines = summarizeFilters(preset.filters)
  const colSummary = summarizeColumns(preset.columns, preset.columnOrder)

  return (
    <div className="w-64 space-y-2.5 p-3">
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
            <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
              {preset.description}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-[var(--color-border-subtle)] pt-2">
        <Row label="Sort" value={sortSummary} />
        <Row label="Cols" value={colSummary} />
        {filterLines.length === 0 ? (
          <Row label="Filters" value="None" />
        ) : (
          filterLines.map((line, i) => (
            <Row key={i} label={i === 0 ? 'Filters' : ''} value={line} />
          ))
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-12 shrink-0 text-right text-text-tertiary">{label}</span>
      <span className="min-w-0 truncate text-text-secondary">{value}</span>
    </div>
  )
}

function DefaultHoverCard() {
  return (
    <div className="w-56 p-3">
      <p className="text-sm font-semibold text-text-primary">Default</p>
      <p className="mt-1 text-xs text-text-secondary">
        The built-in view — sorted by date, all columns and filters at their
        defaults. Cannot be overwritten.
      </p>
    </div>
  )
}

interface OptionRowProps {
  label: string
  colorHex?: string
  isSelected: boolean
  children?: React.ReactNode
  onClick: () => void
  hoverCard: React.ReactNode
}

function OptionRow({
  label,
  colorHex,
  isSelected,
  children,
  onClick,
  hoverCard,
}: OptionRowProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left',
            'hover:bg-[var(--color-bg-subtle)]',
            isSelected && 'font-medium'
          )}
        >
          {colorHex ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: colorHex }}
            />
          ) : (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-border)]" />
          )}
          <span className="min-w-0 flex-1 truncate text-text-primary">
            {label}
          </span>
          {isSelected && (
            <Check size={12} className="shrink-0 text-[var(--color-primary)]" />
          )}
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={12}
        className="p-0 min-w-0 w-auto"
      >
        {hoverCard}
      </TooltipContent>
    </Tooltip>
  )
}

export function PresetSelector({
  presets,
  selectedPresetId,
  isModified,
  onSelect,
  onSaveNew,
  onOverwrite,
  onDelete,
}: PresetSelectorProps) {
  const [open, setOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteRef = useRef<HTMLDivElement>(null)

  const selectedPreset = presets.find((p) => p.id === selectedPresetId)
  const triggerLabel = selectedPreset?.name ?? 'Default'
  const triggerColor = selectedPreset
    ? getPresetColor(selectedPreset.color)
    : null

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
  }

  function handleConfirmDelete(id: string) {
    onDelete(id)
    setPendingDeleteId(null)
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <TooltipProvider delayDuration={150} disableHoverableContent={false}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1.5 pl-2.5 pr-2 text-[13px] font-medium text-text-primary"
            >
              {triggerColor ? (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: triggerColor.hex }}
                />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--color-border)]" />
              )}
              <span className="max-w-[120px] truncate">{triggerLabel}</span>
              {isModified && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
              )}
              <ChevronDown size={12} className="text-text-secondary" />
            </button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-56 p-1">
            {/* Default option */}
            <OptionRow
              label="Default"
              isSelected={selectedPresetId === null}
              onClick={() => handleSelect(null)}
              hoverCard={<DefaultHoverCard />}
            />

            {/* User presets */}
            {presets.length > 0 && (
              <>
                <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
                {presets.map((preset) => {
                  const color = getPresetColor(preset.color)
                  const isSelected = preset.id === selectedPresetId
                  const isPendingDelete = pendingDeleteId === preset.id

                  if (isPendingDelete) {
                    return (
                      <div
                        key={preset.id}
                        ref={deleteRef}
                        className="flex items-center gap-1 rounded-sm px-2 py-1.5"
                      >
                        <span className="flex-1 truncate text-xs text-text-secondary">
                          Delete "{preset.name}"?
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="rounded px-1 py-0.5 text-xs text-text-secondary hover:bg-[var(--color-bg-subtle)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(preset.id)}
                          className="rounded px-1 py-0.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    )
                  }

                  return (
                    <OptionRow
                      key={preset.id}
                      label={preset.name}
                      colorHex={color.hex}
                      isSelected={isSelected}
                      onClick={() => handleSelect(preset.id)}
                      hoverCard={<PresetHoverCard preset={preset} />}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(preset.id, e)}
                        aria-label={`Delete ${preset.name}`}
                        className="invisible shrink-0 rounded p-0.5 text-text-tertiary hover:text-red-500 group-hover:visible"
                      >
                        <Trash2 size={11} />
                      </button>
                    </OptionRow>
                  )
                })}
              </>
            )}

            {/* Actions */}
            <div className="my-1 h-px bg-[var(--color-border-subtle)]" />

            {/* Save as new — only when modified */}
            {isModified && (
              <button
                type="button"
                onClick={() => { setOpen(false); onSaveNew() }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-[var(--color-bg-subtle)]"
              >
                <Plus size={13} className="text-[var(--color-primary)]" />
                Save as new preset
              </button>
            )}

            {/* Overwrite — only for a selected user preset when modified */}
            {selectedPresetId !== null && isModified && (
              <button
                type="button"
                onClick={handleOverwrite}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-secondary hover:bg-[var(--color-bg-subtle)]"
              >
                <RotateCcw size={12} />
                Overwrite "{selectedPreset?.name}"
              </button>
            )}
          </PopoverContent>
        </Popover>
      </TooltipProvider>

      {/* Inline save-as-new button that appears when the user has drifted */}
      {isModified && (
        <button
          type="button"
          onClick={onSaveNew}
          title="Save current view as a new preset"
          className="flex h-8 items-center gap-1 rounded-md border border-dashed border-[var(--color-primary)] px-2 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
        >
          <Plus size={12} />
          Save
        </button>
      )}
    </div>
  )
}
