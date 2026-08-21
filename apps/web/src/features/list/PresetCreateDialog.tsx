import { useEffect, useRef, useState } from 'react'
import { PRESET_COLORS, getContrastColor, type PresetColorId } from './presets'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/generic/textarea'
import { Modal } from '@/components/generic/modal'

interface PresetCreateDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string, description: string, color: PresetColorId) => void
  isSaving: boolean
  // When editing an existing preset, seed the form with its current values.
  initialName?: string
  initialDescription?: string
  initialColor?: PresetColorId
  title?: string
  submitLabel?: string
  // Names already taken by other presets (for duplicate detection).
  existingNames?: string[]
  // The preset's own current name — excluded from the duplicate check so rename-to-same is allowed.
  excludeName?: string
}

/**
 * Names, describes, and colours a new saved view.
 */
export function PresetCreateDialog({
  open,
  onClose,
  onSave,
  isSaving,
  initialName,
  initialDescription,
  initialColor,
  title = 'Save view as preset',
  submitLabel = 'Save preset',
  existingNames,
  excludeName,
}: PresetCreateDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName ?? '')
  const [description, setDescription] = useState(initialDescription ?? '')
  const [color, setColor] = useState<PresetColorId>(initialColor ?? 'blue')

  const trimmedName = name.trim()
  const isDuplicate =
    !!existingNames &&
    trimmedName.length > 0 &&
    existingNames.some(
      (n) => n.toLowerCase() === trimmedName.toLowerCase() && n !== excludeName
    )

  // Re-seed the form whenever the dialog opens (handles switching between
  // create mode and edit mode without unmounting).
  useEffect(() => {
    if (open) {
      setName(initialName ?? '')
      setDescription(initialDescription ?? '')
      setColor(initialColor ?? 'blue')
    }
  }, [open, initialName, initialDescription, initialColor])

  function handleSave() {
    if (!trimmedName || isDuplicate) return
    onSave(trimmedName, description.trim(), color)
  }

  // Enter submits; Escape is Modal's to handle, and it already refuses while
  // the save is in flight.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) handleSave()
  }

  const selectedColorObj = PRESET_COLORS.find((c) => c.id === color)!

  const body = (
    <div className="flex flex-col gap-3">
      {/* Name */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">Name</label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="My preset"
          className={cn(
            'h-9 rounded-md border bg-bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1',
            isDuplicate
              ? 'border-danger focus:ring-danger'
              : 'border-border focus:ring-primary'
          )}
        />
        {isDuplicate && (
          <p className="text-xs text-danger">
            A preset with this name already exists.
          </p>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-text-secondary">
          Description{' '}
          <span className="font-normal text-text-tertiary">(optional)</span>
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="A brief description of this view…"
          className="resize-none"
        />
      </div>

      {/* Color picker */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">Color</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => {
            const isSelected = c.id === color
            return (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => setColor(c.id)}
                style={{ background: c.hex }}
                className={cn(
                  'h-7 w-7 cursor-pointer rounded-full transition-transform hover:scale-110',
                  isSelected &&
                    'ring-2 ring-primary ring-offset-2 ring-offset-bg-elevated'
                )}
              />
            )
          })}
        </div>
        {/* Live preview badge */}
        <span
          className="mt-0.5 inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{
            background: selectedColorObj.hex,
            color: getContrastColor(selectedColorObj.hex),
          }}
        >
          {name.trim() || 'Preview'}
        </span>
      </div>
    </div>
  )

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={isSaving}
        className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-subtle disabled:pointer-events-none disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={!trimmedName || isDuplicate || isSaving}
        className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? 'Saving…' : submitLabel}
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isSaving}
      size="sm"
      title={title}
      autoFocusRef={nameRef}
      footer={footer}
    >
      <div className="px-5 pb-5 pt-1" onKeyDown={handleKeyDown}>
        {body}
      </div>
    </Modal>
  )
}
