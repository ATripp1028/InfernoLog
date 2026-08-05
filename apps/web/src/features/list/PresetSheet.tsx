import { useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { PresetRow } from './PresetRow'
import type { ListPreset } from '@/lib/api/presets'

interface PresetSheetProps {
  presets: ListPreset[]
  selectedPresetId: string | null
  isModified: boolean
  deletingPresetId: string | null
  overwritingPresetIds: string[]
  onSelect: (id: string | null) => void
  onOverwrite: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (preset: ListPreset) => void
  onClose: () => void
}

// Content for the mobile "Presets" bottom sheet — the same preset list and
// actions PresetSelector renders in its popover on desktop, laid out for touch.
// "Save as new preset" and "Reset"/"Discard changes" live in the Toolbar row
// next to the preset trigger instead — see Toolbar.tsx.
export function PresetSheet({
  presets,
  selectedPresetId,
  isModified,
  deletingPresetId,
  overwritingPresetIds,
  onSelect,
  onOverwrite,
  onDelete,
  onEdit,
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
      <PresetRow
        density="touch"
        preset={null}
        isSelected={selectedPresetId === null}
        isPendingDelete={false}
        isDeleting={false}
        onSelect={() => handleSelect(null)}
        onCancelDelete={() => {}}
        onConfirmDelete={() => {}}
        onDeleteClick={() => {}}
        onEditClick={() => {}}
      />

      {presets.length > 0 && (
        <>
          <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
          {presets.map((preset) => (
            <PresetRow
              key={preset.id}
              density="touch"
              preset={preset}
              isSelected={preset.id === selectedPresetId}
              isPendingDelete={pendingDeleteId === preset.id}
              isDeleting={deletingPresetId === preset.id}
              onSelect={() => handleSelect(preset.id)}
              onCancelDelete={() => setPendingDeleteId(null)}
              onConfirmDelete={() => onDelete(preset.id)}
              onDeleteClick={(e) => handleDeleteClick(preset.id, e)}
              onEditClick={(e) => handleEditClick(preset, e)}
            />
          ))}
        </>
      )}

      {/* Actions — Save/Reset live in the Toolbar row next to the trigger;
          Overwrite (only meaningful with a preset selected) stays here. */}
      {isModified && selectedPresetId !== null && (
        <>
          <div className="my-1 h-px bg-[var(--color-border-subtle)]" />
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
        </>
      )}
    </div>
  )
}
