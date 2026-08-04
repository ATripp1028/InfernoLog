import { useEffect, useState } from 'react'
import { Check, Loader2, Pencil, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPresetColor } from './presets'
import type { ListPreset } from '@/lib/api/presets'

interface PresetSheetProps {
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
  onClose: () => void
}

// Content for the mobile "Presets" bottom sheet — the same preset list and
// actions PresetSelector renders in its popover on desktop, laid out for touch.
export function PresetSheet({
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
  onClose,
}: PresetSheetProps) {
  const isOverwriting =
    selectedPresetId != null && overwritingPresetIds.includes(selectedPresetId)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const selectedPreset = presets.find((p) => p.id === selectedPresetId)

  // Clear the pending-delete confirm once the deletion finishes.
  useEffect(() => {
    if (!deletingPresetId) setPendingDeleteId(null)
  }, [deletingPresetId])

  function handleSelect(id: string | null) {
    onSelect(id)
    onClose()
  }

  function handleDeleteClick(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setPendingDeleteId(id)
  }

  function handleEditClick(preset: ListPreset, e: React.MouseEvent) {
    e.stopPropagation()
    onClose()
    onEdit(preset)
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto p-4">
      <h3 className="px-1 pb-1 text-xs font-semibold text-text-secondary">
        Presets
      </h3>

      {/* Default option */}
      <button
        type="button"
        onClick={() => handleSelect(null)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-sm cursor-pointer',
          'hover:bg-[var(--color-bg-subtle)]',
          selectedPresetId === null && 'font-medium'
        )}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-border)]" />
        <span className="min-w-0 flex-1 truncate text-left text-text-primary">
          Default
        </span>
        {selectedPresetId === null && (
          <Check size={14} className="shrink-0 text-[var(--color-primary)]" />
        )}
      </button>

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
                  className="flex items-center gap-2 rounded-md px-2 py-2.5"
                >
                  <span className="flex-1 truncate text-sm text-text-secondary">
                    Delete "{preset.name}"?
                  </span>
                  {isDeleting ? (
                    <Loader2
                      size={14}
                      className="shrink-0 animate-spin text-text-tertiary"
                    />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="cursor-pointer rounded px-2 py-1 text-xs text-text-secondary hover:bg-[var(--color-bg-subtle)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(preset.id)}
                        className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
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
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-sm cursor-pointer',
                  'hover:bg-[var(--color-bg-subtle)]',
                  isSelected && 'font-medium'
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: color.hex }}
                />
                <span className="min-w-0 flex-1 truncate text-left text-text-primary">
                  {preset.name}
                </span>
                {isSelected && !isDeleting && (
                  <Check
                    size={14}
                    className="shrink-0 text-[var(--color-primary)]"
                  />
                )}
                <span className="flex shrink-0 items-center gap-1">
                  <span
                    role="button"
                    onClick={(e) => handleEditClick(preset, e)}
                    aria-label={`Edit ${preset.name}`}
                    className="cursor-pointer rounded p-1 text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={13} />
                  </span>
                  <span
                    role="button"
                    onClick={(e) => handleDeleteClick(preset.id, e)}
                    aria-label={`Delete ${preset.name}`}
                    className="cursor-pointer rounded p-1 text-text-tertiary hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </span>
                </span>
              </button>
            )
          })}
        </>
      )}

      {/* Actions */}
      {isModified && (
        <>
          <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
          <button
            type="button"
            onClick={() => {
              onClose()
              onSaveNew()
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm text-text-primary hover:bg-[var(--color-bg-subtle)]"
          >
            <Plus size={14} className="text-[var(--color-primary)]" />
            Save as new preset
          </button>

          {selectedPresetId !== null && (
            <button
              type="button"
              onClick={() => {
                onOverwrite(selectedPresetId)
                onClose()
              }}
              disabled={isOverwriting}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm text-text-secondary hover:bg-[var(--color-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isOverwriting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              {isOverwriting
                ? `Overwriting "${selectedPreset?.name}"…`
                : `Overwrite "${selectedPreset?.name}"`}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onDiscard()
              onClose()
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm text-text-secondary hover:bg-[var(--color-bg-subtle)]"
          >
            <Undo2 size={14} />
            {selectedPresetId ? 'Discard changes' : 'Reset to default'}
          </button>
        </>
      )}
    </div>
  )
}
