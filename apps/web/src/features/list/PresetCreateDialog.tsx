import { useState } from 'react'
import { PRESET_COLORS, getContrastColor, type PresetColorId } from './presets'
import { cn } from '@/lib/utils'

interface PresetCreateDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string, description: string, color: PresetColorId) => void
  isSaving: boolean
}

export function PresetCreateDialog({
  open,
  onClose,
  onSave,
  isSaving,
}: PresetCreateDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<PresetColorId>('blue')

  if (!open) return null

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    onSave(trimmedName, description.trim(), color)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) handleSave()
    if (e.key === 'Escape') onClose()
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const selectedColorObj = PRESET_COLORS.find((c) => c.id === color)!

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-xl"
        onKeyDown={handleKeyDown}
      >
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          Save view as preset
        </h2>

        <div className="flex flex-col gap-3">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="My preset"
              className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">
              Description{' '}
              <span className="text-text-tertiary font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="A brief description of this view…"
              className="resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Color picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => {
                const isSelected = c.id === color
                const textColor = getContrastColor(c.hex)
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => setColor(c.id)}
                    style={{ background: c.hex, color: textColor }}
                    className={cn(
                      'h-7 w-7 rounded-full transition-transform hover:scale-110',
                      isSelected && 'ring-2 ring-offset-2 ring-offset-[var(--color-bg-elevated)] ring-[var(--color-primary)]'
                    )}
                  />
                )
              })}
            </div>
            {/* Preview badge */}
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

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-[var(--color-bg-subtle)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90"
          >
            {isSaving ? 'Saving…' : 'Save preset'}
          </button>
        </div>
      </div>
    </div>
  )
}
